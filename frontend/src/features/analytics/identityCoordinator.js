const ANALYTICS_USER_ID_PATTERN = /^ga1_[a-f\d]{64}$/;

export const normalizeAnalyticsIdentityResponse = (response) => {
  const data = response?.data;
  if (
    !data ||
    typeof data !== 'object' ||
    Object.keys(data).length !== 3 ||
    !ANALYTICS_USER_ID_PATTERN.test(data.analytics_user_id) ||
    data.visitor_type !== 'registered' ||
    data.identity_version !== 'v1'
  ) {
    throw new TypeError('analytics identity response is invalid');
  }
  return Object.freeze({
    userId: data.analytics_user_id,
    visitorType: data.visitor_type,
    version: data.identity_version,
  });
};

const readSubject = (store) => {
  const getters = store?.getters || {};
  if (getters.userIsLogin === true) {
    if (!getters.userToken || !getters.userId) {
      return { type: 'pending', key: 'pending:registered', token: null };
    }
    return {
      type: 'registered',
      key: `registered:${String(getters.userId || '')}`,
      token: getters.userToken,
    };
  }
  return { type: 'guest', key: 'guest', token: null };
};

export const createIdentityCoordinator = ({
  store,
  fetchIdentity,
  runtime,
  pageTracker,
  isAvailable,
  AbortControllerImpl = globalThis.AbortController,
} = {}) => {
  if (!store || typeof fetchIdentity !== 'function' || !runtime) {
    throw new TypeError('createIdentityCoordinator requires store, API, and runtime');
  }

  let observing = false;
  let disposed = false;
  let generation = 0;
  let activeSubjectKey = null;
  let activeIdentity = null;
  let currentRequest = null;
  let unsubscribe = null;
  let observedLifecycleKey = null;

  const callSafely = (callback) => {
    try {
      return callback();
    } catch (_error) {
      return false;
    }
  };

  const readLifecycleKey = () => {
    const available = isAvailable?.() === true;
    return `${available ? 'available' : 'unavailable'}:${readSubject(store).key}`;
  };

  const invalidate = () => {
    generation += 1;
    if (currentRequest) currentRequest.abort();
    currentRequest = null;
  };

  const markUnavailable = () => {
    invalidate();
    activeSubjectKey = null;
    const paused = callSafely(() => runtime.pause?.()) !== false;
    const hadRegisteredUserId = callSafely(() => runtime.hasRegisteredUserId?.()) === true;
    const userIdCleared =
      !hadRegisteredUserId || callSafely(() => runtime.clearUserIdentity?.()) === true;
    const pageContextCleared = callSafely(() => runtime.clearPageContext?.()) !== false;
    activeIdentity = null;
    callSafely(() =>
      pageTracker?.setReady?.(false, { discardPending: true, acceptPending: false })
    );
    callSafely(() => pageTracker?.suspend?.());
    return paused && userIdCleared && pageContextCleared;
  };

  const synchronize = async () => {
    if (!observing || disposed) return false;
    if (isAvailable?.() !== true) {
      markUnavailable();
      return false;
    }

    const subject = readSubject(store);
    if (subject.type === 'pending') {
      markUnavailable();
      return false;
    }
    if (
      activeSubjectKey === subject.key &&
      callSafely(() => runtime.isReady?.()) === true
    ) return true;

    invalidate();
    const requestGeneration = generation;
    activeSubjectKey = null;
    callSafely(() => runtime.pause?.());
    callSafely(() =>
      pageTracker?.setReady?.(false, { discardPending: false, acceptPending: true })
    );
    let pageContext = callSafely(() => pageTracker?.prepareCurrentPage?.());
    if (!pageContext) {
      markUnavailable();
      return false;
    }

    if (subject.type === 'guest') {
      if (
        callSafely(() => runtime.hasRegisteredUserId?.()) === true &&
        callSafely(() => runtime.clearUserIdentity?.()) !== true
      ) {
        markUnavailable();
        return false;
      }
      activeIdentity = Object.freeze({ visitorType: 'guest' });
      const activated = await Promise.resolve(
        callSafely(() => runtime.resume?.({ pageContext }))
      ).catch(() => false);
      if (disposed || requestGeneration !== generation || readSubject(store).key !== subject.key) {
        return false;
      }
      if (activated !== true) {
        markUnavailable();
        return false;
      }
      activeSubjectKey = subject.key;
      if (callSafely(() => pageTracker?.setReady?.(true)) !== true) {
        markUnavailable();
        return false;
      }
      return true;
    }

    const controller = AbortControllerImpl ? new AbortControllerImpl() : null;
    currentRequest = controller;
    try {
      const response = await fetchIdentity({ signal: controller?.signal });
      const identity = normalizeAnalyticsIdentityResponse(response);
      if (
        disposed ||
        requestGeneration !== generation ||
        readSubject(store).key !== subject.key
      ) {
        return false;
      }
      currentRequest = null;
      activeIdentity = identity;
      pageContext = callSafely(() => pageTracker?.prepareCurrentPage?.());
      if (!pageContext) {
        markUnavailable();
        return false;
      }
      const activated = await Promise.resolve(
        callSafely(() => runtime.resume?.({ pageContext }))
      ).catch(() => false);
      if (disposed || requestGeneration !== generation || readSubject(store).key !== subject.key) {
        return false;
      }
      if (activated !== true) {
        markUnavailable();
        return false;
      }
      activeSubjectKey = subject.key;
      if (callSafely(() => pageTracker?.setReady?.(true)) !== true) {
        markUnavailable();
        return false;
      }
      return true;
    } catch {
      if (!disposed && requestGeneration === generation) markUnavailable();
      return false;
    }
  };

  const observe = () => {
    if (disposed) return false;
    if (observing) return true;
    observing = true;
    observedLifecycleKey = readLifecycleKey();
    if (typeof store.subscribe === 'function') {
      unsubscribe = store.subscribe(() => {
        const nextLifecycleKey = readLifecycleKey();
        if (nextLifecycleKey === observedLifecycleKey) return;
        observedLifecycleKey = nextLifecycleKey;
        if (isAvailable?.() === true) {
          void synchronize();
        } else {
          markUnavailable();
        }
      });
    }
    return true;
  };

  const start = () => {
    if (!observe()) return Promise.resolve(false);
    return synchronize();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    invalidate();
    callSafely(() => unsubscribe?.());
    unsubscribe = null;
    callSafely(() => runtime.pause?.());
    callSafely(() => runtime.clearUserIdentity?.());
    activeIdentity = null;
    callSafely(() => pageTracker?.dispose?.());
  };

  return Object.freeze({
    start,
    observe,
    synchronize,
    markUnavailable,
    dispose,
    getIdentity: () => activeIdentity,
    isObserving: () => observing && !disposed,
  });
};
