const freezeList = (...values) => Object.freeze(values);
const freezeValueMap = (entries) =>
  Object.freeze(
    Object.fromEntries(
      Object.entries(entries).map(([key, values]) => [key, Object.freeze([...values])])
    )
  );

const floorListPage = Object.freeze({ pageGroup: 'floor_list', canonicalPath: '/' });
const roomListPage = Object.freeze({ pageGroup: 'room_list', canonicalPath: '/floor' });
const timelinePage = Object.freeze({ pageGroup: 'timeline', canonicalPath: '/timeline' });

export const ANALYTICS_PAGE_DEFINITIONS = Object.freeze({
  Floor: floorListPage,
  FloorPage: floorListPage,
  Room: roomListPage,
  TimeLine: timelinePage,
  TimeLinePostDetail: timelinePage,
  Login: Object.freeze({ pageGroup: 'login', canonicalPath: '/login' }),
  Register: Object.freeze({ pageGroup: 'register', canonicalPath: '/register' }),
  SendResetPasswordLink: Object.freeze({
    pageGroup: 'password_reset_request',
    canonicalPath: '/user/sendresetpasswordlink',
  }),
  ResetPassword: Object.freeze({
    pageGroup: 'password_reset_form',
    canonicalPath: '/user/resetpassword',
  }),
  Setting: Object.freeze({ pageGroup: 'setting', canonicalPath: '/setting' }),
  ChangePassword: Object.freeze({
    pageGroup: 'change_password',
    canonicalPath: '/changepassword',
  }),
  Terms: Object.freeze({ pageGroup: 'terms', canonicalPath: '/terms' }),
  Privacy: Object.freeze({ pageGroup: 'privacy', canonicalPath: '/privacy' }),
  CookiePolicy: Object.freeze({ pageGroup: 'cookie_policy', canonicalPath: '/cookie' }),
  Accessibility: Object.freeze({
    pageGroup: 'accessibility',
    canonicalPath: '/accessibility',
  }),
  Contact: Object.freeze({ pageGroup: 'contact', canonicalPath: '/contact' }),
  Tutorial: Object.freeze({ pageGroup: 'tutorial', canonicalPath: '/tutorial' }),
});

export const ANALYTICS_VIRTUAL_PAGE_DEFINITIONS = Object.freeze({
  Profile: Object.freeze({ pageGroup: 'profile', canonicalPath: '/profile' }),
});

const analyticsPageDefinitions = [
  ...Object.values(ANALYTICS_PAGE_DEFINITIONS),
  ...Object.values(ANALYTICS_VIRTUAL_PAGE_DEFINITIONS),
];

export const ANALYTICS_RESOURCE_ID_PREFIXES = Object.freeze({
  floor: '',
  room: '',
  tag: 'tag_',
  quick_text: 'quick_',
});

export const ANALYTICS_EVENTS = Object.freeze({
  PAGE_VIEW: 'page_view',
  PAGE_EXIT: 'iseeetl_page_exit',
  TIMELINE_VIEW: 'timeline_view',
  TIMELINE_CONTENT_CHANGE: 'timeline_content_change',
  TIMELINE_MEDIA_ATTACH: 'timeline_media_attach',
  TIMELINE_TAG_CHANGE: 'timeline_tag_change',
  TIMELINE_REACTION_CHANGE: 'timeline_reaction_change',
  TIMELINE_QUICK_TEXT_USE: 'timeline_quick_text_use',
  TIMELINE_FILTER_CHANGE: 'timeline_filter_change',
  TIMELINE_FILTER_SETTING: 'timeline_filter_setting',
  TIMELINE_FILTER_TAG: 'timeline_filter_tag',
  TIMELINE_DISPLAY_SAVE: 'timeline_display_save',
  TIMELINE_DISPLAY_SETTING: 'timeline_display_setting',
});

export const ANALYTICS_PARAMETERS = Object.freeze({
  PAGE_GROUP: 'page_group',
  PAGE_LOCATION: 'page_location',
  PAGE_TITLE: 'page_title',
  PAGE_REFERRER: 'page_referrer',
  VISITOR_TYPE: 'visitor_type',
  FLOOR_ID: 'floor_id',
  FLOOR_TITLE: 'floor_title',
  ROOM_ID: 'room_id',
  ROOM_TITLE: 'room_title',
  CONTENT_TYPE: 'content_type',
  ACTION_TYPE: 'action_type',
  PRESENTATION_TYPE: 'presentation_type',
  MEDIA_TYPE: 'media_type',
  TAG_ID: 'tag_id',
  TAG_NAME: 'tag_name',
  TAG_ACTION: 'tag_action',
  REACTION_TYPE: 'reaction_type',
  REACTION_ACTION: 'reaction_action',
  QUICK_TEXT_ID: 'quick_text_id',
  QUICK_TEXT_LABEL: 'quick_text_label',
  SETTING_KEY: 'setting_key',
  SETTING_VALUE: 'setting_value',
});

const pageGroups = [...new Set(
  analyticsPageDefinitions.map(({ pageGroup }) => pageGroup)
)];

export const ANALYTICS_ENUM_VALUES = freezeValueMap({
  page_group: pageGroups,
  visitor_type: ['guest', 'registered'],
  content_type: ['post', 'reply', 'post_supplement', 'reply_supplement'],
  action_type: ['create', 'update', 'delete'],
  presentation_type: ['static', 'flow'],
  media_type: ['image', 'video', 'audio'],
  tag_action: ['add', 'remove'],
  reaction_action: ['add', 'remove'],
  reaction_type: ['いいね', '超いいね', '拍手', '笑顔', 'びっくり'],
});

export const ANALYTICS_FILTER_SETTING_VALUES = freezeValueMap({
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
});

export const ANALYTICS_DISPLAY_SETTING_VALUES = freezeValueMap({
  speech_speed_bucket: ['off', 'slow', 'normal', 'fast'],
  display_name: ['true', 'false'],
  display_date: ['true', 'false'],
  display_tag: ['true', 'false'],
  display_supplement: ['true', 'false'],
  display_action_button: ['true', 'false'],
  enable_text_animation: ['true', 'false'],
  display_user_kick_button: ['true', 'false'],
  animation_speed: ['slow', 'normal', 'fast', 'very_fast'],
});

const P = ANALYTICS_PARAMETERS;
const E = ANALYTICS_EVENTS;
const pageContextParameters = freezeList(
  P.PAGE_GROUP,
  P.PAGE_LOCATION,
  P.PAGE_TITLE,
  P.PAGE_REFERRER,
  P.FLOOR_ID,
  P.FLOOR_TITLE,
  P.ROOM_ID,
  P.ROOM_TITLE,
  P.VISITOR_TYPE
);
const timelineContextParameters = freezeList(
  P.FLOOR_ID,
  P.FLOOR_TITLE,
  P.ROOM_ID,
  P.ROOM_TITLE,
  P.VISITOR_TYPE
);
const withTimelineContext = (...parameters) =>
  freezeList(...timelineContextParameters, ...parameters);

export const ANALYTICS_EVENT_PARAMETER_ALLOWLIST = Object.freeze({
  [E.PAGE_VIEW]: pageContextParameters,
  [E.PAGE_EXIT]: pageContextParameters,
  [E.TIMELINE_VIEW]: withTimelineContext(),
  [E.TIMELINE_CONTENT_CHANGE]: withTimelineContext(
    P.CONTENT_TYPE,
    P.ACTION_TYPE,
    P.PRESENTATION_TYPE
  ),
  [E.TIMELINE_MEDIA_ATTACH]: withTimelineContext(
    P.CONTENT_TYPE,
    P.ACTION_TYPE,
    P.MEDIA_TYPE
  ),
  [E.TIMELINE_TAG_CHANGE]: withTimelineContext(
    P.CONTENT_TYPE,
    P.TAG_ACTION,
    P.TAG_ID,
    P.TAG_NAME
  ),
  [E.TIMELINE_REACTION_CHANGE]: withTimelineContext(
    P.CONTENT_TYPE,
    P.REACTION_ACTION,
    P.REACTION_TYPE
  ),
  [E.TIMELINE_QUICK_TEXT_USE]: withTimelineContext(
    P.CONTENT_TYPE,
    P.QUICK_TEXT_ID,
    P.QUICK_TEXT_LABEL
  ),
  [E.TIMELINE_FILTER_CHANGE]: withTimelineContext(P.ACTION_TYPE),
  [E.TIMELINE_FILTER_SETTING]: withTimelineContext(P.SETTING_KEY, P.SETTING_VALUE),
  [E.TIMELINE_FILTER_TAG]: withTimelineContext(P.ACTION_TYPE, P.TAG_ID, P.TAG_NAME),
  [E.TIMELINE_DISPLAY_SAVE]: withTimelineContext(),
  [E.TIMELINE_DISPLAY_SETTING]: withTimelineContext(P.SETTING_KEY, P.SETTING_VALUE),
});

const requiredTimelineContext = freezeList(P.FLOOR_ID, P.ROOM_ID, P.VISITOR_TYPE);
const withRequiredTimelineContext = (...parameters) =>
  freezeList(...requiredTimelineContext, ...parameters);
const requiredPageContext = freezeList(
  P.PAGE_GROUP,
  P.PAGE_LOCATION,
  P.PAGE_TITLE,
  P.VISITOR_TYPE
);
const requiredParametersByEvent = Object.freeze({
  [E.PAGE_VIEW]: requiredPageContext,
  [E.PAGE_EXIT]: requiredPageContext,
  [E.TIMELINE_VIEW]: withRequiredTimelineContext(),
  [E.TIMELINE_CONTENT_CHANGE]: withRequiredTimelineContext(
    P.CONTENT_TYPE,
    P.ACTION_TYPE,
    P.PRESENTATION_TYPE
  ),
  [E.TIMELINE_MEDIA_ATTACH]: withRequiredTimelineContext(
    P.CONTENT_TYPE,
    P.ACTION_TYPE,
    P.MEDIA_TYPE
  ),
  [E.TIMELINE_TAG_CHANGE]: withRequiredTimelineContext(
    P.CONTENT_TYPE,
    P.TAG_ACTION,
    P.TAG_ID
  ),
  [E.TIMELINE_REACTION_CHANGE]: withRequiredTimelineContext(
    P.CONTENT_TYPE,
    P.REACTION_ACTION,
    P.REACTION_TYPE
  ),
  [E.TIMELINE_QUICK_TEXT_USE]: withRequiredTimelineContext(P.CONTENT_TYPE, P.QUICK_TEXT_ID),
  [E.TIMELINE_FILTER_CHANGE]: withRequiredTimelineContext(P.ACTION_TYPE),
  [E.TIMELINE_FILTER_SETTING]: withRequiredTimelineContext(P.SETTING_KEY, P.SETTING_VALUE),
  [E.TIMELINE_FILTER_TAG]: withRequiredTimelineContext(P.ACTION_TYPE, P.TAG_ID),
  [E.TIMELINE_DISPLAY_SAVE]: withRequiredTimelineContext(),
  [E.TIMELINE_DISPLAY_SETTING]: withRequiredTimelineContext(P.SETTING_KEY, P.SETTING_VALUE),
});

const objectIdPattern = /^[a-f\d]{24}$/iu;
const controlOrLinePattern = /[\p{Cc}\p{Zl}\p{Zp}]/u;
const loneSurrogatePattern = /[\uD800-\uDFFF]/u;
const emailPattern = /[^\s@]+@[^\s@]+\.[^\s@]+/u;
const absoluteUrlPattern = /\b[a-z][a-z\d+.-]*:\/\/\S+/iu;
const jwtPattern = /(?:^|[^A-Za-z\d_-])[A-Za-z\d_-]{8,}\.[A-Za-z\d_-]{8,}\.[A-Za-z\d_-]{8,}(?:$|[^A-Za-z\d_-])/u;
const assignedTokenPattern = /\b(?:authorization|bearer|jwt|token)\s*(?::|=|\s)\s*[A-Za-z\d._~+/=-]{8,}/iu;
const prefixedTokenPattern = /\b(?:ga1_|ghp_|glpat-|sk-|xox[baprs]-|ya29\.)[A-Za-z\d._~+/=-]{12,}/iu;
const hexTokenPattern = /^(?:0x)?[a-f\d]{24,128}$/iu;
const base64TokenPattern = /^(?=.{32,256}$)(?=.*[+/_=-])[A-Za-z\d+/_=-]+$/u;
const uuidPattern = /[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}/iu;
const phoneCandidatePattern = /\+?[\p{Nd}][\p{Nd}\s().-]{8,}[\p{Nd}]/gu;
const resourceIdPatterns = Object.freeze({
  [P.FLOOR_ID]: /^[a-f\d]{24}$/u,
  [P.ROOM_ID]: /^[a-f\d]{24}$/u,
  [P.TAG_ID]: /^tag_[a-f\d]{24}$/u,
  [P.QUICK_TEXT_ID]: /^quick_[a-f\d]{24}$/u,
});
const resourceTypeByParameter = Object.freeze({
  [P.FLOOR_ID]: 'floor',
  [P.ROOM_ID]: 'room',
  [P.TAG_ID]: 'tag',
  [P.QUICK_TEXT_ID]: 'quick_text',
});
const resourceLabelParameters = new Set([
  P.FLOOR_TITLE,
  P.ROOM_TITLE,
  P.TAG_NAME,
  P.QUICK_TEXT_LABEL,
]);
const canonicalPageByGroup = new Map(
  analyticsPageDefinitions.map((definition) => [definition.pageGroup, definition])
);
const canonicalPagePaths = new Set(
  analyticsPageDefinitions.map(({ canonicalPath }) => canonicalPath)
);
const floorPagePathPattern = /^\/floor\/([a-f\d]{24})$/u;
const timelinePagePathPattern =
  /^\/floor\/([a-f\d]{24})\/room\/([a-f\d]{24})$/u;
const enumSets = Object.fromEntries(
  Object.entries(ANALYTICS_ENUM_VALUES).map(([name, values]) => [name, new Set(values)])
);
const missingValue = Symbol('missing');
const invalidValue = Symbol('invalid');

const isPlainRecord = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
};

const readOwnDataValue = (record, name) => {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, name);
    if (!descriptor) return missingValue;
    return Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ? descriptor.value
      : invalidValue;
  } catch {
    return invalidValue;
  }
};

const containsPhoneNumber = (value) => {
  const candidates = value.match(phoneCandidatePattern) || [];
  return candidates.some((candidate) => {
    const digits = candidate.match(/\p{Nd}/gu) || [];
    return digits.length >= 10 && digits.length <= 15;
  });
};

const hasForbiddenResourceLabelFormat = (value) =>
  controlOrLinePattern.test(value) ||
  loneSurrogatePattern.test(value) ||
  emailPattern.test(value) ||
  absoluteUrlPattern.test(value) ||
  containsPhoneNumber(value) ||
  jwtPattern.test(value) ||
  assignedTokenPattern.test(value) ||
  prefixedTokenPattern.test(value) ||
  hexTokenPattern.test(value) ||
  base64TokenPattern.test(value) ||
  uuidPattern.test(value);

export const classifyAnalyticsPage = (routeName) =>
  typeof routeName === 'string' && Object.prototype.hasOwnProperty.call(ANALYTICS_PAGE_DEFINITIONS, routeName)
    ? ANALYTICS_PAGE_DEFINITIONS[routeName]
    : null;

export const classifyAnalyticsVirtualPage = (pageName) =>
  typeof pageName === 'string' &&
  Object.prototype.hasOwnProperty.call(ANALYTICS_VIRTUAL_PAGE_DEFINITIONS, pageName)
    ? ANALYTICS_VIRTUAL_PAGE_DEFINITIONS[pageName]
    : null;

export const normalizeAnalyticsResourceId = (resourceType, value) => {
  if (!Object.prototype.hasOwnProperty.call(ANALYTICS_RESOURCE_ID_PREFIXES, resourceType)) {
    return null;
  }
  if (typeof value !== 'string') return null;
  const objectId = value.trim().toLowerCase();
  if (!objectIdPattern.test(objectId)) return null;
  return `${ANALYTICS_RESOURCE_ID_PREFIXES[resourceType]}${objectId}`;
};

export const normalizeAnalyticsResourceLabel = (value) => {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFC');
  if (controlOrLinePattern.test(normalized) || loneSurrogatePattern.test(normalized)) return null;
  const trimmed = normalized.trim();
  if (!trimmed || hasForbiddenResourceLabelFormat(trimmed)) return null;
  return [...trimmed].slice(0, 100).join('');
};

export const normalizeAnalyticsPageResource = (pageGroup, resource) => {
  if (!isPlainRecord(resource)) return null;

  if (pageGroup === roomListPage.pageGroup) {
    const floorId = normalizeAnalyticsResourceId('floor', readOwnDataValue(resource, '_id'));
    if (!floorId) return null;
    const parameters = { [P.FLOOR_ID]: floorId };
    const floorTitle = normalizeAnalyticsResourceLabel(readOwnDataValue(resource, 'title'));
    if (floorTitle) parameters[P.FLOOR_TITLE] = floorTitle;
    return Object.freeze(parameters);
  }

  if (pageGroup === timelinePage.pageGroup) {
    const floor = readOwnDataValue(resource, 'floor');
    if (!isPlainRecord(floor)) return null;
    const floorId = normalizeAnalyticsResourceId('floor', readOwnDataValue(floor, '_id'));
    const roomId = normalizeAnalyticsResourceId('room', readOwnDataValue(resource, '_id'));
    if (!floorId || !roomId) return null;

    const parameters = {
      [P.FLOOR_ID]: floorId,
      [P.ROOM_ID]: roomId,
    };
    const floorTitle = normalizeAnalyticsResourceLabel(readOwnDataValue(floor, 'title'));
    const roomTitle = normalizeAnalyticsResourceLabel(readOwnDataValue(resource, 'title'));
    if (floorTitle) parameters[P.FLOOR_TITLE] = floorTitle;
    if (roomTitle) parameters[P.ROOM_TITLE] = roomTitle;
    return Object.freeze(parameters);
  }

  return null;
};

export const classifyAnalyticsSpeechSpeedBucket = (value) => {
  if (!Number.isFinite(value) || value < 0 || value > 3) return null;
  const scaled = value * 10;
  if (Math.abs(scaled - Math.round(scaled)) > 1e-9) return null;
  if (value === 0) return 'off';
  if (value < 1) return 'slow';
  if (value === 1) return 'normal';
  return 'fast';
};

const normalizePayloadResourceId = (parameterName, value) => {
  if (typeof value === 'string' && resourceIdPatterns[parameterName].test(value)) return value;
  return normalizeAnalyticsResourceId(resourceTypeByParameter[parameterName], value);
};

const classifyCanonicalPagePath = (pathname) => {
  const floorMatch = floorPagePathPattern.exec(pathname);
  if (floorMatch) {
    return Object.freeze({
      canonicalPath: roomListPage.canonicalPath,
      floorId: `${ANALYTICS_RESOURCE_ID_PREFIXES.floor}${floorMatch[1]}`,
      roomId: null,
    });
  }

  const timelineMatch = timelinePagePathPattern.exec(pathname);
  if (timelineMatch) {
    return Object.freeze({
      canonicalPath: timelinePage.canonicalPath,
      floorId: `${ANALYTICS_RESOURCE_ID_PREFIXES.floor}${timelineMatch[1]}`,
      roomId: `${ANALYTICS_RESOURCE_ID_PREFIXES.room}${timelineMatch[2]}`,
    });
  }

  return canonicalPagePaths.has(pathname)
    ? Object.freeze({ canonicalPath: pathname, floorId: null, roomId: null })
    : null;
};

const normalizeCanonicalPageUrl = (value) => {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value);
    const pagePath = classifyCanonicalPagePath(parsed.pathname);
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      !pagePath
    ) {
      return null;
    }
    const href = `${parsed.origin}${parsed.pathname}`;
    return value === href
      ? Object.freeze({ href, origin: parsed.origin, ...pagePath })
      : null;
  } catch {
    return null;
  }
};

const normalizeEventParameter = (parameterName, value) => {
  if (Object.prototype.hasOwnProperty.call(resourceTypeByParameter, parameterName)) {
    return normalizePayloadResourceId(parameterName, value);
  }
  if (resourceLabelParameters.has(parameterName)) {
    return normalizeAnalyticsResourceLabel(value);
  }
  if (Object.prototype.hasOwnProperty.call(enumSets, parameterName)) {
    return typeof value === 'string' && enumSets[parameterName].has(value) ? value : null;
  }
  if (parameterName === P.PAGE_TITLE) {
    return typeof value === 'string' && enumSets.page_group.has(value) ? value : null;
  }
  if (parameterName === P.PAGE_LOCATION || parameterName === P.PAGE_REFERRER) {
    return normalizeCanonicalPageUrl(value)?.href || null;
  }
  return null;
};

const normalizeSettingPair = (eventName, parameters) => {
  const key = readOwnDataValue(parameters, P.SETTING_KEY);
  const value = readOwnDataValue(parameters, P.SETTING_VALUE);
  if ([key, value].some((entry) => entry === missingValue || entry === invalidValue)) return null;
  if (typeof key !== 'string' || typeof value !== 'string') return null;

  const valueMap = eventName === E.TIMELINE_FILTER_SETTING
    ? ANALYTICS_FILTER_SETTING_VALUES
    : eventName === E.TIMELINE_DISPLAY_SETTING
      ? ANALYTICS_DISPLAY_SETTING_VALUES
      : null;
  if (!valueMap || !Object.prototype.hasOwnProperty.call(valueMap, key)) return null;
  return valueMap[key].includes(value) ? Object.freeze({ key, value }) : null;
};

const hasRequiredParameters = (eventName, payload) =>
  requiredParametersByEvent[eventName].every((name) =>
    Object.prototype.hasOwnProperty.call(payload, name)
  );

const hasOwn = (record, name) => Object.prototype.hasOwnProperty.call(record, name);

const isConsistentPageResource = (
  payload,
  location,
  { requireResolvedResource }
) => {
  const pageGroup = payload[P.PAGE_GROUP];
  const hasFloorId = hasOwn(payload, P.FLOOR_ID);
  const hasFloorTitle = hasOwn(payload, P.FLOOR_TITLE);
  const hasRoomId = hasOwn(payload, P.ROOM_ID);
  const hasRoomTitle = hasOwn(payload, P.ROOM_TITLE);
  const hasAnyResource = hasFloorId || hasFloorTitle || hasRoomId || hasRoomTitle;

  if (pageGroup === roomListPage.pageGroup) {
    if (!location.floorId || location.roomId) return false;
    if (hasRoomId || hasRoomTitle || (hasFloorTitle && !hasFloorId)) return false;
    if (hasFloorId && payload[P.FLOOR_ID] !== location.floorId) return false;
    return hasFloorId || (!requireResolvedResource && !hasAnyResource);
  }
  if (pageGroup === timelinePage.pageGroup) {
    if (!location.floorId || !location.roomId) return false;
    if ((hasFloorTitle && !hasFloorId) || (hasRoomTitle && !hasRoomId)) return false;
    if (hasFloorId && payload[P.FLOOR_ID] !== location.floorId) return false;
    if (hasRoomId && payload[P.ROOM_ID] !== location.roomId) return false;
    const hasCompleteIdentity = hasFloorId && hasRoomId;
    return hasCompleteIdentity || (!requireResolvedResource && !hasAnyResource);
  }
  return !location.floorId && !location.roomId && !hasAnyResource;
};

const isConsistentPagePayload = (payload, options) => {
  const definition = canonicalPageByGroup.get(payload[P.PAGE_GROUP]);
  const location = normalizeCanonicalPageUrl(payload[P.PAGE_LOCATION]);
  if (!definition || !location) return false;
  if (payload[P.PAGE_TITLE] !== definition.pageGroup) return false;
  if (location.canonicalPath !== definition.canonicalPath) return false;
  if (!isConsistentPageResource(payload, location, options)) return false;

  if (payload[P.PAGE_REFERRER]) {
    const referrer = normalizeCanonicalPageUrl(payload[P.PAGE_REFERRER]);
    if (!referrer || referrer.origin !== location.origin) delete payload[P.PAGE_REFERRER];
  }
  return true;
};

const isConsistentContentPayload = (eventName, payload) => {
  if (eventName !== E.TIMELINE_CONTENT_CHANGE) return true;
  const supplement = ['post_supplement', 'reply_supplement'].includes(payload[P.CONTENT_TYPE]);
  return !supplement || payload[P.PRESENTATION_TYPE] === 'static';
};

const isConsistentFilterTagPayload = (eventName, payload) =>
  eventName !== E.TIMELINE_FILTER_TAG ||
  ['create', 'update'].includes(payload[P.ACTION_TYPE]);

const buildAnalyticsPayload = (
  eventName,
  parameters,
  { requireResolvedPageResource = true } = {}
) => {
  if (
    typeof eventName !== 'string' ||
    !Object.prototype.hasOwnProperty.call(ANALYTICS_EVENT_PARAMETER_ALLOWLIST, eventName) ||
    !isPlainRecord(parameters)
  ) {
    return null;
  }

  const required = new Set(requiredParametersByEvent[eventName]);
  const payload = {};
  for (const parameterName of ANALYTICS_EVENT_PARAMETER_ALLOWLIST[eventName]) {
    if ([P.SETTING_KEY, P.SETTING_VALUE].includes(parameterName)) continue;
    const value = readOwnDataValue(parameters, parameterName);
    if (value === missingValue) continue;
    if (value === invalidValue) {
      if (required.has(parameterName)) return null;
      continue;
    }
    const normalized = normalizeEventParameter(parameterName, value);
    if (normalized === null) {
      if (required.has(parameterName)) return null;
      continue;
    }
    payload[parameterName] = normalized;
  }

  if ([E.TIMELINE_FILTER_SETTING, E.TIMELINE_DISPLAY_SETTING].includes(eventName)) {
    const setting = normalizeSettingPair(eventName, parameters);
    if (!setting) return null;
    payload[P.SETTING_KEY] = setting.key;
    payload[P.SETTING_VALUE] = setting.value;
  }

  if (!hasRequiredParameters(eventName, payload)) return null;
  if (
    [E.PAGE_VIEW, E.PAGE_EXIT].includes(eventName) &&
    !isConsistentPagePayload(payload, { requireResolvedResource: requireResolvedPageResource })
  ) {
    return null;
  }
  if (!isConsistentContentPayload(eventName, payload)) return null;
  if (!isConsistentFilterTagPayload(eventName, payload)) return null;
  return Object.freeze(payload);
};

export const buildAnalyticsPageContext = (parameters) =>
  buildAnalyticsPayload(E.PAGE_VIEW, parameters, { requireResolvedPageResource: false });

export const buildAnalyticsEventPayload = (eventName, parameters) =>
  buildAnalyticsPayload(eventName, parameters);
