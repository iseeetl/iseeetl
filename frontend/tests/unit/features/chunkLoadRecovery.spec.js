import { expect } from 'vitest';
import {
  createChunkLoadRecovery,
  isConfirmedChunkLoadError,
} from '@/features/chunkLoadRecovery';

const createStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    values,
  };
};

const createWindow = () => {
  const listeners = new Map();
  let reloads = 0;
  return {
    listeners,
    location: {
      reload: () => {
        reloads += 1;
      },
    },
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type) => listeners.delete(type),
    reloads: () => reloads,
  };
};

const createEvent = () => {
  let prevented = false;
  return {
    preventDefault: () => {
      prevented = true;
    },
    prevented: () => prevented,
  };
};

describe('画面の読込エラーからの復旧', () => {
  it('Viteの先行読込エラーでは復旧用の印を保存し、1回だけ再読込する', () => {
    const windowRef = createWindow();
    const storage = createStorage();
    const event = createEvent();
    const recovery = createChunkLoadRecovery({
      releaseId: 'release-a',
      windowRef,
      navigatorRef: { onLine: true },
      storage,
    });

    expect(recovery.handlePreloadError(event)).to.equal(true);
    expect(event.prevented()).to.equal(true);
    expect(windowRef.reloads()).to.equal(1);
    expect(storage.getItem(recovery.markerKey)).to.equal('attempted');
    expect([...storage.values.keys()]).to.deep.equal(['iseeetl:safe-reload:release-a']);
  });

  it('同じリリースの2回目の失敗では再読込せず復旧画面を表示する', () => {
    const windowRef = createWindow();
    const storage = createStorage({ 'iseeetl:safe-reload:release-a': 'attempted' });
    const recoveryCalls = [];
    const recovery = createChunkLoadRecovery({
      releaseId: 'release-a',
      windowRef,
      navigatorRef: { onLine: true },
      storage,
      onRecoveryRequired: (detail) => recoveryCalls.push(detail),
    });

    recovery.handleError(new Error('Failed to fetch dynamically imported module'), createEvent());

    expect(windowRef.reloads()).to.equal(0);
    expect(recoveryCalls.map(({ reason }) => reason)).to.deep.equal(['repeated']);
  });

  it('オフラインでは復旧用の印を保存せず復旧画面を表示する', () => {
    const windowRef = createWindow();
    const storage = createStorage();
    const recoveryCalls = [];
    const recovery = createChunkLoadRecovery({
      releaseId: 'release-a',
      windowRef,
      navigatorRef: { onLine: false },
      storage,
      onRecoveryRequired: (detail) => recoveryCalls.push(detail),
    });

    recovery.handlePreloadError(createEvent());

    expect(windowRef.reloads()).to.equal(0);
    expect(storage.values.size).to.equal(0);
    expect(recoveryCalls.map(({ reason }) => reason)).to.deep.equal(['offline']);
  });

  it('確認できないエラーをreload対象にしない', () => {
    const windowRef = createWindow();
    const recovery = createChunkLoadRecovery({
      releaseId: 'release-a',
      windowRef,
      navigatorRef: { onLine: true },
      storage: createStorage(),
    });

    expect(recovery.handleError(new Error('ordinary application error'), createEvent())).to.equal(false);
    expect(windowRef.reloads()).to.equal(0);
    expect(isConfirmedChunkLoadError(new Error('ChunkLoadError: Loading chunk 42 failed'))).to.equal(true);
  });

  it('アプリの表示とルート準備が完了した後、現在のリリースの復旧用の印だけを削除する', () => {
    const storage = createStorage({
      'iseeetl:safe-reload:old-release': 'attempted',
      'iseeetl:safe-reload:new-release': 'attempted',
    });
    const recovery = createChunkLoadRecovery({
      releaseId: 'new-release',
      windowRef: createWindow(),
      navigatorRef: { onLine: true },
      storage,
    });

    recovery.markApplicationReady();

    expect(storage.getItem('iseeetl:safe-reload:new-release')).to.equal(null);
    expect(storage.getItem('iseeetl:safe-reload:old-release')).to.equal('attempted');
  });

  it('開始と終了で3種類の共通リスナーを登録・解除する', () => {
    const windowRef = createWindow();
    const recovery = createChunkLoadRecovery({
      releaseId: 'release-a',
      windowRef,
      navigatorRef: { onLine: true },
      storage: createStorage(),
    });

    recovery.install();
    recovery.install();
    expect([...windowRef.listeners.keys()].sort()).to.deep.equal([
      'error',
      'unhandledrejection',
      'vite:preloadError',
    ]);

    recovery.dispose();
    expect(windowRef.listeners.size).to.equal(0);
  });
});
