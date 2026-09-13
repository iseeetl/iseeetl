import {
  ANALYTICS_EVENTS,
  classifyAnalyticsPage,
  classifyAnalyticsVirtualPage,
  normalizeAnalyticsPageResource,
  normalizeAnalyticsResourceId,
} from './contract.js';

const readRouteName = (route) => {
  const name = route?.name;
  return typeof name === 'string' ? name : null;
};

const readRouteParameter = (route, name) => {
  try {
    const parameters = route?.params;
    if (!parameters || typeof parameters !== 'object') return null;
    const descriptor = Object.getOwnPropertyDescriptor(parameters, name);
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ? descriptor.value
      : null;
  } catch (_error) {
    return null;
  }
};

export const createPageTracker = ({
  runtime,
  browserWindow = typeof window === 'undefined' ? null : window,
  getCurrentRoute = () => null,
  requestActivation = () => false,
} = {}) => {
  if (
    !runtime ||
    typeof runtime.track !== 'function' ||
    typeof runtime.updatePageContext !== 'function'
  ) {
    throw new TypeError('createPageTracker requires analytics runtime');
  }

  let ready = false;
  let capturePending = false;
  let disposed = false;
  let generation = 0;
  let currentNavigation = null;
  let pendingNavigation = null;
  let pendingForcePageView = false;
  let lastSentUrl = null;
  let lastSentPageContext = null;
  let virtualPage = null;
  let deferredVirtualExit = null;
  const resourceTokens = new WeakMap();
  const virtualPageTokens = new WeakMap();

  const callSafely = (callback) => {
    try {
      return callback();
    } catch (_error) {
      return false;
    }
  };

  const buildPage = (route, classifyPage = classifyAnalyticsPage) => {
    try {
      const routeName = readRouteName(route);
      const classification = classifyPage(routeName);
      if (!classification || !browserWindow?.location?.origin) return null;

      let key = classification.pageGroup;
      let resourceType = null;
      let floorId = null;
      let roomId = null;
      let pagePath = classification.canonicalPath;
      if (classification.pageGroup === 'room_list') {
        resourceType = 'floor';
        floorId = normalizeAnalyticsResourceId(
          'floor',
          readRouteParameter(route, 'floor_id')
        );
        if (!floorId) return null;
        key = `${classification.pageGroup}:${floorId}`;
        pagePath = `/floor/${floorId}`;
      } else if (classification.pageGroup === 'timeline') {
        resourceType = 'room';
        floorId = normalizeAnalyticsResourceId(
          'floor',
          readRouteParameter(route, 'floor_id')
        );
        roomId = normalizeAnalyticsResourceId('room', readRouteParameter(route, 'room_id'));
        if (!floorId || !roomId) return null;
        key = `${classification.pageGroup}:${floorId}:${roomId}`;
        pagePath = `/floor/${floorId}/room/${roomId}`;
      }

      return Object.freeze({
        routeName,
        key,
        resourceType,
        floorId,
        roomId,
        pageGroup: classification.pageGroup,
        canonicalPath: classification.canonicalPath,
        pageLocation: `${browserWindow.location.origin}${pagePath}`,
      });
    } catch (_error) {
      return null;
    }
  };

  const buildParameters = (navigation) => ({
    page_group: navigation.page.pageGroup,
    page_location: navigation.page.pageLocation,
    page_title: navigation.page.pageGroup,
    ...(lastSentUrl && lastSentUrl !== navigation.page.pageLocation
      ? { page_referrer: lastSentUrl }
      : {}),
    ...(navigation.resourceContext || {}),
  });

  const buildRuntimeActivationContext = (navigation) => {
    const parameters = Object.freeze({ ...buildParameters(navigation) });
    return !navigation.sent && lastSentPageContext
      ? lastSentPageContext
      : parameters;
  };

  const createNavigation = (page) => {
    generation += 1;
    if (!virtualPage) {
      pendingNavigation = null;
      pendingForcePageView = false;
    }
    currentNavigation = {
      generation,
      key: page.key,
      page,
      confirmed: false,
      resolved: page.resourceType === null,
      resourceContext: null,
      resourceToken: null,
      onPageViewSent: null,
      sent: false,
      cancelled: false,
      transitionCheckpointSent: false,
    };
    return currentNavigation;
  };

  const ensureNavigation = (page) => {
    if (!page) return null;
    return currentNavigation?.key === page.key
      ? currentNavigation
      : createNavigation(page);
  };

  const getActiveNavigation = () => virtualPage?.navigation || currentNavigation;

  const invalidateVirtualPage = () => {
    if (!virtualPage) return null;
    const invalidated = virtualPage;
    invalidated.metadata.state = 'cancelled';
    if (pendingNavigation === invalidated.navigation) {
      pendingNavigation = null;
      pendingForcePageView = false;
    }
    virtualPage = null;
    return invalidated;
  };

  const failClosed = () => {
    ready = false;
    capturePending = false;
    pendingNavigation = null;
    pendingForcePageView = false;
    callSafely(() => runtime.pause?.());
    return false;
  };

  const send = (navigation, { forcePageView = false } = {}) => {
    if (
      disposed ||
      !ready ||
      !navigation ||
      navigation !== getActiveNavigation() ||
      !navigation.confirmed ||
      !navigation.resolved ||
      navigation.cancelled
    ) {
      return false;
    }
    const parameters = buildParameters(navigation);
    if (navigation.sent && !forcePageView) {
      if (callSafely(() => runtime.updatePageContext(parameters)) !== true) {
        return failClosed();
      }
      lastSentPageContext = Object.freeze({ ...parameters });
      pendingNavigation = null;
      pendingForcePageView = false;
      // 送信済みページの再有効化では、ページ情報だけを復元し、page_viewの送信完了通知は行わない。
      navigation.onPageViewSent = null;
      return true;
    }
    if (
      !navigation.transitionCheckpointSent &&
      lastSentPageContext &&
      callSafely(() =>
        runtime.track(ANALYTICS_EVENTS.PAGE_EXIT, lastSentPageContext)
      ) !== true
    ) {
      return failClosed();
    }
    if (lastSentPageContext) navigation.transitionCheckpointSent = true;
    if (callSafely(() => runtime.updatePageContext(parameters)) !== true) {
      return failClosed();
    }
    if (callSafely(() => runtime.track(ANALYTICS_EVENTS.PAGE_VIEW, parameters)) !== true) {
      return failClosed();
    }

    // GA4の経過時間を前のページに紐付けるため、終了通知後にページ情報を更新し、次のpage_viewを送る。
    navigation.transitionCheckpointSent = false;
    navigation.sent = true;
    pendingNavigation = null;
    pendingForcePageView = false;
    lastSentUrl = navigation.page.pageLocation;
    lastSentPageContext = Object.freeze({ ...parameters });
    const onPageViewSent = navigation.onPageViewSent;
    navigation.onPageViewSent = null;
    if (typeof onPageViewSent === 'function') callSafely(onPageViewSent);
    return true;
  };

  const requestRuntimeActivation = () => {
    if (capturePending) return true;
    const requested = callSafely(requestActivation) === true;
    capturePending = requested;
    return requested;
  };

  const clear = () => {
    generation += 1;
    ready = false;
    capturePending = false;
    invalidateVirtualPage();
    deferredVirtualExit = null;
    currentNavigation = null;
    pendingNavigation = null;
    pendingForcePageView = false;
    lastSentUrl = null;
    lastSentPageContext = null;
    return true;
  };

  const suspend = () => {
    ready = false;
    capturePending = false;
    pendingNavigation = null;
    pendingForcePageView = false;
    deferredVirtualExit = null;
    // 再描画せずに計測を再開できるよう検証済みのトークンとページ情報を保持し、無効化前の参照元は引き継がない。
    lastSentUrl = null;
    if (lastSentPageContext?.page_referrer) {
      const pageContext = { ...lastSentPageContext };
      delete pageContext.page_referrer;
      lastSentPageContext = Object.freeze(pageContext);
    }
    return true;
  };

  const restoreVirtualBackground = (endedVirtualPage) => {
    const currentPage = buildPage(callSafely(getCurrentRoute));
    if (!currentPage || currentPage.key !== endedVirtualPage.backgroundKey) {
      callSafely(() => runtime.pause?.());
      clear();
      return true;
    }

    const navigation = ensureNavigation(currentPage);
    navigation.confirmed = true;
    if (!navigation.resolved) {
      failClosed();
      return true;
    }

    if (!ready) {
      pendingNavigation = navigation;
      pendingForcePageView = endedVirtualPage.navigation.sent;
      requestRuntimeActivation();
      return true;
    }

    if (endedVirtualPage.navigation.sent) {
      send(navigation, { forcePageView: true });
      return true;
    }
    if (!navigation.sent) {
      send(navigation);
      return true;
    }
    if (callSafely(() => runtime.updatePageContext(buildParameters(navigation))) !== true) {
      failClosed();
    }
    return true;
  };

  const prepareCurrentPage = () => {
    if (disposed) return null;
    if (virtualPage) {
      const navigation = virtualPage.navigation;
      pendingNavigation = navigation.sent ? null : navigation;
      pendingForcePageView = false;
      return buildRuntimeActivationContext(navigation);
    }
    const page = buildPage(callSafely(getCurrentRoute));
    if (!page) return null;
    const navigation = ensureNavigation(page);
    navigation.confirmed = true;

    if (!navigation.resolved) {
      pendingNavigation = null;
      pendingForcePageView = false;
      return buildRuntimeActivationContext(navigation);
    }
    pendingNavigation = navigation.sent ? null : navigation;
    pendingForcePageView = false;
    return buildRuntimeActivationContext(navigation);
  };

  const handleNavigation = (route, failure = null) => {
    if (disposed) return false;
    const page = buildPage(route);
    const currentPage = buildPage(callSafely(getCurrentRoute));
    if (failure) return false;
    if (deferredVirtualExit) {
      const deferredExit = deferredVirtualExit;
      deferredVirtualExit = null;
      if (
        page &&
        currentPage &&
        currentPage.key === page.key &&
        currentPage.key === deferredExit.backgroundKey
      ) {
        restoreVirtualBackground(deferredExit);
        return false;
      }
    }
    if (virtualPage) {
      if (
        page &&
        currentPage &&
        currentPage.key === page.key &&
        currentPage.key === virtualPage.backgroundKey
      ) {
        return false;
      }
      invalidateVirtualPage();
    }
    if (!page) {
      if (currentPage) return false;
      callSafely(() => runtime.pause?.());
      clear();
      return false;
    }
    if (!currentPage) {
      callSafely(() => runtime.pause?.());
      clear();
      return false;
    }
    if (currentPage.key !== page.key) return false;

    const navigation = ensureNavigation(page);
    if (navigation.confirmed) return false;
    navigation.confirmed = true;

    if (!navigation.resolved) {
      pendingNavigation = null;
      pendingForcePageView = false;
      if (!ready) requestRuntimeActivation();
      return false;
    }
    if (ready) return send(navigation);

    pendingNavigation = navigation;
    pendingForcePageView = false;
    if (!requestRuntimeActivation()) pendingNavigation = null;
    return false;
  };

  const setReady = (
    nextReady,
    {
      discardPending = false,
      acceptPending = nextReady === true,
    } = {}
  ) => {
    if (disposed) return false;
    ready = nextReady === true;
    capturePending = ready || acceptPending === true;
    if (!ready) {
      if (discardPending) {
        pendingNavigation = null;
        pendingForcePageView = false;
      }
      return false;
    }
    const navigation = getActiveNavigation();
    const currentPage = virtualPage
      ? navigation?.page
      : buildPage(callSafely(getCurrentRoute));
    if (
      !currentPage ||
      !navigation ||
      currentPage.key !== navigation.key
    ) {
      return false;
    }
    if (!pendingNavigation) {
      return true;
    }

    const replay = pendingNavigation;
    const forcePageView = pendingForcePageView;
    pendingNavigation = null;
    pendingForcePageView = false;
    if (
      replay !== navigation ||
      currentPage.key !== replay.key
    ) {
      return false;
    }
    return send(replay, { forcePageView });
  };

  const captureResourcePage = () => {
    if (disposed) return null;
    const page = buildPage(callSafely(getCurrentRoute));
    if (!page?.resourceType) return null;
    const navigation = ensureNavigation(page);
    if (!navigation.confirmed) {
      navigation.confirmed = true;
      if (!ready) requestRuntimeActivation();
    }
    if (navigation.resourceToken) return null;

    const token = Object.freeze({});
    const metadata = {
      navigation,
      generation: navigation.generation,
      key: navigation.key,
      state: 'pending',
    };
    navigation.resourceToken = token;
    resourceTokens.set(token, metadata);
    return token;
  };

  const activateResourcePage = (token, resource, onPageViewSent = null) => {
    try {
      if (onPageViewSent !== null && typeof onPageViewSent !== 'function') return false;
      const metadata = resourceTokens.get(token);
      if (!metadata || metadata.state !== 'pending') return false;
      metadata.state = 'active';

      const navigation = metadata.navigation;
      const currentPage = buildPage(callSafely(getCurrentRoute));
      if (
        disposed ||
        navigation !== currentNavigation ||
        navigation.resourceToken !== token ||
        metadata.generation !== generation ||
        metadata.key !== navigation.key ||
        currentPage?.key !== navigation.key
      ) {
        return false;
      }

      const resourceContext = normalizeAnalyticsPageResource(
        navigation.page.pageGroup,
        resource
      );
      if (
        !resourceContext ||
        resourceContext.floor_id !== navigation.page.floorId ||
        (navigation.page.resourceType === 'room' &&
          resourceContext.room_id !== navigation.page.roomId)
      ) {
        return false;
      }

      navigation.resourceContext = resourceContext;
      navigation.resolved = true;
      navigation.cancelled = false;
      navigation.onPageViewSent = onPageViewSent;
      if (!navigation.confirmed) return false;
      if (virtualPage) {
        if (navigation.sent) navigation.onPageViewSent = null;
        return true;
      }
      if (ready) return send(navigation);

      pendingNavigation = navigation;
      pendingForcePageView = false;
      if (!requestRuntimeActivation()) pendingNavigation = null;
      return true;
    } catch (_error) {
      return false;
    }
  };

  const cancelResourcePage = (token) => {
    try {
      const metadata = resourceTokens.get(token);
      if (!metadata || metadata.state === 'cancelled') return false;
      metadata.state = 'cancelled';
      const navigation = metadata.navigation;
      if (navigation.resourceToken === token) navigation.resourceToken = null;
      if (
        disposed ||
        navigation !== currentNavigation ||
        metadata.generation !== generation
      ) {
        return true;
      }

      navigation.cancelled = true;
      navigation.resolved = false;
      navigation.resourceContext = null;
      navigation.onPageViewSent = null;
      if (pendingNavigation === navigation) pendingNavigation = null;
      if (pendingNavigation === null) pendingForcePageView = false;
      if (virtualPage) return true;
      const currentPage = buildPage(callSafely(getCurrentRoute));
      if (currentPage?.key !== navigation.key) return true;
      return true;
    } catch (_error) {
      return false;
    }
  };

  const beginVirtualPage = (routeName) => {
    try {
      if (
        disposed ||
        virtualPage ||
        deferredVirtualExit
      ) {
        return null;
      }
      const page = buildPage({ name: routeName }, classifyAnalyticsVirtualPage);
      const backgroundPage = buildPage(callSafely(getCurrentRoute));
      if (!page || page.resourceType || backgroundPage?.key === page.key) return null;

      const token = Object.freeze({});
      const navigation = {
        generation,
        key: page.key,
        page,
        confirmed: true,
        resolved: true,
        resourceContext: null,
        resourceToken: null,
        onPageViewSent: null,
        sent: false,
        cancelled: false,
        transitionCheckpointSent: false,
      };
      const metadata = {
        navigation,
        state: 'active',
      };
      virtualPage = {
        backgroundKey: backgroundPage?.key || null,
        metadata,
        navigation,
        token,
      };
      virtualPageTokens.set(token, metadata);

      if (ready) {
        send(navigation);
      } else {
        pendingNavigation = navigation;
        pendingForcePageView = false;
        if (!requestRuntimeActivation()) pendingNavigation = null;
      }
      return token;
    } catch (_error) {
      return null;
    }
  };

  const endVirtualPage = (
    token,
    {
      restore = true,
      deferUntilNavigation = false,
      navigationAlreadyChanged = false,
    } = {}
  ) => {
    try {
      const metadata = virtualPageTokens.get(token);
      if (
        !metadata ||
        metadata.state !== 'active' ||
        !virtualPage ||
        virtualPage.token !== token
      ) {
        return false;
      }

      const endedVirtualPage = virtualPage;
      metadata.state = 'ended';
      if (pendingNavigation === metadata.navigation) pendingNavigation = null;
      if (pendingNavigation === null) pendingForcePageView = false;
      virtualPage = null;
      if (restore === true) return restoreVirtualBackground(endedVirtualPage);
      if (deferUntilNavigation === true) {
        const currentPage = buildPage(callSafely(getCurrentRoute));
        if (
          navigationAlreadyChanged === true &&
          currentPage?.key === endedVirtualPage.backgroundKey
        ) {
          return restoreVirtualBackground(endedVirtualPage);
        }
        deferredVirtualExit = endedVirtualPage;
      }
      return true;
    } catch (_error) {
      return false;
    }
  };

  const restoreDeferredVirtualPage = (token) => {
    if (
      disposed ||
      !deferredVirtualExit ||
      deferredVirtualExit.token !== token
    ) {
      return false;
    }
    const deferredExit = deferredVirtualExit;
    deferredVirtualExit = null;
    restoreVirtualBackground(deferredExit);
    return true;
  };

  const dispose = () => {
    disposed = true;
    generation += 1;
    ready = false;
    capturePending = false;
    invalidateVirtualPage();
    deferredVirtualExit = null;
    currentNavigation = null;
    pendingNavigation = null;
    pendingForcePageView = false;
    lastSentUrl = null;
    lastSentPageContext = null;
  };

  return Object.freeze({
    handleNavigation,
    prepareCurrentPage,
    setReady,
    captureResourcePage,
    activateResourcePage,
    cancelResourcePage,
    beginVirtualPage,
    endVirtualPage,
    restoreDeferredVirtualPage,
    suspend,
    clear,
    dispose,
  });
};
