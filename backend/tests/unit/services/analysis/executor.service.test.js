const { createAnalysisExecutor } = require('../../../../services/analysis/executor.service');
const { buildAnalysisSupplement } = require('../../../../services/analysis/output.service');
const { normalizeProviderText } = require('../../../../services/analysis/provider.service');
const { toOpenAIError } = require('../../../../integrations/openai/errors');

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
  afterEach(() => jest.restoreAllMocks());

  test.each([
    ['vision', 'post', null],
    ['video', 'reply', 'reply-1'],
  ])('本番の%s解析がタイムアウトしたら%sのIDと診断情報を1回だけ出力する', async (kind, sourceType, replyId) => {
    const originalMode = process.env.NODE_ENV;
    let logger;
    try {
      process.env.NODE_ENV = 'production';
      jest.isolateModules(() => { logger = require('../../../../utils/logger'); });
    } finally {
      if (originalMode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalMode;
    }
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    let now = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const dependencies = createDependencies({
      logger,
      buildSnapshot: jest.fn(async () => buildSnapshotValue({ kind, sourceType, replyId })),
      analyze: jest.fn(async () => {
        now += 20000;
        throw toOpenAIError({
          code: 'ECONNABORTED', message: 'private fixture message',
          config: { data: 'private fixture media', headers: { Authorization: 'Bearer private-fixture' } },
        }, 'OpenAI chat failed');
      }),
    });

    await expect(createAnalysisExecutor(dependencies).runSourceAnalyses({
      chatId: 'post-1', sourceType, replyId,
    })).resolves.toEqual([{ status: 'failed' }]);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('[ERROR]', 'AI_ANALYSIS_SETTING_FAILED', {
      source_type: sourceType, source_id: replyId || 'post-1', post_id: 'post-1', reply_id: replyId,
      setting_id: 'setting-1', kind, stage: 'provider', elapsed_ms: 20000,
      error_code: 'ECONNABORTED', error_type: 'Error', http_status: null, request_id: null,
    });
    expect(warnSpy).not.toHaveBeenCalled();
    expect(dependencies.analyze).toHaveBeenCalledTimes(1);
    expect(dependencies.persistResult).not.toHaveBeenCalled();
  });

  test('外部APIの失敗にHTTPステータスとリクエストIDを付ける', async () => {
    const dependencies = createDependencies({ buildSnapshot: jest.fn(async () => buildSnapshotValue({ kind: 'vision' })),
      analyze: jest.fn(async () => {
        throw toOpenAIError({ response: {
          status: 429, headers: { 'x-request-id': 'req-fixture' },
          data: { error: { type: 'rate_limit_error', code: 'rate_limit_exceeded', message: 'private fixture' } },
        } }, 'OpenAI chat failed');
      }),
    });
    await createAnalysisExecutor(dependencies).runSourceAnalyses({ chatId: 'post-1', sourceType: 'post' });
    expect(dependencies.logger.error).toHaveBeenCalledTimes(1);
    expect(dependencies.logger.error).toHaveBeenCalledWith('AI_ANALYSIS_SETTING_FAILED', expect.objectContaining({
      stage: 'provider', http_status: 429, request_id: 'req-fixture', error_code: 'rate_limit_exceeded',
    }));
    expect(JSON.stringify(dependencies.logger.error.mock.calls)).not.toContain('private fixture');
  });

  test.each([
    ['buildSnapshot', 'snapshot'],
    ['prepareInput', 'media_prepare'],
    ['inspectResult', 'before_send'],
    ['buildSupplement', 'output'],
    ['persistResult', 'persist'],
  ])('%sの例外を処理段階%sとして記録する', async (dependency, stage) => {
    const dependencies = createDependencies({
      [dependency]: jest.fn().mockRejectedValue(Object.assign(new Error('private fixture'), { code: 'FIXTURE_FAILED' })),
    });
    await expect(createAnalysisExecutor(dependencies).runSourceAnalyses({ chatId: 'post-1', sourceType: 'post' }))
      .resolves.toEqual([{ status: 'failed' }]);
    expect(dependencies.logger.error).toHaveBeenCalledTimes(1);
    expect(dependencies.logger.error).toHaveBeenCalledWith('AI_ANALYSIS_SETTING_FAILED', expect.objectContaining({
      stage, error_code: 'FIXTURE_FAILED', elapsed_ms: expect.any(Number),
    }));
    expect(JSON.stringify(dependencies.logger.error.mock.calls)).not.toContain('private fixture');
  });

  test('一時ファイルの削除失敗を解析結果の保存失敗と区別する', async () => {
    const dependencies = createDependencies({
      prepareInput: jest.fn(async (_options, callback) => {
        await callback(null);
        throw Object.assign(new Error('cleanup failed'), { code: 'AI_ANALYSIS_MEDIA_CLEANUP_FAILED' });
      }),
    });
    await createAnalysisExecutor(dependencies).runSourceAnalyses({ chatId: 'post-1', sourceType: 'post' });
    expect(dependencies.persistResult).toHaveBeenCalledTimes(1);
    expect(dependencies.logger.error).toHaveBeenCalledWith('AI_ANALYSIS_SETTING_FAILED', expect.objectContaining({ stage: 'media_cleanup' }));
  });

  test('設定検索の失敗もエラーとして記録し、解析は実行しない', async () => {
    const dependencies = createDependencies({ listSettingIds: jest.fn().mockRejectedValue(new Error('private fixture')) });
    await expect(createAnalysisExecutor(dependencies).runSourceAnalyses({ chatId: 'post-1', sourceType: 'post' }))
      .resolves.toEqual([{ status: 'failed' }]);
    expect(dependencies.analyze).not.toHaveBeenCalled();
    expect(dependencies.logger.error).toHaveBeenCalledTimes(1);
    expect(dependencies.logger.error).toHaveBeenCalledWith('AI_ANALYSIS_SOURCE_FAILED', expect.objectContaining({
      post_id: 'post-1', stage: 'settings_lookup',
    }));
  });

  test.each(['', '界'.repeat(301)])('外部APIの応答が無効な場合は本文を残さず理由を記録する（%#.）', async (output) => {
    const dependencies = createDependencies({ buildSnapshot: jest.fn(async () => buildSnapshotValue({ kind: 'vision' })), analyze: jest.fn(async () => normalizeProviderText(output)) });
    await createAnalysisExecutor(dependencies).runSourceAnalyses({ chatId: 'post-1', sourceType: 'post' });
    expect(dependencies.persistResult).not.toHaveBeenCalled();
    expect(dependencies.logger.error).toHaveBeenCalledTimes(1);
    expect(dependencies.logger.error).toHaveBeenCalledWith('AI_ANALYSIS_OUTPUT_INVALID', expect.objectContaining({
      stage: 'output_validation', reason: output ? 'too_long' : 'empty',
    }));
    expect(dependencies.logger.warn).not.toHaveBeenCalled();
  });

  test('付加情報の文字数超過はERRORを重複させず、結果を保存しない', async () => {
    const dependencies = createDependencies({
      buildSnapshot: jest.fn(async () => buildSnapshotValue({ kind: 'vision', triggerTag: { _id: 'tag-1', name: '界'.repeat(100) } })),
      analyze: jest.fn(async () => '界'.repeat(300)),
      buildSupplement: buildAnalysisSupplement,
    });
    await expect(createAnalysisExecutor(dependencies).runSourceAnalyses({ chatId: 'post-1', sourceType: 'post' }))
      .resolves.toEqual([{ status: 'invalid-output' }]);
    expect(dependencies.persistResult).not.toHaveBeenCalled();
    expect(dependencies.logger.error).toHaveBeenCalledTimes(1);
    expect(dependencies.logger.error).toHaveBeenCalledWith('AI_ANALYSIS_OUTPUT_INVALID', expect.objectContaining({
      stage: 'output_validation', reason: 'base_utf16_units', post_id: 'post-1', elapsed_ms: expect.any(Number),
    }));
  });

  test.each(['created', 'skipped', 'idempotent', 'stale', 'deleted', 'missing-source'])('%sを失敗として記録しない', async (status) => {
    const dependencies = createDependencies({
      ...(status === 'skipped' ? { buildSnapshot: jest.fn(async () => null) } : {}),
      inspectResult: jest.fn(async () => status === 'created' ? 'create' : status),
    });
    await createAnalysisExecutor(dependencies).runSourceAnalyses({ chatId: 'post-1', sourceType: 'post' });
    expect(dependencies.logger.error).not.toHaveBeenCalled();
    expect(dependencies.logger.warn).not.toHaveBeenCalled();
  });

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
      buildSnapshot: jest.fn(async ({ settingId }) => buildSnapshotValue({ settingId, kind: 'vision' })),
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
    expect(dependencies.logger.error).toHaveBeenCalledWith(
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
    expect(dependencies.logger.error).not.toHaveBeenCalled();
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
        ...(kind === 'conversation' ? { maxAnswerUtf16: 1996, previousAnswer: undefined, onResponse: expect.any(Function) } : {}),
      });
      expect(dependencies.persistResult).toHaveBeenCalledWith(
        expect.objectContaining({ snapshot, supplement: expect.any(Object) })
      );
    }
  );
});


describe('会話の保存上限・短縮・失敗表示', () => {
  const run = (dependencies) => createAnalysisExecutor(dependencies).runSourceAnalyses({ chatId: 'post-1', sourceType: 'post' });
  test.each(['a', '界', '😀'])('接頭辞込み2000 UTF-16単位まで保存: %s', async (character) => {
    const answer = character.repeat(1996 / character.length);
    const dependencies = createDependencies({ analyze: jest.fn(async () => answer), buildSupplement: buildAnalysisSupplement });
    await run(dependencies);
    expect(dependencies.analyze).toHaveBeenCalledTimes(1);
    expect(dependencies.persistResult.mock.calls[0][0].supplement.content).toBe('#相談 ' + answer);
    expect(dependencies.persistResult.mock.calls[0][0].supplement.content.length).toBe(2000);
  });
  test.each(['ja', 'en'])('長い回答だけ1回短縮。元の質問・指示・言語を維持: %s', async (lang) => {
    const original = buildSnapshotValue();
    original.source.lang = lang;
    original.source.content = 'Can I hide AI information for image analysis but keep information added by people? Will this setting also be saved on another phone?';
    original.triggerTag.translations = [{ lang: 'en', name: 'Help' }];
    const dependencies = createDependencies({
      buildSnapshot: jest.fn(async () => original),
      analyze: jest.fn().mockResolvedValueOnce('a'.repeat(2450)).mockResolvedValueOnce('Both answers.'),
      buildSupplement: buildAnalysisSupplement,
    });
    await run(dependencies);
    expect(dependencies.analyze).toHaveBeenCalledTimes(2);
    expect(dependencies.analyze.mock.calls[1][0]).toMatchObject({
      sourceText: original.source.content, additionalPrompt: original.prompt,
      language: lang, previousAnswer: 'a'.repeat(2450), maxAnswerUtf16: lang === 'ja' ? 1996 : 1994,
    });
    expect(dependencies.persistResult).toHaveBeenCalledTimes(1);
    expect(dependencies.persistResult.mock.calls[0][0].supplement.content).toContain('Both answers.');
  });
  test.each(['empty', 'long', 'http', 'timeout', 'retry-empty', 'retry-http'])('%sは日英の固定案内、無制限再試行なし', async (mode) => {
    const analyze = jest.fn();
    if (mode === 'empty') analyze.mockResolvedValue('');
    if (mode === 'long') analyze.mockResolvedValue('a'.repeat(2450));
    if (mode === 'http' || mode === 'timeout') analyze.mockRejectedValue(Object.assign(new Error('private response'), { code: mode === 'timeout' ? 'ECONNABORTED' : 'HTTP_FAILED' }));
    if (mode === 'retry-empty') analyze.mockResolvedValueOnce('a'.repeat(2450)).mockResolvedValueOnce('');
    if (mode === 'retry-http') analyze.mockResolvedValueOnce('a'.repeat(2450)).mockRejectedValueOnce(new Error('private response'));
    const dependencies = createDependencies({ analyze, buildSupplement: buildAnalysisSupplement });
    await run(dependencies);
    expect(analyze).toHaveBeenCalledTimes(mode === 'long' || mode.startsWith('retry-') ? 2 : 1);
    const supplement = dependencies.persistResult.mock.calls[0][0].supplement;
    expect(supplement.content).toBe('#相談 AIの補足情報を生成できませんでした。');
    expect(supplement.translations[0].content).toBe('#相談 Could not generate AI supplementary information.');
    expect(JSON.stringify(dependencies.logger.error.mock.calls)).not.toContain('private response');
  });
  test.each(['sourceRevision', 'settingRevision', 'deleted', 'aborted', 'idempotent'])('短縮直前の%sを再確認し、再送・保存しない', async (change) => {
    const controller = new AbortController();
    const dependencies = createDependencies({
      analyze: jest.fn(async () => { if (change === 'aborted') controller.abort(); return 'a'.repeat(2450); }),
      buildSnapshot: jest.fn().mockResolvedValueOnce(buildSnapshotValue()).mockResolvedValueOnce(buildSnapshotValue())
        .mockResolvedValueOnce(change === 'deleted' ? null : buildSnapshotValue({ [change]: 99 })),
      inspectResult: jest.fn().mockResolvedValueOnce('create').mockResolvedValueOnce(change === 'idempotent' ? 'idempotent' : 'create'),
    });
    await createAnalysisExecutor(dependencies).runSourceAnalyses({ chatId: 'post-1', sourceType: 'post', signal: controller.signal });
    expect(dependencies.analyze).toHaveBeenCalledTimes(1);
    expect(dependencies.persistResult).not.toHaveBeenCalled();
  });
});
