import { resolveDefaultGuestName } from '@/constants/defaultGuestNames.js';
import { normalizeSupportedLocale, resolveInitialLocale } from '@/utils/locale.js';
import { captureAuthSnapshot, isAuthSnapshotCurrent } from './authRuntime.js';

const getGuestApi = async () => {
  const guestApiModule = await import('@/api/guest');
  return guestApiModule && guestApiModule.default ? guestApiModule.default : guestApiModule;
};

const getAuthApi = async () => {
  const authApiModule = await import('@/api/auth');
  return authApiModule && authApiModule.default ? authApiModule.default : authApiModule;
};

const getOneSignalHelpers = () => import('@/utils/onesignalHelpers');

const guestSocketAuthRequests = new Map();

const normalizeGuestSocketAuthError = (error) => {
  const response = error?.response;
  const data = response?.data;
  return {
    status: response?.status ?? error?.status ?? null,
    code: data?.error?.code || data?.code || error?.code || null,
  };
};

const isSameGuestAuthSubject = (getters, expectedGuestId) =>
  !getters.userIsLogin && getters.guestId === expectedGuestId;

const resolveGuestName = (getters, apiGuestName = null, lang = getters.lang || 'ja') => {
  return getters.guestName || apiGuestName || resolveDefaultGuestName(lang);
};

const resolveGuestLang = (getters, apiGuestLang = null) =>
  normalizeSupportedLocale(getters.lang || apiGuestLang || resolveInitialLocale());

const isCurrentAuthenticatedUser = (state, user) => {
  if (!state.user.isLogin || state.user.id == null || user?._id == null) return false;
  return String(state.user.id) === String(user._id);
};

const performGuestSocketAuthRecovery = async ({ commit, getters }, expectedGuestId) => {
  const guestApi = await getGuestApi();
  const guestLang = resolveGuestLang(getters);
  const guestName = resolveGuestName(getters, null, guestLang);

  try {
    const res = await guestApi.refresh();
    if (!isSameGuestAuthSubject(getters, expectedGuestId)) return { status: 'stale' };

    commit('setGuestUser', {
      guest_id: res.data.guest_id,
      guest_name: guestName,
      lang: guestLang,
      guest_token: res.data.guest_token,
    });
    return { status: 'refreshed' };
  } catch (error) {
    const normalized = normalizeGuestSocketAuthError(error);
    const canBootstrap =
      normalized.status === 401 && (normalized.code === 'TOKEN_INVALID' || normalized.code === 'TOKEN_EXPIRED');
    if (!canBootstrap) return { status: 'failed', error: normalized };
  }

  if (!isSameGuestAuthSubject(getters, expectedGuestId)) return { status: 'stale' };

  try {
    const res = await guestApi.bootstrap({ guest_name: guestName, lang: guestLang });
    if (!isSameGuestAuthSubject(getters, expectedGuestId)) return { status: 'stale' };

    commit('setGuestUser', {
      guest_id: res.data.guest_id,
      guest_name: res.data.guest_name || guestName,
      lang: res.data.lang || guestLang,
      guest_token: res.data.guest_token,
    });
    return { status: 'bootstrapped' };
  } catch (error) {
    return { status: 'failed', error: normalizeGuestSocketAuthError(error) };
  }
};

const recoverGuestSocketAuth = (context) => {
  const { getters } = context;
  const expectedGuestId = getters.guestId;
  if (getters.userIsLogin || !expectedGuestId) return Promise.resolve({ status: 'stale' });

  const currentRequest = guestSocketAuthRequests.get(expectedGuestId);
  if (currentRequest) return currentRequest;

  const request = performGuestSocketAuthRecovery(context, expectedGuestId);
  guestSocketAuthRequests.set(expectedGuestId, request);
  void request.then(
    () => {
      if (guestSocketAuthRequests.get(expectedGuestId) === request) {
        guestSocketAuthRequests.delete(expectedGuestId);
      }
    },
    () => {
      if (guestSocketAuthRequests.get(expectedGuestId) === request) {
        guestSocketAuthRequests.delete(expectedGuestId);
      }
    }
  );
  return request;
};

export const authDomain = {
  getters: {
    userId: (state) => state.user.id,
    userRole: (state) => state.user.role,
    userName: (state) => state.user.name,
    userImageName: (state) => state.user.imageName,
    resolveUserDisplayName: (state) => (user) =>
      isCurrentAuthenticatedUser(state, user) ? state.user.name : user?.username,
    resolveUserDisplayImageName: (state) => (user) =>
      isCurrentAuthenticatedUser(state, user) ? state.user.imageName : user?.image_name,
    userToken: (state) => state.user.token,
    userIsLogin: (state) => state.user.isLogin,
    guestId: (state) => state.user.guestId,
    guestName: (state) => state.user.guestName,
    guestToken: (state) => state.user.guestToken,
    lang: (state) => state.user.lang,
    userEyeFriendlyMode: (state) => state.user.eyeFriendlyMode,
    userReplyPushEnabled: (state) => state.user.replyPushEnabled,
    userRepliedPostPushEnabled: (state) => state.user.repliedPostPushEnabled,
  },
  mutations: {
    setLoginUser(state, data) {
      if (state.guestCache) {
        state.guestCache.guestId = state.user.guestId;
        state.guestCache.guestName = state.user.guestName;
        state.guestCache.guestLang = state.user.lang;
        state.guestCache.guestToken = state.user.guestToken;
      }
      Object.assign(state.user, {
        id: data.id,
        role: data.role,
        name: data.name,
        lang: normalizeSupportedLocale(data.lang),
        imageName: data.imageName,
        token: data.token,
        isLogin: true,
        guestId: null,
        guestName: null,
        guestToken: null,
        eyeFriendlyMode: data.eyeFriendlyMode,
        pushEnabled: data.pushEnabled,
        replyPushEnabled: data.replyPushEnabled,
        repliedPostPushEnabled: data.repliedPostPushEnabled,
      });
    },
    setUserToken(state, token) {
      state.user.token = token;
    },
    setUserRole(state, data) {
      state.user.role = data.role;
    },
    setUserIdentity(state, data) {
      if (Object.prototype.hasOwnProperty.call(data, 'name')) state.user.name = data.name;
      if (Object.prototype.hasOwnProperty.call(data, 'imageName')) state.user.imageName = data.imageName;
    },
    setProfile(state, data) {
      Object.assign(state.user, {
        name: data.name,
        imageName: data.imageName,
        lang: normalizeSupportedLocale(data.lang, state.user.lang || 'en'),
        eyeFriendlyMode: data.eyeFriendlyMode,
        pushEnabled: data.pushEnabled,
        replyPushEnabled: data.replyPushEnabled,
        repliedPostPushEnabled: data.repliedPostPushEnabled,
      });
    },
    setGuestUser(state, data) {
      state.user.guestId = data.guest_id;
      state.user.guestName = data.guest_name;
      state.user.lang = normalizeSupportedLocale(data.lang, state.user.lang || 'en');
      if (Object.prototype.hasOwnProperty.call(data, 'guest_token')) {
        state.user.guestToken = data.guest_token;
      }
    },
    setLang(state, data) {
      state.user.lang = normalizeSupportedLocale(data.lang, state.user.lang || 'en');
    },
  },
  actions: {
    doUpdateLoginUser: ({ commit }, data) => commit('setLoginUser', data),
    doUpdateUserToken: ({ commit }, token) => commit('setUserToken', token),
    doUpdateUserRole: ({ commit }, data) => commit('setUserRole', data),
    doUpdateUserIdentity: ({ commit }, data) => commit('setUserIdentity', data),
    doUpdateProfile: ({ commit }, data) => commit('setProfile', data),
    doUpdateGuestUser: ({ commit }, data) => commit('setGuestUser', data),
    doSetLang: ({ commit }, data) => commit('setLang', data),
    async doEnsureOneSignalIdentity(context) {
      const { getters } = context;
      if (!getters.userIsLogin || !getters.oneSignalPushAvailable) return null;
      const actionSnapshot = captureAuthSnapshot(context);

      const authApi = await getAuthApi();
      if (!isAuthSnapshotCurrent(actionSnapshot)) return null;
      const res = await authApi.fetchPushIdentity();
      if (!isAuthSnapshotCurrent(actionSnapshot)) return null;
      const externalId = res?.data?.onesignal_external_id;
      if (!externalId) return null;

      const oneSignalHelpers = await getOneSignalHelpers();
      if (!isAuthSnapshotCurrent(actionSnapshot)) return null;
      oneSignalHelpers.maybeLoginOneSignal(externalId);
      return externalId;
    },
    async doRefreshGuestToken(context, options = {}) {
      const { commit, getters } = context;
      if (getters.userIsLogin) return null;
      const actionSnapshot = captureAuthSnapshot(context);
      const requestSnapshot = options.authSnapshot;
      const isCurrent = () =>
        isAuthSnapshotCurrent(actionSnapshot) && (!requestSnapshot || isAuthSnapshotCurrent(requestSnapshot));
      if (!isCurrent()) return null;
      const guestApi = await getGuestApi();
      if (!isCurrent()) return null;
      const res = await guestApi.refresh();
      if (!isCurrent()) return null;
      const guestLang = resolveGuestLang(getters, res.data.lang);
      const guestName = resolveGuestName(getters, res.data.guest_name, guestLang);
      commit('setGuestUser', {
        guest_id: res.data.guest_id,
        guest_name: guestName,
        lang: guestLang,
        guest_token: res.data.guest_token,
      });
      return res;
    },
    async doEnsureGuestAuth(context) {
      const { dispatch, getters, commit } = context;
      if (getters.userIsLogin) return null;
      const actionSnapshot = captureAuthSnapshot(context);
      const guestApi = await getGuestApi();
      try {
        return await dispatch('doRefreshGuestToken', { authSnapshot: actionSnapshot });
      } catch {
        if (!isAuthSnapshotCurrent(actionSnapshot)) return null;
        const guestLang = resolveGuestLang(getters);
        const guestName = resolveGuestName(getters, null, guestLang);
        const res = await guestApi.bootstrap({ guest_name: guestName, lang: guestLang });
        if (!isAuthSnapshotCurrent(actionSnapshot)) return null;
        commit('setGuestUser', {
          guest_id: res.data.guest_id,
          guest_name: res.data.guest_name || guestName,
          lang: res.data.lang || guestLang,
          guest_token: res.data.guest_token,
        });
        return res;
      }
    },
    doRecoverGuestSocketAuth(context) {
      return recoverGuestSocketAuth(context);
    },
    async doLogout(context, options = {}) {
      const { commit, dispatch, getters } = context;
      const actionSnapshot = captureAuthSnapshot(context);
      const requestSnapshot = options.authSnapshot;
      const isCurrent = () =>
        isAuthSnapshotCurrent(actionSnapshot) && (!requestSnapshot || isAuthSnapshotCurrent(requestSnapshot));
      if (!isCurrent()) return null;

      const authApi = await getAuthApi();
      if (!isCurrent()) return null;
      await authApi.logout();
      if (!isCurrent()) return null;

      let oneSignalLogoutStarted = false;
      try {
        if (typeof window.OneSignal?.logout === 'function') {
          oneSignalLogoutStarted = true;
          await window.OneSignal.logout();
        }
      } catch (error) {
        void error;
      }
      if (!isCurrent()) {
        const userIsLogin = getters?.userIsLogin ?? context.rootState?.user?.isLogin;
        if (oneSignalLogoutStarted && userIsLogin) {
          try {
            await dispatch('doEnsureOneSignalIdentity');
          } catch (error) {
            void error;
          }
        }
        return null;
      }
      commit('logout');
      // ユーザのCookieは削除済みのため、ゲスト認証の失敗でログアウトを失敗扱いにしない。
      try { await dispatch('doEnsureGuestAuth'); } catch { /* ゲスト認証は次の利用時に再試行する。 */ }
    },
  },
};
