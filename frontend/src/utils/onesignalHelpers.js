export const ONESIGNAL_SDK_URL = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
export const ONESIGNAL_SDK_SCRIPT_ID = 'iseeetl-onesignal-sdk';
export const ONESIGNAL_SDK_LOAD_TIMEOUT_MS = 5000;

export function initializeOneSignal(
  appId = import.meta.env.VITE_ONESIGNAL_APP_ID,
  windowRef = typeof window === 'undefined' ? null : window
) {
  const normalizedAppId = appId == null ? '' : String(appId).trim();
  if (!windowRef || !normalizedAppId || windowRef.__iseeetlOneSignalInitQueued) return false;

  windowRef.__iseeetlOneSignalInitQueued = true;
  windowRef.OneSignalDeferred = windowRef.OneSignalDeferred || [];
  windowRef.OneSignalDeferred.push(async (oneSignal) => {
    if (!windowRef.__iseeetlOneSignalInitPromise) {
      windowRef.__iseeetlOneSignalInitPromise = Promise.resolve().then(() =>
        oneSignal.init({
          appId: normalizedAppId,
          notifyButton: { enable: false },
        })
      );
    }
    await windowRef.__iseeetlOneSignalInitPromise;
  });
  return true;
}

export function loadOneSignalSdk(
  documentRef = typeof document === 'undefined' ? null : document,
  windowRef = typeof window === 'undefined' ? null : window
) {
  if (!documentRef || !windowRef) return Promise.resolve(false);
  if (windowRef.__iseeetlOneSignalSdkPromise) return windowRef.__iseeetlOneSignalSdkPromise;

  const existingScript = documentRef.getElementById(ONESIGNAL_SDK_SCRIPT_ID);
  if (existingScript?.dataset?.loaded === 'true') return Promise.resolve(true);

  const script = existingScript || documentRef.createElement('script');
  if (!existingScript) {
    script.id = ONESIGNAL_SDK_SCRIPT_ID;
    script.src = ONESIGNAL_SDK_URL;
    script.defer = true;
  }

  const loading = new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId;

    const cleanup = () => {
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
      windowRef.clearTimeout(timeoutId);
    };
    const settle = (callback) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const handleLoad = () => {
      settle(() => {
        script.dataset.loaded = 'true';
        resolve(true);
      });
    };
    const handleError = () => {
      settle(() => {
        if (windowRef.__iseeetlOneSignalSdkPromise === loading) {
          windowRef.__iseeetlOneSignalSdkPromise = null;
        }
        script.remove();
        reject(new Error('OneSignal SDK failed to load'));
      });
    };
    const handleTimeout = () => {
      settle(() => {
        if (windowRef.__iseeetlOneSignalSdkPromise === loading) {
          windowRef.__iseeetlOneSignalSdkPromise = null;
        }
        script.remove();
        reject(new Error('OneSignal SDK load timed out'));
      });
    };

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
    timeoutId = windowRef.setTimeout(handleTimeout, ONESIGNAL_SDK_LOAD_TIMEOUT_MS);
    if (!existingScript) documentRef.head.appendChild(script);
  });

  windowRef.__iseeetlOneSignalSdkPromise = loading;
  return loading;
}

export async function initializeOneSignalSdk(
  appId = import.meta.env.VITE_ONESIGNAL_APP_ID,
  windowRef = typeof window === 'undefined' ? null : window,
  documentRef = typeof document === 'undefined' ? null : document
) {
  const queued = initializeOneSignal(appId, windowRef);
  if (!queued && !windowRef?.__iseeetlOneSignalInitQueued) return false;

  return loadOneSignalSdk(documentRef, windowRef);
}

export function maybeLoginOneSignal(extId) {
  const normalizedExternalId = extId == null ? '' : String(extId).trim();
  if (!normalizedExternalId) return;

  try {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OS) => {
      try {
        if (!window.__iseeetlOneSignalInitPromise) return;
        await window.__iseeetlOneSignalInitPromise;
        await OS.login(normalizedExternalId);
      } catch (e) {
        // OneSignalの連携に失敗しても、アプリへのログインは継続する。
        void e;
      }
    });
  } catch (e) {
    // OneSignalの処理登録に失敗しても、ログインを妨げない。
    void e;
  }
}
