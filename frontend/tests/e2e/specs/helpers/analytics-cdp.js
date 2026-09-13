const E2E_ANALYTICS_MEASUREMENT_ID = 'G-E2E0000000';
const E2E_GOOGLE_TAG_URL =
  `https://www.googletagmanager.com/gtag/js?id=${E2E_ANALYTICS_MEASUREMENT_ID}`;

const GOOGLE_TAG_HOST = 'www.googletagmanager.com';
const GOOGLE_TAG_PATH = '/gtag/js';
const GOOGLE_ANALYTICS_HOST_SUFFIX = '.google-analytics.com';
const GOOGLE_ANALYTICS_COLLECT_PATH = '/g/collect';
const ANALYTICS_CONFIG_PATH = '/api/analytics/config';
const ANALYTICS_IDENTITY_PATH = '/api/analytics/identity';
const FETCH_PATTERNS = Object.freeze([
  Object.freeze({ urlPattern: '*://www.googletagmanager.com/gtag/js*', requestStage: 'Request' }),
  Object.freeze({ urlPattern: '*://www.google-analytics.com/g/collect*', requestStage: 'Request' }),
  Object.freeze({ urlPattern: '*://analytics.google.com/g/collect*', requestStage: 'Request' }),
  Object.freeze({ urlPattern: '*://*.google-analytics.com/g/collect*', requestStage: 'Request' }),
]);

const parseUrl = (value) => {
  try {
    return new URL(String(value || ''));
  } catch (_error) {
    return null;
  }
};

const classifyAnalyticsRequest = (rawUrl) => {
  const url = parseUrl(rawUrl);
  if (!url) return 'unrelated';

  if (url.hostname === GOOGLE_TAG_HOST && url.pathname === GOOGLE_TAG_PATH) {
    return rawUrl === E2E_GOOGLE_TAG_URL ? 'dummy-tag' : 'unexpected-tag';
  }

  const isAnalyticsHost =
    url.hostname === 'analytics.google.com' ||
    url.hostname === 'www.google-analytics.com' ||
    url.hostname.endsWith(GOOGLE_ANALYTICS_HOST_SUFFIX);
  if (isAnalyticsHost && url.pathname === GOOGLE_ANALYTICS_COLLECT_PATH) {
    return 'collection';
  }

  return 'unrelated';
};

const classifyAnalyticsIdentityRequest = (rawUrl, method, applicationOrigin) => {
  const url = parseUrl(rawUrl);
  if (!url || url.origin !== applicationOrigin || url.pathname !== ANALYTICS_IDENTITY_PATH) {
    return 'unrelated';
  }
  return method === 'GET' && !url.search && !url.hash ? 'identity' : 'unexpected-identity';
};

const isAnalyticsIdentityRequest = (rawUrl, applicationOrigin, method = 'GET') =>
  classifyAnalyticsIdentityRequest(rawUrl, method, applicationOrigin) === 'identity';

const classifyAnalyticsConfigRequest = (rawUrl, method, applicationOrigin) => {
  const url = parseUrl(rawUrl);
  if (!url || url.origin !== applicationOrigin || url.pathname !== ANALYTICS_CONFIG_PATH) {
    return 'unrelated';
  }
  return method === 'GET' && !url.search && !url.hash ? 'config' : 'unexpected-config';
};

const isAnalyticsConfigRequest = (rawUrl, applicationOrigin, method = 'GET') =>
  classifyAnalyticsConfigRequest(rawUrl, method, applicationOrigin) === 'config';

const createNetworkState = () => ({
  dummyTagRequestCount: 0,
  unexpectedTagRequestCount: 0,
  collectionRequestCount: 0,
  configRequestCount: 0,
  unexpectedConfigRequestCount: 0,
  identityRequestCount: 0,
  unexpectedIdentityRequestCount: 0,
  handlerErrorCount: 0,
  connectionErrorCount: 0,
  teardownErrorCount: 0,
  pendingRequestCount: 0,
  listenerAttached: false,
  stopped: false,
  browserClosePrepared: false,
  browserCloseObserved: false,
  unexpectedCloseCount: 0,
  pendingRequestAtCloseCount: 0,
  browserCloseTimeoutCount: 0,
});

const readSafeNetworkSummary = (state) => Object.freeze({
  dummyTagRequestCount: Number(state.dummyTagRequestCount || 0),
  unexpectedTagRequestCount: Number(state.unexpectedTagRequestCount || 0),
  collectionRequestCount: Number(state.collectionRequestCount || 0),
  configRequestCount: Number(state.configRequestCount || 0),
  unexpectedConfigRequestCount: Number(state.unexpectedConfigRequestCount || 0),
  identityRequestCount: Number(state.identityRequestCount || 0),
  unexpectedIdentityRequestCount: Number(state.unexpectedIdentityRequestCount || 0),
  handlerErrorCount: Number(state.handlerErrorCount || 0),
  connectionErrorCount: Number(state.connectionErrorCount || 0),
  teardownErrorCount: Number(state.teardownErrorCount || 0),
  pendingRequestCount: Number(state.pendingRequestCount || 0),
  listenerAttached: state.listenerAttached === true,
  stopped: state.stopped === true,
  browserClosePrepared: state.browserClosePrepared === true,
  browserCloseObserved: state.browserCloseObserved === true,
  unexpectedCloseCount: Number(state.unexpectedCloseCount || 0),
  pendingRequestAtCloseCount: Number(state.pendingRequestAtCloseCount || 0),
  browserCloseTimeoutCount: Number(state.browserCloseTimeoutCount || 0),
});

const sendCdpCommand = async (connection, method, parameters) => {
  const result = await connection.send(method, parameters);
  if (result?.error) throw new Error(`Chrome DevToolsのコマンドに失敗しました: ${method}`);
};

const respondToPausedRequest = async (connection, state, request) => {
  const kind = classifyAnalyticsRequest(request?.url);
  if (kind === 'dummy-tag') {
    state.dummyTagRequestCount += 1;
    await sendCdpCommand(connection, 'Fetch.fulfillRequest', {
      requestId: request.requestId,
      responseCode: 200,
      responseHeaders: [
        { name: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        { name: 'Cache-Control', value: 'no-store' },
      ],
      body: '',
    });
    return kind;
  }

  if (kind === 'unexpected-tag' || kind === 'collection') {
    if (kind === 'unexpected-tag') state.unexpectedTagRequestCount += 1;
    else state.collectionRequestCount += 1;
    await sendCdpCommand(connection, 'Fetch.failRequest', {
      requestId: request.requestId,
      errorReason: 'BlockedByClient',
    });
    return kind;
  }

  await sendCdpCommand(connection, 'Fetch.continueRequest', { requestId: request.requestId });
  return kind;
};

const resolveApplicationOrigin = (browser) => {
  const url = parseUrl(browser?.launchUrl || browser?.globals?.launchUrl);
  if (!url || url.origin !== 'http://localhost:3100') {
    throw new Error('アナリティクスのE2Eには専用のフロントエンドのオリジンが必要です。');
  }
  return url.origin;
};

const installAnalyticsCdpGuard = async (browser) => {
  if (!browser?.driver || typeof browser.driver.createCDPConnection !== 'function') {
    throw new Error('アナリティクスのE2EにはChromiumのCDP接続が必要です。');
  }

  const applicationOrigin = resolveApplicationOrigin(browser);
  const connection = await browser.driver.createCDPConnection('page');
  const socket = connection?._wsConnection;
  if (!socket || typeof socket.on !== 'function' || typeof socket.off !== 'function') {
    throw new Error('アナリティクスのE2E用のCDP要求監視を接続できませんでした。');
  }

  const state = createNetworkState();
  const pendingHandlers = new Set();
  let stopPromise = null;
  let prepareBrowserClosePromise = null;
  let networkEnabled = false;
  let fetchEnabled = false;
  let resolveBrowserClose;
  const browserClosePromise = new Promise((resolve) => {
    resolveBrowserClose = resolve;
  });

  const trackHandler = (handler) => {
    let tracked;
    tracked = Promise.resolve()
      .then(handler)
      .catch(() => {
        state.handlerErrorCount += 1;
      })
      .finally(() => {
        pendingHandlers.delete(tracked);
        state.pendingRequestCount = pendingHandlers.size;
      });
    pendingHandlers.add(tracked);
    state.pendingRequestCount = pendingHandlers.size;
  };

  const messageListener = (message) => {
    let payload;
    try {
      payload = JSON.parse(message.toString());
    } catch (_error) {
      state.handlerErrorCount += 1;
      return;
    }

    if (payload.method === 'Fetch.requestPaused') {
      trackHandler(() =>
        respondToPausedRequest(connection, state, {
          requestId: payload.params?.requestId,
          url: payload.params?.request?.url,
        })
      );
      return;
    }

    if (payload.method === 'Network.requestWillBeSent') {
      const configKind = classifyAnalyticsConfigRequest(
        payload.params?.request?.url,
        payload.params?.request?.method,
        applicationOrigin
      );
      if (configKind === 'config') state.configRequestCount += 1;
      if (configKind === 'unexpected-config') state.unexpectedConfigRequestCount += 1;

      const kind = classifyAnalyticsIdentityRequest(
        payload.params?.request?.url,
        payload.params?.request?.method,
        applicationOrigin
      );
      if (kind === 'identity') state.identityRequestCount += 1;
      if (kind === 'unexpected-identity') state.unexpectedIdentityRequestCount += 1;
    }
  };
  const errorListener = () => {
    state.connectionErrorCount += 1;
  };
  const closeListener = () => {
    state.browserCloseObserved = true;
    state.pendingRequestAtCloseCount = pendingHandlers.size;
    if (!state.browserClosePrepared) {
      state.unexpectedCloseCount += 1;
      state.connectionErrorCount += 1;
    }
    state.stopped = true;
    detachListeners();
    resolveBrowserClose();
  };
  const detachListeners = () => {
    socket.off('message', messageListener);
    socket.off('error', errorListener);
    socket.off('close', closeListener);
    state.listenerAttached = false;
  };
  const drainPendingHandlers = async () => {
    while (pendingHandlers.size > 0) {
      await Promise.allSettled([...pendingHandlers]);
    }
  };

  socket.on('message', messageListener);
  socket.on('error', errorListener);
  socket.on('close', closeListener);
  state.listenerAttached = true;
  try {
    await sendCdpCommand(connection, 'Network.enable', {});
    networkEnabled = true;
    await sendCdpCommand(connection, 'Fetch.enable', { patterns: FETCH_PATTERNS });
    fetchEnabled = true;
  } catch (_error) {
    if (fetchEnabled) {
      await sendCdpCommand(connection, 'Fetch.disable', {}).catch(() => undefined);
    }
    if (networkEnabled) {
      await sendCdpCommand(connection, 'Network.disable', {}).catch(() => undefined);
    }
    detachListeners();
    throw new Error('アナリティクスのE2E用のCDP要求監視を有効にできませんでした。');
  }

  return Object.freeze({
    summary: () => readSafeNetworkSummary(state),
    prepareForBrowserClose: () => {
      if (prepareBrowserClosePromise) return prepareBrowserClosePromise;
      prepareBrowserClosePromise = (async () => {
        if (stopPromise || state.stopped || state.browserCloseObserved) {
          throw new Error('終了済みのブラウザセッションでは、アナリティクスのE2E用の通信監視を準備できません。');
        }
        await drainPendingHandlers();
        if (state.browserCloseObserved) {
          throw new Error('アナリティクスのE2Eの終了処理前に、ブラウザセッションが終了しました。');
        }
        state.browserClosePrepared = true;
        return readSafeNetworkSummary(state);
      })();
      return prepareBrowserClosePromise;
    },
    waitForBrowserClose: (timeoutMs = 10000) => {
      if (state.browserCloseObserved) return Promise.resolve(readSafeNetworkSummary(state));
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          state.browserCloseTimeoutCount += 1;
          state.stopped = true;
          detachListeners();
          reject(new Error('アナリティクスのE2Eのブラウザ終了を確認できませんでした。'));
        }, timeoutMs);
        browserClosePromise.then(() => {
          clearTimeout(timer);
          resolve(readSafeNetworkSummary(state));
        });
      });
    },
    stop: () => {
      if (stopPromise) return stopPromise;
      stopPromise = (async () => {
        let teardownFailed = false;
        await drainPendingHandlers();
        try {
          await sendCdpCommand(connection, 'Fetch.disable', {});
          fetchEnabled = false;
        } catch (_error) {
          teardownFailed = true;
          state.teardownErrorCount += 1;
        }
        await drainPendingHandlers();
        try {
          await sendCdpCommand(connection, 'Network.disable', {});
          networkEnabled = false;
        } catch (_error) {
          teardownFailed = true;
          state.teardownErrorCount += 1;
        }
        await drainPendingHandlers();
        detachListeners();
        state.stopped = true;
        if (teardownFailed || fetchEnabled || networkEnabled) {
          throw new Error('アナリティクスのE2E用のCDP要求監視を安全に停止できませんでした。');
        }
        return readSafeNetworkSummary(state);
      })();
      return stopPromise;
    },
  });
};

const captureDataLayerState = function (expectations) {
  const options = expectations && typeof expectations === 'object' ? expectations : {};
  const startIndex = Number.isInteger(options.startIndex) && options.startIndex >= 0
    ? options.startIndex
    : 0;
  const measurementId = options.measurementId || 'G-E2E0000000';
  const applicationOrigin = options.applicationOrigin || 'http://localhost:3100';
  const allCommands = Array.from(window.dataLayer || []).map((command) => Array.from(command || []));
  const commands = allCommands.slice(startIndex);
  const configCommands = commands.filter((command) => command[0] === 'config');
  const eventCommands = commands.filter((command) => command[0] === 'event');
  const jsCommands = commands.filter((command) => command[0] === 'js');
  const registeredIdPattern = /^ga1_[a-f0-9]{64}$/;
  const staticPagePaths = {
    floor_list: '/',
    login: '/login',
    register: '/register',
    password_reset_request: '/user/sendresetpasswordlink',
    password_reset_form: '/user/resetpassword',
    setting: '/setting',
    change_password: '/changepassword',
    terms: '/terms',
    privacy: '/privacy',
    cookie_policy: '/cookie',
    accessibility: '/accessibility',
    contact: '/contact',
    tutorial: '/tutorial',
  };
  const resourcePageGroups = new Set(['room_list', 'timeline']);
  const pageExitEventName = 'iseeetl_page_exit';
  const knownEvents = new Set([
    pageExitEventName,
    'page_view',
    'timeline_view',
    'timeline_content_change',
    'timeline_media_attach',
    'timeline_tag_change',
    'timeline_reaction_change',
    'timeline_quick_text_use',
    'timeline_filter_change',
    'timeline_filter_setting',
    'timeline_filter_tag',
    'timeline_display_save',
    'timeline_display_setting',
  ]);
  const timelineContextParameters = [
    'floor_id',
    'floor_title',
    'room_id',
    'room_title',
    'visitor_type',
  ];
  const withTimelineContext = (...parameters) => [...timelineContextParameters, ...parameters];
  const pageContextParameters = [
    'page_group',
    'page_location',
    'page_title',
    'page_referrer',
    'floor_id',
    'floor_title',
    'room_id',
    'room_title',
    'visitor_type',
  ];
  const allowedEventParameters = {
    [pageExitEventName]: pageContextParameters,
    page_view: pageContextParameters,
    timeline_view: withTimelineContext(),
    timeline_content_change: withTimelineContext(
      'content_type',
      'action_type',
      'presentation_type'
    ),
    timeline_media_attach: withTimelineContext('content_type', 'action_type', 'media_type'),
    timeline_tag_change: withTimelineContext(
      'content_type',
      'tag_action',
      'tag_id',
      'tag_name'
    ),
    timeline_reaction_change: withTimelineContext(
      'content_type',
      'reaction_action',
      'reaction_type'
    ),
    timeline_quick_text_use: withTimelineContext(
      'content_type',
      'quick_text_id',
      'quick_text_label'
    ),
    timeline_filter_change: withTimelineContext('action_type'),
    timeline_filter_setting: withTimelineContext('setting_key', 'setting_value'),
    timeline_filter_tag: withTimelineContext('action_type', 'tag_id', 'tag_name'),
    timeline_display_save: withTimelineContext(),
    timeline_display_setting: withTimelineContext('setting_key', 'setting_value'),
  };
  const requiredPageContextParameters = pageContextParameters.filter(
    (name) => name !== 'page_referrer'
  );
  const requiredEventParameters = {
    [pageExitEventName]: requiredPageContextParameters,
    page_view: requiredPageContextParameters,
    timeline_view: ['floor_id', 'room_id', 'visitor_type'],
    timeline_content_change: [
      'floor_id',
      'room_id',
      'visitor_type',
      'content_type',
      'action_type',
      'presentation_type',
    ],
    timeline_media_attach: [
      'floor_id',
      'room_id',
      'visitor_type',
      'content_type',
      'action_type',
      'media_type',
    ],
    timeline_tag_change: [
      'floor_id',
      'room_id',
      'visitor_type',
      'content_type',
      'tag_action',
      'tag_id',
    ],
    timeline_reaction_change: [
      'floor_id',
      'room_id',
      'visitor_type',
      'content_type',
      'reaction_action',
      'reaction_type',
    ],
    timeline_quick_text_use: [
      'floor_id',
      'room_id',
      'visitor_type',
      'content_type',
      'quick_text_id',
    ],
    timeline_filter_change: ['floor_id', 'room_id', 'visitor_type', 'action_type'],
    timeline_filter_setting: [
      'floor_id',
      'room_id',
      'visitor_type',
      'setting_key',
      'setting_value',
    ],
    timeline_filter_tag: [
      'floor_id',
      'room_id',
      'visitor_type',
      'action_type',
      'tag_id',
    ],
    timeline_display_save: ['floor_id', 'room_id', 'visitor_type'],
    timeline_display_setting: [
      'floor_id',
      'room_id',
      'visitor_type',
      'setting_key',
      'setting_value',
    ],
  };
  const enumValues = {
    visitor_type: ['guest', 'registered'],
    content_type: ['post', 'reply', 'post_supplement', 'reply_supplement'],
    action_type: ['create', 'update', 'delete'],
    presentation_type: ['static', 'flow'],
    media_type: ['image', 'video', 'audio'],
    tag_action: ['add', 'remove'],
    reaction_action: ['add', 'remove'],
    reaction_type: ['いいね', '超いいね', '拍手', '笑顔', 'びっくり'],
  };
  const settingValues = {
    timeline_filter_setting: {
      filter_mode: ['include', 'exclude'],
      show_range: ['all', 'target'],
      keyword_used: ['true', 'false'],
      user_name_used: ['true', 'false'],
      tag_used: ['true', 'false'],
      no_tags: ['true', 'false'],
      animation: ['true', 'false'],
      web_push: ['true', 'false'],
      show_user_icon: ['true', 'false'],
      keyword_operator: ['or', 'and'],
      tag_operator: ['or', 'and'],
    },
    timeline_display_setting: {
      speech_speed_bucket: ['off', 'slow', 'normal', 'fast'],
      display_name: ['true', 'false'],
      display_date: ['true', 'false'],
      display_tag: ['true', 'false'],
      display_supplement: ['true', 'false'],
      display_action_button: ['true', 'false'],
      enable_text_animation: ['true', 'false'],
      display_user_kick_button: ['true', 'false'],
      animation_speed: ['slow', 'normal', 'fast', 'very_fast'],
    },
  };
  const own = (record, name) =>
    Boolean(record && typeof record === 'object' && Object.prototype.hasOwnProperty.call(record, name));
  const parametersOf = (command) =>
    command[2] && typeof command[2] === 'object' && !Array.isArray(command[2])
      ? command[2]
      : {};
  const collapse = (values) => values.filter((value, index) => index === 0 || values[index - 1] !== value);
  const readSafePageUrl = (value, expectedGroup = null) => {
    try {
      const parsed = new URL(value);
      const expectedOrigin = new URL(applicationOrigin).origin;
      if (
        applicationOrigin !== expectedOrigin ||
        parsed.origin !== expectedOrigin ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash ||
        value !== `${expectedOrigin}${parsed.pathname}`
      ) {
        return null;
      }

      const staticEntry = Object.entries(staticPagePaths).find(
        ([pageGroup, pathname]) =>
          parsed.pathname === pathname && (!expectedGroup || expectedGroup === pageGroup)
      );
      if (staticEntry) {
        return Object.freeze({ pageGroup: staticEntry[0], floorObjectId: null, roomObjectId: null });
      }

      const roomListMatch = parsed.pathname.match(/^\/floor\/([a-f0-9]{24})$/);
      if (roomListMatch && (!expectedGroup || expectedGroup === 'room_list')) {
        return Object.freeze({
          pageGroup: 'room_list',
          floorObjectId: roomListMatch[1],
          roomObjectId: null,
        });
      }

      const timelineMatch = parsed.pathname.match(
        /^\/floor\/([a-f0-9]{24})\/room\/([a-f0-9]{24})$/
      );
      if (timelineMatch && (!expectedGroup || expectedGroup === 'timeline')) {
        return Object.freeze({
          pageGroup: 'timeline',
          floorObjectId: timelineMatch[1],
          roomObjectId: timelineMatch[2],
        });
      }
      return null;
    } catch (_error) {
      return null;
    }
  };
  const validPageUrl = (value, expectedGroup) => Boolean(readSafePageUrl(value, expectedGroup));
  const validReferrer = (value) => {
    if (value === undefined || value === '') return true;
    return Boolean(readSafePageUrl(value));
  };
  const safePageParameters = (parameters) =>
    typeof parameters.page_group === 'string' &&
    parameters.page_title === parameters.page_group &&
    validPageUrl(parameters.page_location, parameters.page_group) &&
    validReferrer(parameters.page_referrer);
  const forbiddenText = (value) => {
    if (typeof value !== 'string') return false;
    const phoneCandidates = value.match(/\+?[\p{Nd}][\p{Nd}\s().-]{8,}[\p{Nd}]/gu) || [];
    const containsPhoneNumber = phoneCandidates.some((candidate) => {
      const digits = candidate.match(/\p{Nd}/gu) || [];
      return digits.length >= 10 && digits.length <= 15;
    });
    return (
      /[\p{Cc}\p{Zl}\p{Zp}]/u.test(value) ||
      /[\uD800-\uDFFF]/u.test(value) ||
      /[^\s@]+@[^\s@]+\.[^\s@]+/i.test(value) ||
      /\b[a-z][a-z\d+.-]*:\/\/\S+/i.test(value) ||
      containsPhoneNumber ||
      /(?:^|[^A-Za-z\d_-])[A-Za-z\d_-]{8,}\.[A-Za-z\d_-]{8,}\.[A-Za-z\d_-]{8,}(?:$|[^A-Za-z\d_-])/i.test(value) ||
      /\b(?:authorization|bearer|jwt|token)\s*(?::|=|\s)\s*[A-Za-z\d._~+/=-]{8,}/i.test(value) ||
      /\b(?:ga1_|ghp_|glpat-|sk-|xox[baprs]-|ya29\.)[A-Za-z\d._~+/=-]{12,}/i.test(value) ||
      /^(?:0x)?[a-f\d]{24,128}$/i.test(value) ||
      /[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}/i.test(value) ||
      /^(?=.{32,256}$)(?=.*[+/_=-])[A-Za-z\d+/_=-]+$/.test(value)
    );
  };
  const resourceIdPatterns = {
    floor_id: /^[a-f\d]{24}$/,
    room_id: /^[a-f\d]{24}$/,
    tag_id: /^tag_[a-f\d]{24}$/,
    quick_text_id: /^quick_[a-f\d]{24}$/,
  };
  const resourceLabelParameters = new Set([
    'floor_title',
    'room_title',
    'tag_name',
    'quick_text_label',
  ]);
  const validEventParameterValue = (eventName, name, value, parameters) => {
    if (
      [pageExitEventName, 'page_view'].includes(eventName) &&
      value === null &&
      ['floor_id', 'floor_title', 'room_id', 'room_title'].includes(name)
    ) {
      return true;
    }
    if (typeof value !== 'string') return false;
    if (resourceIdPatterns[name]) return resourceIdPatterns[name].test(value);
    if (resourceLabelParameters.has(name)) {
      return (
        value === value.normalize('NFC').trim() &&
        [...value].length > 0 &&
        [...value].length <= 100 &&
        !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value) &&
        !forbiddenText(value)
      );
    }
    if (name === 'action_type' && eventName === 'timeline_filter_tag') {
      return ['create', 'update'].includes(value);
    }
    if (enumValues[name]) return enumValues[name].includes(value);
    if (name === 'page_group') {
      return Object.prototype.hasOwnProperty.call(staticPagePaths, value) ||
        resourcePageGroups.has(value);
    }
    if (name === 'page_title') return value === parameters.page_group;
    if (name === 'page_location') return validPageUrl(value, parameters.page_group);
    if (name === 'page_referrer') return value !== '' && validReferrer(value);
    if (name === 'setting_key' || name === 'setting_value') {
      const values = settingValues[eventName]?.[parameters.setting_key];
      return Array.isArray(values) && values.includes(parameters.setting_value);
    }
    return false;
  };
  const pageResourceParameterNames = ['floor_id', 'floor_title', 'room_id', 'room_title'];
  const validPageViewResource = (parameters) => {
    const location = readSafePageUrl(parameters.page_location, parameters.page_group);
    if (!location) return false;

    if (parameters.page_group === 'room_list') {
      return (
        parameters.floor_id === location.floorObjectId &&
        (parameters.floor_title === null || typeof parameters.floor_title === 'string') &&
        parameters.room_id === null &&
        parameters.room_title === null
      );
    }
    if (parameters.page_group === 'timeline') {
      return (
        parameters.floor_id === location.floorObjectId &&
        (parameters.floor_title === null || typeof parameters.floor_title === 'string') &&
        parameters.room_id === location.roomObjectId &&
        (parameters.room_title === null || typeof parameters.room_title === 'string')
      );
    }
    return pageResourceParameterNames.every((name) => parameters[name] === null);
  };
  const invalidEventShapeCount = eventCommands.filter((command) => {
    const eventName = command[1];
    const parameters = command[2];
    const allowed = allowedEventParameters[eventName];
    const required = requiredEventParameters[eventName];
    if (
      command.length !== 3 ||
      !allowed ||
      !required ||
      !parameters ||
      typeof parameters !== 'object' ||
      Array.isArray(parameters)
    ) {
      return true;
    }
    try {
      const prototype = Object.getPrototypeOf(parameters);
      if (prototype !== Object.prototype && prototype !== null) return true;
      const keys = Reflect.ownKeys(parameters);
      if (keys.some((name) => typeof name !== 'string')) return true;
      if (keys.some((name) => !allowed.includes(name))) return true;
      if (required.some((name) => !own(parameters, name))) return true;
      if (
        eventName === 'timeline_content_change' &&
        ['post_supplement', 'reply_supplement'].includes(parameters.content_type) &&
        parameters.presentation_type !== 'static'
      ) {
        return true;
      }
      if (
        [pageExitEventName, 'page_view'].includes(eventName) &&
        !validPageViewResource(parameters)
      ) {
        return true;
      }
      return keys.some((name) => {
        const descriptor = Object.getOwnPropertyDescriptor(parameters, name);
        return (
          !descriptor ||
          descriptor.enumerable !== true ||
          !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
          !validEventParameterValue(eventName, name, descriptor.value, parameters)
        );
      });
    } catch (_error) {
      return true;
    }
  }).length;
  const identityForConfig = (parameters) => {
    if (parameters.user_id === null) {
      return parameters.visitor_type === 'registered' ? 'clear' : 'invalid';
    }
    if (parameters.visitor_type === 'guest') {
      return own(parameters, 'user_id') ? 'invalid-guest' : 'guest';
    }
    if (parameters.visitor_type === 'registered') {
      return registeredIdPattern.test(parameters.user_id || '') ? 'registered' : 'invalid-registered';
    }
    return 'invalid';
  };
  const allowedConfigKeys = new Set([
    'send_page_view',
    'allow_google_signals',
    'allow_ad_personalization_signals',
    'cookie_domain',
    'cookie_path',
    'update',
    'page_group',
    'page_location',
    'page_title',
    'page_referrer',
    'floor_id',
    'floor_title',
    'room_id',
    'room_title',
    'visitor_type',
    'user_id',
  ]);
  const validNullableResourceValue = (name, value) => {
    if (value === null) return true;
    return validEventParameterValue('page_view', name, value, {
      page_group: 'timeline',
    });
  };
  const configResourceStateFor = (parameters) => {
    if (!pageResourceParameterNames.every((name) => own(parameters, name))) return 'invalid';
    if (
      !pageResourceParameterNames.every((name) =>
        validNullableResourceValue(name, parameters[name])
      )
    ) {
      return 'invalid';
    }

    const location = readSafePageUrl(parameters.page_location, parameters.page_group);
    if (!location) return 'invalid';
    const allClear = pageResourceParameterNames.every((name) => parameters[name] === null);
    if (!resourcePageGroups.has(parameters.page_group)) return allClear ? 'clear' : 'invalid';
    if (allClear) return own(parameters, 'update') ? 'invalid' : 'pending';

    if (parameters.page_group === 'room_list') {
      return parameters.floor_id === location.floorObjectId &&
        (parameters.floor_title === null || typeof parameters.floor_title === 'string') &&
        parameters.room_id === null &&
        parameters.room_title === null
        ? 'floor'
        : 'invalid';
    }
    return parameters.floor_id === location.floorObjectId &&
      parameters.room_id === location.roomObjectId &&
      (parameters.floor_title === null || typeof parameters.floor_title === 'string') &&
      (parameters.room_title === null || typeof parameters.room_title === 'string')
      ? 'room'
      : 'invalid';
  };
  const configDetails = configCommands.map((command) => {
    const parameters = parametersOf(command);
    const identity = identityForConfig(parameters);
    const resourceState = configResourceStateFor(parameters);
    const expectedFixedConfig =
      parameters.send_page_view === false &&
      parameters.allow_google_signals === false &&
      parameters.allow_ad_personalization_signals === false &&
      parameters.cookie_domain === 'none' &&
      parameters.cookie_path === '/';
    let invalidDescriptor = false;
    try {
      const prototype = Object.getPrototypeOf(parameters);
      const keys = Reflect.ownKeys(parameters);
      invalidDescriptor =
        (prototype !== Object.prototype && prototype !== null) ||
        keys.some((name) => typeof name !== 'string' || !allowedConfigKeys.has(name)) ||
        keys.some((name) => {
          const descriptor = Object.getOwnPropertyDescriptor(parameters, name);
          return (
            !descriptor ||
            descriptor.enumerable !== true ||
            !Object.prototype.hasOwnProperty.call(descriptor, 'value')
          );
        });
    } catch (_error) {
      invalidDescriptor = true;
    }
    return {
      identity,
      parameters,
      resourceState,
      updateState: own(parameters, 'update') ? parameters.update === true ? 'update' : 'invalid' : 'initial',
      unexpectedMeasurement: command[1] !== measurementId,
      invalidShape:
        command.length !== 3 ||
        !expectedFixedConfig ||
        invalidDescriptor ||
        resourceState === 'invalid' ||
        (own(parameters, 'update') && parameters.update !== true),
      unsafePage: !safePageParameters(parameters),
    };
  });
  const phaseIdentitySequence = collapse(configDetails.map(({ identity }) => identity));
  const historyConfigCommands = allCommands.filter((command) => command[0] === 'config');
  const configUpdateOrderViolationCount = historyConfigCommands.filter((command, index) => {
    const parameters = parametersOf(command);
    return index === 0 ? own(parameters, 'update') : parameters.update !== true;
  }).length;
  const historyIdentitySequence = collapse(
    historyConfigCommands.map((command) => identityForConfig(parametersOf(command)))
  );
  const registeredUserIds = new Set(
    historyConfigCommands
      .map((command) => parametersOf(command))
      .filter((parameters) => identityForConfig(parameters) === 'registered')
      .map((parameters) => parameters.user_id)
  );

  let latestIdentityState = null;
  let clearRequiredBeforeGuest = false;
  let identityEventMismatchCount = 0;
  let identityTransitionViolationCount = 0;
  let registeredEventBeforeConfigCount = 0;
  let guestEventBeforeConfigCount = 0;
  let guestEventBeforeClearCount = 0;
  let pageViewConfigMismatchCount = 0;
  let pageTransitionMismatchCount = 0;
  let previousPageViewParameters = null;
  const pageBoundaryParameters = pageContextParameters.filter(
    (name) => name !== 'visitor_type'
  );
  const samePageContext = (left, right) => pageBoundaryParameters.every((name) =>
    name === 'page_referrer'
      ? (left[name] || '') === (right[name] || '')
      : left[name] === right[name]
  );
  allCommands.forEach((command, commandIndex) => {
    if (command[0] === 'config') {
      const configParameters = parametersOf(command);
      const identity = identityForConfig(configParameters);
      if (identity === 'registered') {
        latestIdentityState = 'registered';
        clearRequiredBeforeGuest = true;
        return;
      }
      if (identity === 'clear') {
        if (latestIdentityState !== 'registered') identityTransitionViolationCount += 1;
        latestIdentityState = 'clear';
        clearRequiredBeforeGuest = false;
        return;
      }
      if (identity === 'guest') {
        if (clearRequiredBeforeGuest) identityTransitionViolationCount += 1;
        latestIdentityState = 'guest';
        return;
      }
      latestIdentityState = null;
      return;
    }
    if (command[0] !== 'event') return;

    const visitorType = parametersOf(command).visitor_type;
    if (visitorType !== latestIdentityState) identityEventMismatchCount += 1;
    if (visitorType === 'registered' && latestIdentityState !== 'registered') {
      registeredEventBeforeConfigCount += 1;
    }
    if (visitorType === 'guest' && latestIdentityState !== 'guest') {
      guestEventBeforeConfigCount += 1;
    }
    if (visitorType === 'guest' && clearRequiredBeforeGuest) {
      guestEventBeforeClearCount += 1;
    }
    if (command[1] === 'page_view') {
      const eventParameters = parametersOf(command);
      const previousCommand = allCommands[commandIndex - 1];
      const previousConfigParameters = parametersOf(previousCommand || []);
      const matchesPreviousConfig =
        previousCommand?.[0] === 'config' &&
        previousCommand?.[1] === measurementId &&
        (!previousPageViewParameters || previousConfigParameters.update === true) &&
        samePageContext(previousConfigParameters, eventParameters);
      if (!matchesPreviousConfig) pageViewConfigMismatchCount += 1;

      let precedingConfigIndex = commandIndex - 1;
      while (precedingConfigIndex >= 0 && allCommands[precedingConfigIndex]?.[0] === 'config') {
        precedingConfigIndex -= 1;
      }
      const pageExitCommand = allCommands[precedingConfigIndex];
      const matchesPreviousPageExit =
        pageExitCommand?.[0] === 'event' &&
        pageExitCommand?.[1] === pageExitEventName &&
        previousPageViewParameters &&
        samePageContext(parametersOf(pageExitCommand), previousPageViewParameters);
      if (
        previousPageViewParameters
          ? !matchesPreviousPageExit
          : pageExitCommand?.[0] === 'event' && pageExitCommand?.[1] === pageExitEventName
      ) {
        pageTransitionMismatchCount += 1;
      }
      previousPageViewParameters = eventParameters;
    }
  });

  const eventUserIdCount = eventCommands.filter((command) => own(parametersOf(command), 'user_id')).length;
  const unsafeEventPageCount = eventCommands.filter(
    (command) => command[1] === 'page_view' && !safePageParameters(parametersOf(command))
  ).length;
  const unknownAnalyticsEventCount = eventCommands.filter(
    (command) => !knownEvents.has(command[1])
  ).length;
  const valueCommands = [...configCommands, ...eventCommands];
  const forbiddenValueCount = valueCommands.filter((command) => {
    const parameters = parametersOf(command);
    return Object.entries(parameters).some(([name, value]) => {
      if (['page_location', 'page_referrer', 'user_id'].includes(name)) return false;
      if (resourceIdPatterns[name]?.test(value)) return false;
      return forbiddenText(value);
    });
  }).length;
  const forbiddenFragmentCount = (options.forbiddenFragments || []).filter((fragment) => {
    if (typeof fragment !== 'string' || fragment === '') return false;
    return valueCommands.some((command) => {
      const parameters = parametersOf(command);
      return Object.entries(parameters).some(([name, value]) => {
        if (['page_location', 'page_referrer', 'user_id'].includes(name)) return false;
        return typeof value === 'string' && value.includes(fragment);
      });
    });
  }).length;

  const expectedConfigs = Array.isArray(options.configs) ? options.configs : null;
  const matchesExpectedConfig = (detail, expected) => {
    if (!detail || !expected || typeof expected !== 'object') return false;
    if (
      expected.update === true && detail.updateState !== 'update' ||
      expected.update === false && detail.updateState !== 'initial' ||
      expected.resourceState && detail.resourceState !== expected.resourceState
    ) {
      return false;
    }
    const exact = Object.entries(expected.parameters || {}).every(
      ([name, value]) => detail.parameters[name] === value
    );
    const patterns = Object.entries(expected.patterns || {}).every(([name, pattern]) => {
      try {
        return new RegExp(pattern).test(String(detail.parameters[name] || ''));
      } catch (_error) {
        return false;
      }
    });
    return exact && patterns;
  };
  const configExpectationMismatchCount = expectedConfigs
    ? configDetails.reduce(
      (count, detail, index) =>
        count + (matchesExpectedConfig(detail, expectedConfigs[index]) ? 0 : 1),
      0
    )
    : 0;
  const configExpectationReady =
    !expectedConfigs ||
    (configDetails.length === expectedConfigs.length && configExpectationMismatchCount === 0);
  const configExpectationPrefixValid =
    !expectedConfigs ||
    (configDetails.length <= expectedConfigs.length && configExpectationMismatchCount === 0);

  const expectedEvents = Array.isArray(options.events) ? options.events : [];
  const expectedEventCommands = eventCommands.filter(
    (command) => command[1] !== pageExitEventName
  );
  const expectedSlots = [];
  expectedEvents.forEach((expected, expectedIndex) => {
    const count = Number.isInteger(expected.count) && expected.count >= 0 ? expected.count : 1;
    for (let index = 0; index < count; index += 1) expectedSlots.push({ expected, expectedIndex });
  });
  const eventMatchCounts = expectedEvents.map(() => 0);
  let unexpectedEventCount = 0;
  const matchesExpectedEvent = (command, expected) => {
    if (command[1] !== expected.name) return false;
    const parameters = parametersOf(command);
    const exact = Object.entries(expected.parameters || {}).every(
      ([name, value]) => parameters[name] === value
    );
    const patterns = Object.entries(expected.patterns || {}).every(([name, pattern]) => {
      try {
        return new RegExp(pattern).test(String(parameters[name] || ''));
      } catch (_error) {
        return false;
      }
    });
    return exact && patterns;
  };
  if (options.allowAdditionalEvents) {
    expectedEvents.forEach((expected, index) => {
      eventMatchCounts[index] = expectedEventCommands.filter((command) =>
        matchesExpectedEvent(command, expected)
      ).length;
    });
  } else {
    expectedEventCommands.forEach((command, slotIndex) => {
      const slot = expectedSlots[slotIndex];
      if (!slot || !matchesExpectedEvent(command, slot.expected)) {
        unexpectedEventCount += 1;
        return;
      }
      eventMatchCounts[slot.expectedIndex] += 1;
    });
  }

  const expectedIdentitySequence = Array.isArray(options.expectedIdentitySequence)
    ? options.expectedIdentitySequence
    : null;
  const expectedHistoryIdentitySequence = Array.isArray(options.historyIdentitySequence)
    ? options.historyIdentitySequence
    : null;
  const exactSequence = (actual, expected) =>
    !expected || (actual.length === expected.length && actual.every((value, index) => value === expected[index]));
  const prefixSequence = (actual, expected) =>
    !expected || (actual.length <= expected.length && actual.every((value, index) => value === expected[index]));
  const expectedJsCount = Number.isInteger(options.expectedJsCount) ? options.expectedJsCount : 0;
  const expectedConfigCount = Number.isInteger(options.expectedConfigCount)
    ? options.expectedConfigCount
    : expectedConfigs
      ? expectedConfigs.length
      : null;
  const expectedEventCount = options.allowAdditionalEvents ? null : expectedSlots.length;
  const maximumRegisteredUserIdVariants = Number.isInteger(options.maximumRegisteredUserIdVariants)
    ? options.maximumRegisteredUserIdVariants
    : 1;
  const invalidGuestUserIdCount = configDetails.filter(
    ({ identity }) => identity === 'invalid-guest'
  ).length;
  const invalidRegisteredUserIdCount = configDetails.filter(
    ({ identity }) => identity === 'invalid-registered'
  ).length;
  const invalidConfigCount = configDetails.filter(
    ({ identity, invalidShape }) => identity === 'invalid' || invalidShape
  ).length;
  const unexpectedMeasurementCount = configDetails.filter(
    ({ unexpectedMeasurement }) => unexpectedMeasurement
  ).length;
  const unsafeConfigPageCount = configDetails.filter(({ unsafePage }) => unsafePage).length;
  const unexpectedConfigCount = configDetails.filter(
    ({ identity, unexpectedMeasurement, invalidShape, unsafePage }) =>
      unexpectedMeasurement ||
      invalidShape ||
      unsafePage ||
      ['invalid', 'invalid-guest', 'invalid-registered'].includes(identity)
  ).length;
  const unexpectedCommandCount = commands.filter((command) => {
    if (!['js', 'config', 'event'].includes(command[0])) return true;
    return command[0] === 'js' && command.length !== 2;
  }).length;
  const violationCount =
    unexpectedConfigCount +
    unsafeEventPageCount +
    eventUserIdCount +
    identityEventMismatchCount +
    identityTransitionViolationCount +
    registeredEventBeforeConfigCount +
    guestEventBeforeConfigCount +
    guestEventBeforeClearCount +
    pageViewConfigMismatchCount +
    pageTransitionMismatchCount +
    configUpdateOrderViolationCount +
    unknownAnalyticsEventCount +
    invalidEventShapeCount +
    forbiddenValueCount +
    forbiddenFragmentCount +
    unexpectedCommandCount +
    (registeredUserIds.size > maximumRegisteredUserIdVariants ? 1 : 0);
  const countsExact =
    jsCommands.length === expectedJsCount &&
    (expectedConfigCount === null || configCommands.length === expectedConfigCount) &&
    configExpectationReady &&
    (expectedEventCount === null || expectedEventCommands.length === expectedEventCount) &&
    (options.allowAdditionalEvents || eventMatchCounts.every((count, index) => count === expectedSlots.filter(
      ({ expectedIndex }) => expectedIndex === index
    ).length));
  const requiredEventsPresent =
    !options.allowAdditionalEvents ||
    eventMatchCounts.every((count, index) => {
      const expected = expectedEvents[index];
      const minimum = Number.isInteger(expected?.count) && expected.count >= 0 ? expected.count : 1;
      return count >= minimum;
    });
  const ready =
    violationCount === 0 &&
    unexpectedEventCount === 0 &&
    countsExact &&
    requiredEventsPresent &&
    exactSequence(phaseIdentitySequence, expectedIdentitySequence) &&
    exactSequence(historyIdentitySequence, expectedHistoryIdentitySequence);
  const irrecoverable =
    violationCount > 0 ||
    unexpectedEventCount > 0 ||
    jsCommands.length > expectedJsCount ||
    (expectedConfigCount !== null && configCommands.length > expectedConfigCount) ||
    !configExpectationPrefixValid ||
    (expectedEventCount !== null && expectedEventCommands.length > expectedEventCount) ||
    !prefixSequence(phaseIdentitySequence, expectedIdentitySequence) ||
    !prefixSequence(historyIdentitySequence, expectedHistoryIdentitySequence);

  return {
    ready,
    irrecoverable,
    startIndex,
    endIndex: allCommands.length,
    commandCount: commands.length,
    configCount: configCommands.length,
    eventCount: expectedEventCommands.length,
    pageExitEventCount: eventCommands.length - expectedEventCommands.length,
    jsCount: jsCommands.length,
    eventMatchCounts,
    unexpectedEventCount,
    unexpectedMeasurementCount,
    unexpectedConfigCount,
    invalidGuestUserIdCount,
    invalidRegisteredUserIdCount,
    invalidConfigCount,
    unsafeConfigPageCount,
    unsafeEventPageCount,
    eventUserIdCount,
    identityEventMismatchCount,
    identityTransitionViolationCount,
    registeredEventBeforeConfigCount,
    guestEventBeforeConfigCount,
    guestEventBeforeClearCount,
    pageViewConfigMismatchCount,
    pageTransitionMismatchCount,
    configUpdateOrderViolationCount,
    configExpectationMismatchCount,
    configResourceStates: configDetails.map(({ resourceState }) => resourceState),
    configUpdateStates: configDetails.map(({ updateState }) => updateState),
    unknownAnalyticsEventCount,
    invalidEventShapeCount,
    forbiddenValueCount,
    forbiddenFragmentCount,
    unexpectedCommandCount,
    registeredUserIdVariantCount: registeredUserIds.size,
    phaseIdentitySequence,
    historyIdentitySequence,
  };
};

const createDataLayerCheckpoint = (index = 0) => ({ index });

const readSafeDataLayerSummary = (state) => ({
  startIndex: state.startIndex || 0,
  endIndex: state.endIndex || 0,
  commandCount: state.commandCount || 0,
  configCount: state.configCount || 0,
  eventCount: state.eventCount || 0,
  pageExitEventCount: state.pageExitEventCount || 0,
  jsCount: state.jsCount || 0,
  eventMatchCounts: Array.isArray(state.eventMatchCounts) ? state.eventMatchCounts : [],
  unexpectedEventCount: state.unexpectedEventCount || 0,
  unexpectedMeasurementCount: state.unexpectedMeasurementCount || 0,
  unexpectedConfigCount: state.unexpectedConfigCount || 0,
  invalidGuestUserIdCount: state.invalidGuestUserIdCount || 0,
  invalidRegisteredUserIdCount: state.invalidRegisteredUserIdCount || 0,
  invalidConfigCount: state.invalidConfigCount || 0,
  unsafeConfigPageCount: state.unsafeConfigPageCount || 0,
  unsafeEventPageCount: state.unsafeEventPageCount || 0,
  eventUserIdCount: state.eventUserIdCount || 0,
  identityEventMismatchCount: state.identityEventMismatchCount || 0,
  identityTransitionViolationCount: state.identityTransitionViolationCount || 0,
  registeredEventBeforeConfigCount: state.registeredEventBeforeConfigCount || 0,
  guestEventBeforeConfigCount: state.guestEventBeforeConfigCount || 0,
  guestEventBeforeClearCount: state.guestEventBeforeClearCount || 0,
  pageViewConfigMismatchCount: state.pageViewConfigMismatchCount || 0,
  pageTransitionMismatchCount: state.pageTransitionMismatchCount || 0,
  configUpdateOrderViolationCount: state.configUpdateOrderViolationCount || 0,
  configExpectationMismatchCount: state.configExpectationMismatchCount || 0,
  configResourceStates: Array.isArray(state.configResourceStates)
    ? state.configResourceStates
    : [],
  configUpdateStates: Array.isArray(state.configUpdateStates)
    ? state.configUpdateStates
    : [],
  unknownAnalyticsEventCount: state.unknownAnalyticsEventCount || 0,
  invalidEventShapeCount: state.invalidEventShapeCount || 0,
  forbiddenValueCount: state.forbiddenValueCount || 0,
  forbiddenFragmentCount: state.forbiddenFragmentCount || 0,
  unexpectedCommandCount: state.unexpectedCommandCount || 0,
  registeredUserIdVariantCount: state.registeredUserIdVariantCount || 0,
  phaseIdentitySequence: Array.isArray(state.phaseIdentitySequence)
    ? state.phaseIdentitySequence
    : [],
  historyIdentitySequence: Array.isArray(state.historyIdentitySequence)
    ? state.historyIdentitySequence
    : [],
});

const waitForAnalyticsDataLayer = (
  browser,
  checkpoint,
  expectations,
  label,
  attempt = 0,
  maxAttempts = 40
) => {
  browser.perform(() => {
    const options = { ...expectations, startIndex: checkpoint.index };
    browser.execute(captureDataLayerState, [options], (result) => {
      const layerState = result?.value || { ready: false, irrecoverable: false };
      if (layerState.ready) {
        checkpoint.index = Number(layerState.endIndex || checkpoint.index);
        browser.assert.ok(true, `${label}: アナリティクスのdataLayerが検証段階の期待値と一致しました。`);
        return;
      }
      if (layerState.irrecoverable || attempt >= maxAttempts) {
        browser.assert.ok(false, `${label}: ${JSON.stringify(readSafeDataLayerSummary(layerState))}`);
        return;
      }
      browser.pause(250, () =>
        waitForAnalyticsDataLayer(
          browser,
          checkpoint,
          expectations,
          label,
          attempt + 1,
          maxAttempts
        )
      );
    });
  });
};

const advanceAnalyticsDataLayerCheckpoint = (browser, checkpoint, expectations, label) =>
  waitForAnalyticsDataLayer(
    browser,
    checkpoint,
    {
      ...expectations,
      allowAdditionalEvents: true,
      expectedJsCount: Number.isInteger(expectations?.expectedJsCount)
        ? expectations.expectedJsCount
        : 0,
    },
    label
  );

const assertNoAnalyticsDataLayerDelta = (browser, checkpoint, label) => {
  browser.execute(
    function () {
      return Array.isArray(window.dataLayer) ? window.dataLayer.length : 0;
    },
    [],
    (result) => {
      browser.assert.equal(
        Number(result?.value || 0),
        checkpoint.index,
        `${label}: dataLayerのコマンドの増加数は0件です。`
      );
    }
  );
};

const assertNoAnalyticsDataLayer = (browser, label) => {
  browser.execute(
    function () {
      return Array.isArray(window.dataLayer) ? window.dataLayer.length : 0;
    },
    [],
    (result) => {
      browser.assert.equal(Number(result?.value || 0), 0, `${label}: dataLayerが空です。`);
    }
  );
};

const captureCookiePolicyLinkState = function (
  targetSelector,
  expectedOrigin,
  expectedFloorId,
  expectedRoomId
) {
  const visibleLinks = Array.from(document.querySelectorAll(targetSelector)).filter(
    (node) => node.offsetParent || node.getClientRects().length
  );
  const link = visibleLinks.length === 1 ? visibleLinks[0] : null;
  let destination = null;
  try {
    destination = link ? new URL(link.href, window.location.origin) : null;
  } catch (_error) {
    destination = null;
  }
  const expectedFloor = expectedFloorId || null;
  const expectedRoom = expectedRoomId || null;
  const expectedKeys = [
    ...(expectedFloor ? ['floor_id'] : []),
    ...(expectedRoom ? ['room_id'] : []),
  ];
  const entries = destination ? [...destination.searchParams.entries()] : [];
  const actualKeys = entries.map(([name]) => name);
  return {
    exactlyOneVisible: visibleLinks.length === 1,
    sameOrigin:
      destination?.origin === window.location.origin && destination.origin === expectedOrigin,
    noCredentials: Boolean(destination && !destination.username && !destination.password),
    cookiePath: destination?.pathname === '/cookie',
    noHash: destination?.hash === '',
    allowedQueryOnly:
      entries.length === expectedKeys.length &&
      actualKeys.every((name) => expectedKeys.includes(name)) &&
      expectedKeys.every((name) => actualKeys.filter((actual) => actual === name).length === 1),
    roomContextMatches:
      Boolean(destination) &&
      destination.searchParams.get('floor_id') === expectedFloor &&
      destination.searchParams.get('room_id') === expectedRoom,
  };
};

const captureCookiePolicyLocationState = function (expectedOrigin) {
  let current = null;
  try {
    current = new URL(window.location.href);
  } catch (_error) {
    current = null;
  }
  return {
    sameOrigin: current?.origin === expectedOrigin,
    noCredentials: Boolean(current && !current.username && !current.password),
    cookiePath: current?.pathname === '/cookie',
    noQuery: current?.search === '',
    noHash: current?.hash === '',
  };
};

const assertAnalyticsTagState = (browser, expectedPresent) => {
  browser.execute(
    function (expectedUrl) {
      const script = document.getElementById('iseeetl-google-analytics-tag');
      return {
        present: Boolean(script),
        exactDummySource: Boolean(script && script.src === expectedUrl),
      };
    },
    [E2E_GOOGLE_TAG_URL],
    (result) => {
      const state = result?.value || {};
      browser.assert.equal(state.present, expectedPresent, 'Googleタグの有無が機能の有効状態と一致しています。');
      browser.assert.equal(
        state.exactDummySource,
        expectedPresent,
        'Git管理されたダミーのGoogleタグの読み込み元だけが許可されています。'
      );
    }
  );
};

const assertAnalyticsNetworkSummary = (browser, guard, expected, label) => {
  browser.perform(() => {
    const summary = guard.summary();
    Object.entries(expected).forEach(([name, value]) => {
      browser.assert.equal(summary[name], value, `${label}: ${name}`);
    });
  });
};

const stopAndAssertAnalyticsCdpGuard = async (browser, guard, expected, label) => {
  let stopRejected = false;
  try {
    await guard?.stop();
  } catch (_error) {
    stopRejected = true;
  }
  const summary = guard?.summary() || readSafeNetworkSummary({});
  browser.assert.equal(stopRejected, false, `${label}: CDPの通信監視がエラーなく停止しました。`);
  Object.entries({
    ...expected,
    unexpectedTagRequestCount: expected.unexpectedTagRequestCount ?? 0,
    collectionRequestCount: expected.collectionRequestCount ?? 0,
    unexpectedConfigRequestCount: expected.unexpectedConfigRequestCount ?? 0,
    unexpectedIdentityRequestCount: expected.unexpectedIdentityRequestCount ?? 0,
    handlerErrorCount: expected.handlerErrorCount ?? 0,
    connectionErrorCount: expected.connectionErrorCount ?? 0,
    teardownErrorCount: expected.teardownErrorCount ?? 0,
    pendingRequestCount: 0,
    listenerAttached: false,
    stopped: true,
  }).forEach(([name, value]) => {
    browser.assert.equal(summary[name], value, `${label}: ${name}`);
  });
  return summary;
};

const validateAnalyticsBrowserCloseSummary = (summary, expected = {}) => {
  const required = {
    ...expected,
    unexpectedTagRequestCount: expected.unexpectedTagRequestCount ?? 0,
    collectionRequestCount: expected.collectionRequestCount ?? 0,
    unexpectedConfigRequestCount: expected.unexpectedConfigRequestCount ?? 0,
    unexpectedIdentityRequestCount: expected.unexpectedIdentityRequestCount ?? 0,
    handlerErrorCount: expected.handlerErrorCount ?? 0,
    connectionErrorCount: expected.connectionErrorCount ?? 0,
    teardownErrorCount: expected.teardownErrorCount ?? 0,
    pendingRequestCount: 0,
    listenerAttached: false,
    stopped: true,
    browserClosePrepared: true,
    browserCloseObserved: true,
    unexpectedCloseCount: 0,
    pendingRequestAtCloseCount: 0,
    browserCloseTimeoutCount: 0,
  };
  const mismatchedFields = Object.entries(required)
    .filter(([name, value]) => summary?.[name] !== value)
    .map(([name]) => name);
  return Object.freeze({
    ok: mismatchedFields.length === 0,
    mismatchedFields: Object.freeze(mismatchedFields),
  });
};

const finalizeAnalyticsCdpGuardWithBrowserClose = (
  browser,
  guard,
  expected,
  label,
  done
) => {
  let preparationFailed = false;
  Promise.resolve()
    .then(() => {
      if (!guard || typeof guard.prepareForBrowserClose !== 'function') {
        throw new Error('アナリティクスのE2E用の通信監視を利用できません。');
      }
      return guard.prepareForBrowserClose();
    })
    .catch(() => {
      preparationFailed = true;
    })
    .then(() => {
      const complete = async (browserEndResult) => {
        let closeFailed =
          browserEndResult instanceof Error || browserEndResult?.status === -1;
        try {
          await guard?.waitForBrowserClose();
        } catch (_error) {
          closeFailed = true;
        }
        const summary = guard?.summary() || readSafeNetworkSummary({});
        const validation = validateAnalyticsBrowserCloseSummary(summary, expected);
        if (preparationFailed || closeFailed || !validation.ok) {
          done(
            new Error(
              `${label}: アナリティクス検証のブラウザ終了時の通信確認に失敗しました。fields=${
                validation.mismatchedFields.join(',') || 'lifecycle'
              }; summary=${JSON.stringify(summary)}`
            )
          );
          return;
        }
        done();
      };
      try {
        browser.end(complete);
      } catch (_error) {
        done(new Error(`${label}: ブラウザセッションの終了を開始できませんでした。`));
      }
    });
};

module.exports = {
  E2E_ANALYTICS_MEASUREMENT_ID,
  E2E_GOOGLE_TAG_URL,
  FETCH_PATTERNS,
  advanceAnalyticsDataLayerCheckpoint,
  assertAnalyticsNetworkSummary,
  assertAnalyticsTagState,
  assertNoAnalyticsDataLayer,
  assertNoAnalyticsDataLayerDelta,
  captureCookiePolicyLinkState,
  captureCookiePolicyLocationState,
  captureDataLayerState,
  classifyAnalyticsConfigRequest,
  classifyAnalyticsIdentityRequest,
  classifyAnalyticsRequest,
  createDataLayerCheckpoint,
  finalizeAnalyticsCdpGuardWithBrowserClose,
  installAnalyticsCdpGuard,
  isAnalyticsConfigRequest,
  isAnalyticsIdentityRequest,
  readSafeDataLayerSummary,
  readSafeNetworkSummary,
  respondToPausedRequest,
  stopAndAssertAnalyticsCdpGuard,
  validateAnalyticsBrowserCloseSummary,
  waitForAnalyticsDataLayer,
};
