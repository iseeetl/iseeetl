import { expect, vi } from 'vitest';
import {
  initializeOneSignal,
  initializeOneSignalSdk,
  loadOneSignalSdk,
  ONESIGNAL_SDK_LOAD_TIMEOUT_MS,
  maybeLoginOneSignal,
  ONESIGNAL_SDK_SCRIPT_ID,
  ONESIGNAL_SDK_URL,
} from '@/utils/onesignalHelpers';

describe('OneSignalの初期化とログイン', () => {
  let originalOneSignal;
  let originalDeferred;
  let originalInitPromise;
  let originalInitQueued;
  let originalSdkPromise;

  beforeEach(() => {
    originalOneSignal = window.OneSignal;
    originalDeferred = window.OneSignalDeferred;
    originalInitPromise = window.__iseeetlOneSignalInitPromise;
    originalInitQueued = window.__iseeetlOneSignalInitQueued;
    originalSdkPromise = window.__iseeetlOneSignalSdkPromise;
  });

  afterEach(() => {
    vi.useRealTimers();
    window.OneSignal = originalOneSignal;
    window.OneSignalDeferred = originalDeferred;
    window.__iseeetlOneSignalInitPromise = originalInitPromise;
    window.__iseeetlOneSignalInitQueued = originalInitQueued;
    window.__iseeetlOneSignalSdkPromise = originalSdkPromise;
    document.getElementById(ONESIGNAL_SDK_SCRIPT_ID)?.remove();
  });

  it('公開アプリIDがある場合はOneSignalの初期化を1回だけ予約する', async () => {
    const initCalls = [];
    window.OneSignalDeferred = undefined;
    window.__iseeetlOneSignalInitPromise = undefined;
    window.__iseeetlOneSignalInitQueued = undefined;

    expect(initializeOneSignal(' app-id ')).to.equal(true);
    expect(initializeOneSignal('app-id')).to.equal(false);
    expect(window.OneSignalDeferred).to.have.lengthOf(1);

    await window.OneSignalDeferred[0]({
      init: (options) => {
        initCalls.push(options);
        return Promise.resolve();
      },
    });

    expect(initCalls).to.deep.equal([{ appId: 'app-id', notifyButton: { enable: false } }]);
    expect(window.__iseeetlOneSignalInitPromise).to.be.instanceOf(Promise);
  });

  it('公開アプリIDがなければOneSignalの初期化を予約しない', () => {
    window.OneSignalDeferred = [];
    window.__iseeetlOneSignalInitQueued = undefined;

    expect(initializeOneSignal('')).to.equal(false);
    expect(initializeOneSignal(undefined)).to.equal(false);
    expect(window.OneSignalDeferred).to.have.lengthOf(0);
  });

  it('必要なときだけSDKを読み込み、重複読込を防ぐ', async () => {
    window.__iseeetlOneSignalSdkPromise = undefined;

    const loading = loadOneSignalSdk(document, window);
    const secondLoading = loadOneSignalSdk(document, window);
    const script = document.getElementById(ONESIGNAL_SDK_SCRIPT_ID);

    expect(secondLoading).to.equal(loading);
    expect(script).not.to.equal(null);
    expect(script.src).to.equal(ONESIGNAL_SDK_URL);

    script.dispatchEvent(new Event('load'));
    expect(await loading).to.equal(true);
    expect(script.dataset.loaded).to.equal('true');
  });

  it('SDK読込に失敗した場合はスクリプト要素と失敗したPromiseを残さない', async () => {
    window.__iseeetlOneSignalSdkPromise = undefined;

    const loading = loadOneSignalSdk(document, window);
    document.getElementById(ONESIGNAL_SDK_SCRIPT_ID).dispatchEvent(new Event('error'));

    await expect(loading).rejects.toThrow('OneSignal SDK failed to load');
    expect(document.getElementById(ONESIGNAL_SDK_SCRIPT_ID)).to.equal(null);
    expect(window.__iseeetlOneSignalSdkPromise).to.equal(null);
  });

  it('SDKが応答しない場合は固定タイムアウト後に失敗として片付ける', async () => {
    vi.useFakeTimers();
    window.__iseeetlOneSignalSdkPromise = undefined;

    const loading = loadOneSignalSdk(document, window);
    const rejection = expect(loading).rejects.toThrow('OneSignal SDK load timed out');

    await vi.advanceTimersByTimeAsync(ONESIGNAL_SDK_LOAD_TIMEOUT_MS);
    await rejection;

    expect(document.getElementById(ONESIGNAL_SDK_SCRIPT_ID)).to.equal(null);
    expect(window.__iseeetlOneSignalSdkPromise).to.equal(null);
  });

  it('初期化を予約してからSDKを読み込む', async () => {
    window.OneSignalDeferred = undefined;
    window.__iseeetlOneSignalInitQueued = undefined;
    window.__iseeetlOneSignalSdkPromise = undefined;

    const initializing = initializeOneSignalSdk('app-id', window, document);
    expect(window.OneSignalDeferred).to.have.lengthOf(1);

    document.getElementById(ONESIGNAL_SDK_SCRIPT_ID).dispatchEvent(new Event('load'));
    expect(await initializing).to.equal(true);
  });

  it('公開アプリIDがなければSDKを読み込まない', async () => {
    window.OneSignalDeferred = [];
    window.__iseeetlOneSignalInitQueued = undefined;
    window.__iseeetlOneSignalSdkPromise = undefined;

    expect(await initializeOneSignalSdk('', window, document)).to.equal(false);
    expect(document.getElementById(ONESIGNAL_SDK_SCRIPT_ID)).to.equal(null);
  });

  it('OneSignal の初期化完了後にログインを呼ぶ', async () => {
    const calls = [];
    window.OneSignalDeferred = undefined;
    window.__iseeetlOneSignalInitPromise = Promise.resolve();
    const os = {
      login: (...args) => {
        calls.push(args);
        return Promise.resolve();
      },
    };

    maybeLoginOneSignal(' ext-1 ');

    expect(Array.isArray(window.OneSignalDeferred)).to.equal(true);
    expect(window.OneSignalDeferred).to.have.lengthOf(1);
    await window.OneSignalDeferred[0](os);

    expect(calls).to.deep.equal([['ext-1']]);
  });

  it('OneSignal の初期化中はログインを待機する', async () => {
    let resolveInit;
    window.OneSignalDeferred = [];
    window.__iseeetlOneSignalInitPromise = new Promise((resolve) => {
      resolveInit = resolve;
    });

    maybeLoginOneSignal('ext-2');

    const calls = [];
    const os = {
      login: (...args) => {
        calls.push(args);
        return Promise.resolve();
      },
    };
    const pendingLogin = window.OneSignalDeferred[0](os);

    expect(calls).to.deep.equal([]);

    resolveInit();
    await pendingLogin;

    expect(calls).to.deep.equal([['ext-2']]);
  });

  it('OneSignal の初期化が失敗したらログインしない', async () => {
    const calls = [];
    window.OneSignalDeferred = [];
    window.__iseeetlOneSignalInitPromise = Promise.reject(new Error('init failed'));

    maybeLoginOneSignal('ext-3');
    await window.OneSignalDeferred[0]({
      login: (...args) => {
        calls.push(args);
        return Promise.resolve();
      },
    });

    expect(calls).to.deep.equal([]);
  });

  it('OneSignal のログインが失敗しても例外を送出しない', async () => {
    const calls = [];
    window.OneSignalDeferred = [];
    window.__iseeetlOneSignalInitPromise = Promise.resolve();

    maybeLoginOneSignal('ext-4');
    await window.OneSignalDeferred[0]({
      login: (...args) => {
        calls.push(args);
        return Promise.reject(new Error('login failed'));
      },
    });

    expect(calls).to.deep.equal([['ext-4']]);
  });

  it('External IDが無ければOneSignalへログインしない', () => {
    window.OneSignalDeferred = [];
    window.__iseeetlOneSignalInitPromise = Promise.resolve();

    maybeLoginOneSignal(undefined);
    maybeLoginOneSignal('  ');

    expect(window.OneSignalDeferred).to.have.lengthOf(0);
  });
});
