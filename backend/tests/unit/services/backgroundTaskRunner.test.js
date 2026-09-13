const {
  abortBackgroundTasks,
  drainBackgroundTasks,
  getPendingTaskCount,
  runBackgroundTask,
  runBackgroundSteps,
} = require('../../../services/backgroundTaskRunner');

describe('バックグラウンド処理の実行管理', () => {
  test('翻訳失敗後も解析を実行し、段階ごとに失敗を記録して完了を追跡する', async () => {
    const logger = { warn: jest.fn() };
    const calls = [];
    runBackgroundSteps('unit.steps', {
      translation: async () => { calls.push('translation'); throw new Error('translate failed'); },
      analysis: async ({ signal }) => {
        expect(signal).toBeInstanceOf(AbortSignal);
        calls.push('analysis');
        throw new Error('analysis failed');
      },
    }, { logger, context: { postId: 'post1' } });
    await drainBackgroundTasks();
    expect(calls).toEqual(['translation', 'analysis']);
    expect(logger.warn.mock.calls).toEqual([
      ['[background:unit.steps.translation] failed', { postId: 'post1', error: 'translate failed' }],
      ['[background:unit.steps.analysis] failed', { postId: 'post1', error: 'analysis failed' }],
    ]);
    expect(getPendingTaskCount()).toBe(0);
  });

  test('終了時に中断されたら次の段階を開始しない', async () => {
    const analysis = jest.fn();
    runBackgroundSteps('unit.steps.abort', {
      translation: async () => { abortBackgroundTasks(); },
      analysis,
    });
    await drainBackgroundTasks();
    expect(analysis).not.toHaveBeenCalled();
    expect(getPendingTaskCount()).toBe(0);
  });
  test('実行中の処理を追跡し、drainで完了を待つ', async () => {
    let finish;
    const task = jest.fn(() => new Promise((resolve) => { finish = resolve; }));

    runBackgroundTask('unit.wait', task);
    await new Promise((resolve) => setImmediate(resolve));

    expect(task).toHaveBeenCalledTimes(1);
    expect(getPendingTaskCount()).toBe(1);

    const drained = drainBackgroundTasks({ timeoutMs: 1000 });
    finish();
    await drained;
    expect(getPendingTaskCount()).toBe(0);
  });

  test('処理の失敗をラベルと状況付きで記録し、drainを失敗させない', async () => {
    const logger = { warn: jest.fn() };
    runBackgroundTask('unit.failure', () => Promise.reject(new Error('failed')), {
      logger,
      context: { targetId: 'target-1' },
    });

    await drainBackgroundTasks({ timeoutMs: 1000 });

    expect(logger.warn).toHaveBeenCalledWith('[background:unit.failure] failed', {
      targetId: 'target-1',
      error: 'failed',
    });
    expect(getPendingTaskCount()).toBe(0);
  });

  test('defer=falseなら呼出元へ戻る前に処理を開始する', async () => {
    const task = jest.fn().mockResolvedValue();

    runBackgroundTask('unit.immediate', task, { defer: false });

    expect(task).toHaveBeenCalledTimes(1);
    await drainBackgroundTasks({ timeoutMs: 1000 });
  });

  test('処理へAbortSignalを渡し、終了時の中断後もdrainで完了を待てる', async () => {
    const logger = { warn: jest.fn() };
    let receivedSignal;
    runBackgroundTask(
      'unit.abort',
      ({ signal }) => {
        receivedSignal = signal;
        return new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
        });
      },
      { defer: false, logger }
    );

    expect(receivedSignal).toBeInstanceOf(AbortSignal);
    expect(receivedSignal.aborted).toBe(false);
    expect(abortBackgroundTasks()).toBe(1);
    expect(receivedSignal.aborted).toBe(true);

    await drainBackgroundTasks({ timeoutMs: 1000 });
    expect(logger.warn).not.toHaveBeenCalled();
    expect(getPendingTaskCount()).toBe(0);
    expect(abortBackgroundTasks()).toBe(0);
  });

  test('開始待ちの処理が中断された場合は実行しない', async () => {
    const task = jest.fn();

    runBackgroundTask('unit.abort-before-start', task);
    expect(abortBackgroundTasks()).toBe(1);
    await drainBackgroundTasks({ timeoutMs: 1000 });

    expect(task).not.toHaveBeenCalled();
    expect(getPendingTaskCount()).toBe(0);
  });

  test('通常のdrainでは実行中の処理を中断しない', async () => {
    let finish;
    let receivedSignal;
    runBackgroundTask(
      'unit.normal-drain',
      ({ signal }) => {
        receivedSignal = signal;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
      { defer: false }
    );

    const drained = drainBackgroundTasks({ timeoutMs: 1000 });
    expect(receivedSignal.aborted).toBe(false);
    finish();
    await drained;
    expect(receivedSignal.aborted).toBe(false);
  });
});
