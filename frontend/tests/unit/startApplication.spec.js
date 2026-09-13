import { expect, vi } from 'vitest';

import { startApplication } from '@/startApplication';

describe('アプリの起動と読込エラーからの復旧', () => {
  it('通常の起動処理と読込エラーの復旧機能を接続する', async () => {
    let recoveryOptions;
    const container = {};
    const recoveryApplication = {
      use: vi.fn(),
      mount: vi.fn(),
    };
    const chunkLoadRecovery = {
      install: vi.fn(),
      markApplicationReady: vi.fn(),
    };
    const application = {
      i18n: {},
      start: vi.fn(() => Promise.resolve()),
    };
    const runtime = startApplication({
      application,
      createRecoveryApp: vi.fn(() => recoveryApplication),
      createChunkLoadRecoveryImpl: vi.fn((options) => {
        recoveryOptions = options;
        return chunkLoadRecovery;
      }),
      documentObject: {
        body: { appendChild: vi.fn() },
        createElement: vi.fn(() => container),
        querySelector: vi.fn(() => ({})),
      },
    });

    await runtime.startPromise;
    recoveryOptions.onRecoveryRequired({ reason: 'load-error', retry: vi.fn() });

    expect(chunkLoadRecovery.install).toHaveBeenCalledOnce();
    expect(application.start).toHaveBeenCalledOnce();
    expect(chunkLoadRecovery.markApplicationReady).toHaveBeenCalledOnce();
    expect(container.id).to.equal('chunk-load-recovery');
    expect(recoveryApplication.use).toHaveBeenCalledWith(application.i18n);
    expect(recoveryApplication.mount).toHaveBeenCalledWith(container);
  });
});
