const STORAGE_KEY = 'iseeetl_store';
const SCHEMA_VERSION = 1;
const USER_ROLES = new Set(['Administrator', 'Editor', 'Author', 'developer']);

const USER_FIELDS = [
  'id',
  'role',
  'name',
  'imageName',
  'token',
  'isLogin',
  'guestId',
  'guestName',
  'lang',
  'eyeFriendlyMode',
  'pushEnabled',
  'replyPushEnabled',
  'repliedPostPushEnabled',
];
const GUEST_CACHE_FIELDS = ['guestId', 'guestName', 'guestLang'];
const FLOOR_FIELDS = ['id', 'title', 'targetLangs'];
const ROOM_FIELDS = ['id', 'title', 'memberOnly', 'role'];
const SETTING_FIELDS = [
  'speechSpeed',
  'displayName',
  'displayDate',
  'displayTag',
  'displaySupplement',
  'displayActionButton',
  'enableTextAnimation',
  'animationSpeed',
  'displayUserKickButton',
];
const ARIA_FIELDS = ['appToolbar', 'appMenu', 'appView'];

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isPlainObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const isNullableString = (value) => value === null || typeof value === 'string';
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const sanitizeStringArray = (value) =>
  Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : null;

const pick = (source, fields) => {
  const result = {};
  fields.forEach((field) => {
    if (source && hasOwn(source, field)) result[field] = source[field];
  });
  return result;
};

const resetAuthentication = (user) => {
  Object.assign(user, {
    id: null,
    role: null,
    name: null,
    imageName: null,
    token: null,
    isLogin: false,
    guestId: null,
    guestName: null,
    guestToken: null,
  });
};

const applyUser = (target, source) => {
  if (!isPlainObject(source)) return;

  ['eyeFriendlyMode', 'pushEnabled', 'replyPushEnabled', 'repliedPostPushEnabled'].forEach((field) => {
    if (typeof source[field] === 'boolean') target[field] = source[field];
  });
  if (isNullableString(source.lang)) target.lang = source.lang;

  if (source.isLogin === true) {
    const validLogin =
      typeof source.id === 'string' &&
      source.id.length > 0 &&
      typeof source.token === 'string' &&
      source.token.length > 0 &&
      USER_ROLES.has(source.role) &&
      (source.guestId === null || source.guestId === '' || typeof source.guestId === 'undefined') &&
      (source.guestName === null || source.guestName === '' || typeof source.guestName === 'undefined');
    if (!validLogin) {
      resetAuthentication(target);
      return;
    }
    Object.assign(target, {
      id: source.id,
      role: source.role,
      token: source.token,
      isLogin: true,
      guestId: null,
      guestName: null,
      guestToken: null,
    });
    if (isNullableString(source.name)) target.name = source.name;
    if (isNullableString(source.imageName)) target.imageName = source.imageName;
    return;
  }

  resetAuthentication(target);
  if (isNullableString(source.guestId)) target.guestId = source.guestId;
  if (isNullableString(source.guestName)) target.guestName = source.guestName;
};

const assignNullableStrings = (target, source, fields) => {
  if (!isPlainObject(source)) return;
  fields.forEach((field) => {
    if (isNullableString(source[field])) target[field] = source[field];
  });
};

const sanitizeConditions = (conditions) => {
  if (conditions === null) return null;
  if (!isPlainObject(conditions) || !Array.isArray(conditions.tags)) return null;
  if (conditions.tags.some((tag) => typeof tag !== 'string')) return null;
  if (
    hasOwn(conditions, 'keywordArray') &&
    (!Array.isArray(conditions.keywordArray) || conditions.keywordArray.some((keyword) => typeof keyword !== 'string'))
  ) {
    return null;
  }
  if (
    hasOwn(conditions, 'displayOrder') &&
    (!Array.isArray(conditions.displayOrder) ||
      conditions.displayOrder.some(
        (entry) => !isPlainObject(entry) || typeof entry.key !== 'string' || entry.key.length === 0
      ))
  ) {
    return null;
  }
  return { ...conditions };
};

const sanitizeFilter = (filter) => {
  if (!isPlainObject(filter) || !hasOwn(filter, 'conditions')) return null;
  const conditions = sanitizeConditions(filter.conditions);
  if (filter.conditions !== null && conditions === null) return null;

  const result = { conditions };
  for (const field of ['id', 'pushFilterId']) {
    if (hasOwn(filter, field) && typeof filter[field] !== 'undefined') {
      if (!isNullableString(filter[field])) return null;
      result[field] = filter[field];
    }
  }
  if (hasOwn(filter, 'size') && typeof filter.size !== 'undefined') {
    if (!isFiniteNumber(filter.size)) return null;
    result.size = filter.size;
  }
  for (const field of ['showUserIcon', 'speech', 'webPush']) {
    if (hasOwn(filter, field) && typeof filter[field] !== 'undefined') {
      if (typeof filter[field] !== 'boolean') return null;
      result[field] = filter[field];
    }
  }
  return result;
};

const sanitizeFilters = (value) => {
  if (!isPlainObject(value)) return {};
  const result = {};
  Object.entries(value).forEach(([roomId, filters]) => {
    if (!roomId || !Array.isArray(filters)) return;
    result[roomId] = filters.map(sanitizeFilter).filter(Boolean);
  });
  return result;
};

const sanitizeGuestSoundTags = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry) =>
        isPlainObject(entry) &&
        typeof entry.roomId === 'string' &&
        entry.roomId.length > 0 &&
        Array.isArray(entry.soundTags) &&
        entry.soundTags.every((tag) => typeof tag === 'string')
    )
    .map(({ roomId, soundTags }) => ({ roomId, soundTags: [...soundTags] }));
};

const buildPersistedState = (state) => ({
  schemaVersion: SCHEMA_VERSION,
  user: pick(state.user, USER_FIELDS),
  guestCache: pick(state.guestCache, GUEST_CACHE_FIELDS),
  floor: pick(state.floor, FLOOR_FIELDS),
  room: pick(state.room, ROOM_FIELDS),
  tag: { list: sanitizeStringArray(state.tag?.list) || [] },
  setting: pick(state.setting, SETTING_FIELDS),
  ariahidden: pick(state.ariahidden, ARIA_FIELDS),
  error: { message: state.error?.message ?? null },
  guestSoundTags: sanitizeGuestSoundTags(state.guestSoundTags),
  filters: sanitizeFilters(state.filters),
  tempRoomId: isNullableString(state.tempRoomId) ? state.tempRoomId : null,
});

const applyStoredState = (state, storage) => {
  applyUser(state.user, storage.user);

  assignNullableStrings(state.guestCache, storage.guestCache, GUEST_CACHE_FIELDS);
  assignNullableStrings(state.floor, storage.floor, ['id', 'title']);
  const targetLangs = sanitizeStringArray(storage.floor?.targetLangs);
  if (targetLangs) state.floor.targetLangs = targetLangs;

  assignNullableStrings(state.room, storage.room, ['id', 'title', 'role']);
  if (typeof storage.room?.memberOnly === 'boolean') state.room.memberOnly = storage.room.memberOnly;

  const tags = sanitizeStringArray(storage.tag?.list);
  if (isPlainObject(storage.tag) && tags) state.tag.list = tags;

  if (isPlainObject(storage.setting)) {
    if (isFiniteNumber(storage.setting.speechSpeed)) state.setting.speechSpeed = storage.setting.speechSpeed;
    if (typeof storage.setting.animationSpeed === 'string') {
      state.setting.animationSpeed = storage.setting.animationSpeed;
    }
    SETTING_FIELDS.filter((field) => !['speechSpeed', 'animationSpeed'].includes(field)).forEach((field) => {
      if (typeof storage.setting[field] === 'boolean') state.setting[field] = storage.setting[field];
    });
  }

  if (isPlainObject(storage.ariahidden)) {
    ARIA_FIELDS.forEach((field) => {
      if (typeof storage.ariahidden[field] === 'boolean') state.ariahidden[field] = storage.ariahidden[field];
    });
  }
  if (isPlainObject(storage.error) && isNullableString(storage.error.message)) {
    state.error.message = storage.error.message;
  }
  if (Array.isArray(storage.guestSoundTags)) state.guestSoundTags = sanitizeGuestSoundTags(storage.guestSoundTags);
  if (isPlainObject(storage.filters)) state.filters = sanitizeFilters(storage.filters);
  if (isNullableString(storage.tempRoomId)) state.tempRoomId = storage.tempRoomId;
};

export const saveState = (store) => {
  store.subscribe((mutation, state) => {
    if (mutation.type === 'logout') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPersistedState(state)));
    } catch (error) {
      void error;
    }
  });
};

export const persistenceDomain = {
  mutations: {
    loadState(state) {
      try {
        const item = localStorage.getItem(STORAGE_KEY);
        if (!item) return;
        const storage = JSON.parse(item);
        if (!isPlainObject(storage)) return;
        if (hasOwn(storage, 'schemaVersion') && storage.schemaVersion !== SCHEMA_VERSION) return;
        applyStoredState(state, storage);
      } catch (error) {
        void error;
      }
    },
    logout(state) {
      const cachedGuest = state.guestCache || {};
      Object.assign(state.user, {
        id: null,
        role: null,
        name: null,
        imageName: null,
        token: null,
        isLogin: false,
        guestId: cachedGuest.guestId || null,
        guestName: cachedGuest.guestName || null,
        guestToken: cachedGuest.guestToken || null,
        lang: cachedGuest.guestLang || null,
        eyeFriendlyMode: false,
        pushEnabled: false,
        replyPushEnabled: true,
        repliedPostPushEnabled: true,
      });
      Object.assign(state.floor, { id: null, title: null, targetLangs: null });
      Object.assign(state.room, { id: null, title: null, memberOnly: false, role: null });
      state.tag.list = [];
      state.tagClipboard.list = [];
      Object.assign(state.ariahidden, { appToolbar: false, appMenu: true, appView: false });
      state.tempRoomId = null;
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (error) {
        void error;
      }
    },
  },
  actions: {
    doLoadState: ({ commit }) => commit('loadState'),
  },
};
