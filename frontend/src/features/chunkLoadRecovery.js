const markerPrefix = 'iseeetl:safe-reload:';
const markerValue = 'attempted';
const confirmedChunkErrorPatterns = [
  /ChunkLoadError/iu,
  /Loading chunk [^ ]+ failed/iu,
  /Failed to fetch dynamically imported module/iu,
  /Importing a module script failed/iu,
];

const errorText = (error) => {
  if (!error) return '';
  if (typeof error === 'string') return error;
  return [error.name, error.message].filter(Boolean).join(': ');
};

export const isConfirmedChunkLoadError = (error) =>
  confirmedChunkErrorPatterns.some((pattern) => pattern.test(errorText(error)));

export const createChunkLoadRecovery = ({
  releaseId = __ISEEETL_RELEASE_ID__,
  windowRef = typeof window === 'undefined' ? null : window,
  navigatorRef = typeof navigator === 'undefined' ? null : navigator,
  storage = typeof sessionStorage === 'undefined' ? null : sessionStorage,
  onRecoveryRequired = () => {},
} = {}) => {
  const markerKey = `${markerPrefix}${String(releaseId)}`;
  let installed = false;

  const preventDefault = (event) => {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
  };

  const requireLocalRecovery = (reason, event) => {
    preventDefault(event);
    onRecoveryRequired({ reason, retry });
    return true;
  };

  const attemptReload = (event) => {
    if (!windowRef || !windowRef.location || typeof windowRef.location.reload !== 'function') {
      return requireLocalRecovery('unavailable', event);
    }
    if (navigatorRef && navigatorRef.onLine === false) {
      return requireLocalRecovery('offline', event);
    }
    try {
      if (!storage || storage.getItem(markerKey) === markerValue) {
        return requireLocalRecovery('repeated', event);
      }
      storage.setItem(markerKey, markerValue);
    } catch {
      return requireLocalRecovery('unavailable', event);
    }
    preventDefault(event);
    windowRef.location.reload();
    return true;
  };

  const handlePreloadError = (event) => attemptReload(event);
  const handleError = (error, event) =>
    isConfirmedChunkLoadError(error) ? attemptReload(event) : false;
  const retry = () => {
    if (windowRef && windowRef.location && typeof windowRef.location.reload === 'function') {
      windowRef.location.reload();
    }
  };
  const markApplicationReady = () => {
    try {
      if (storage) storage.removeItem(markerKey);
    } catch {
      // ブラウザの保存領域を利用できなくても、起動済みのアプリは動作を続ける。
    }
  };

  const onPreloadError = (event) => handlePreloadError(event);
  const onWindowError = (event) => handleError(event && event.error, event);
  const onUnhandledRejection = (event) => handleError(event && event.reason, event);
  const install = () => {
    if (!windowRef || installed) return;
    windowRef.addEventListener('vite:preloadError', onPreloadError);
    windowRef.addEventListener('error', onWindowError);
    windowRef.addEventListener('unhandledrejection', onUnhandledRejection);
    installed = true;
  };
  const dispose = () => {
    if (!windowRef || !installed) return;
    windowRef.removeEventListener('vite:preloadError', onPreloadError);
    windowRef.removeEventListener('error', onWindowError);
    windowRef.removeEventListener('unhandledrejection', onUnhandledRejection);
    installed = false;
  };

  return {
    markerKey,
    handlePreloadError,
    handleError,
    install,
    dispose,
    retry,
    markApplicationReady,
  };
};
