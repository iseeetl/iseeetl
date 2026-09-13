const { createAnalysisExecutor } = require('../../../../services/analysis/executor.service');

const buildSnapshotValue = (overrides = {}) => ({
  sourceType: 'post',
  chatId: 'post-1',
  replyId: null,
  sourceRevision: 3,
  settingId: 'setting-1',
  settingRevision: 2,
  kind: 'conversation',
  prompt: 'prompt',
  resultUserId: 'user-1',
  triggerTag: { _id: 'tag-1', name: '相談', translations: [] },
  targetLangs: [],
  source: {
    _id: 'post-1',
    floor: 'floor-1',
    room: 'room-1',
    content: 'source',
    lang: 'ja',
    image_name: null,
    video_name: null,
    audio_name: null,
  },
  ...overrides,
});

const createDependencies = (overrides = {}) => ({
  executionEnabled: jest.fn(() => true),
  listSettingIds: jest.fn(async () => ['setting-1']),
  buildSnapshot: jest.fn(async () => buildSnapshotValue()),
  prepareInput: jest.fn(async (_options, callback) => callback(null)),
  analyze: jest.fn(async () => 'result'),
  buildSupplement: jest.fn(async ({ snapshot }) => ({
    content: 'result',
    meta: { analysis_setting_revision: snapshot.settingRevision },
  })),
  inspectResult: jest.fn(async () => 'create'),
  persistResult: jest.fn(async () => ({ status: 'created' })),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  ...overrides,
});

describe('AI解析の実行制御', () => {
  test('機能が無効または準備未完了なら設定検索も外部サービスの処理も行わない', async () => {
    const dependencies = createDependencies({ executionEnabled: jest.fn(() => false) });
    const executor = createAnalysisExecutor(dependencies);

    await expect(
      executor.runSourceAnalyses({ chatId: 'post-1', sourceType: 'post' })
    ).resolves.toEqual([]);
    expect(dependencies.listSettingIds).not.toHaveBeenCalled();
    expect(dependencies.analyze).not.toHaveBeenCalled();
  });

  test('1件の解析対象に一致する設定を所定の検索順で逐次実行する', async () => {
    const order = [];
    let active = 0;
    let maxActive = 0;
    const dependencies = createDependencies({
      listSettingIds: jest.fn(async () => ['setting-2', 'setting-1']),
      buildSnapshot: jest.fn(async ({ settingId }) =>
        buildSnapshotValue({ settingId, kind: settingId === 'setting-1' ? 'vision' : 'speech' })
      ),
      analyze: jest.fn(async ({ kind }) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        order.push(`start:${kind}`);
        await Promise.resolve();
        order.push(`end:${kind}`);
        active -= 1;
        return kind;
      }),
    });
    const executor = createAnalysisExecutor(dependencies);

    await executor.runSourceAnalyses({ chatId: 'post-1', sourceType: 'post' });

    expect(order).toEqual(['start:speech', 'end:speech', 'start:vision', 'end:vision']);
    expect(maxActive).toBe(1);
    expect(dependencies.persistResult).toHaveBeenCalledTimes(2);
  });

  test('1件の設定が失敗しても後続の設定を実行する', async () => {
    const dependencies = createDependencies({
      listSettingIds: jest.fn(async () => ['bad', 'good']),
      buildSnapshot: jest.fn(async ({ settingId }) => buildSnapshotValue({ settingId })),
      analyze: jest
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error('provider failed'), { code: 'PROVIDER_FAILED' }))
        .mockResolvedValueOnce('ok'),
    });
    const executor = createAnalysisExecutor(dependencies);

    await expect(
      executor.runSourceAnalyses({ chatId: 'post-1', sourceType: 'post' })
    ).resolves.toEqual([{ status: 'failed' }, { status: 'created' }]);
    expect(dependencies.analyze).toHaveBeenCalledTimes(2);
    expect(dependencies.logger.warn).toHaveBeenCalledWith(
      'AI_ANALYSIS_SETTING_FAILED',
      expect.objectContaining({ setting_id: 'bad', error_code: 'PROVIDER_FAILED' })
    );
  });

  test('AbortErrorでは再試行せず、後続の設定も実行しない', async () => {
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const dependencies = createDependencies({
      listSettingIds: jest.fn(async () => ['first', 'second']),
      buildSnapshot: jest.fn(async ({ settingId }) => buildSnapshotValue({ settingId })),
      analyze: jest.fn(async () => {
        throw abortError;
      }),
    });
    const executor = createAnalysisExecutor(dependencies);

    await expect(
      executor.runSourceAnalyses({ chatId: 'post-1', sourceType: 'post' })
    ).resolves.toEqual([]);
    expect(dependencies.analyze).toHaveBeenCalledTimes(1);
    expect(dependencies.logger.warn).not.toHaveBeenCalled();
  });

  test('メディア準備中に解析対象か設定が変わったら外部サービスへ送信しない', async () => {
    const dependencies = createDependencies({
      buildSnapshot: jest
        .fn()
        .mockResolvedValueOnce(buildSnapshotValue())
        .mockResolvedValueOnce(buildSnapshotValue({ sourceRevision: 4 })),
    });
    const executor = createAnalysisExecutor(dependencies);

    await expect(
      executor.runSourceAnalyses({ chatId: 'post-1', sourceType: 'post' })
    ).resolves.toEqual([{ status: 'changed-before-send' }]);
    expect(dependencies.analyze).not.toHaveBeenCalled();
    expect(dependencies.persistResult).not.toHaveBeenCalled();
  });

  test('参照情報の最終確認と外部サービスへの送信開始を同じロック内で行う', async () => {
    let locked = false;
    const withSendLock = jest.fn(async (task) => {
      locked = true;
      try {
        const send = await task();
        expect(dependencies.analyze).toHaveBeenCalledTimes(1);
        return send;
      } finally {
        locked = false;
      }
    });
    const dependencies = createDependencies({
      withSendLock,
      analyze: jest.fn(() => {
        expect(locked).toBe(true);
        return Promise.resolve('result');
      }),
    });
    const executor = createAnalysisExecutor(dependencies);

    await executor.runSourceAnalyses({ chatId: 'post-1', sourceType: 'post' });

    expect(withSendLock).toHaveBeenCalledTimes(1);
    expect(dependencies.persistResult).toHaveBeenCalledTimes(1);
  });

  test.each(['vision', 'audioScene', 'speech', 'video', 'conversation'])(
    '%sは変更できない送信時点の情報を外部サービスと結果保存へ渡す',
    async (kind) => {
      const snapshot = buildSnapshotValue({ kind });
      const dependencies = createDependencies({
        buildSnapshot: jest.fn(async () => snapshot),
      });
      const executor = createAnalysisExecutor(dependencies);
      const signal = new AbortController().signal;

      await executor.runSourceAnalyses({
        chatId: 'post-1',
        sourceType: 'post',
        mediaPath: '/media',
        signal,
      });

      expect(dependencies.prepareInput).toHaveBeenCalledWith(
        { kind, mediaRoot: '/media', source: snapshot.source, signal },
        expect.any(Function)
      );
      expect(dependencies.analyze).toHaveBeenCalledWith({
        kind,
        sourceText: 'source',
        language: 'ja',
        additionalPrompt: 'prompt',
        media: null,
        signal,
      });
      expect(dependencies.persistResult).toHaveBeenCalledWith(
        expect.objectContaining({ snapshot, supplement: expect.any(Object) })
      );
    }
  );
});
