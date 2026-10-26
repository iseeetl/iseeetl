import { normalizeUpdatePreference } from '@/features/timeline/updateNotices';
import { refreshSpeechVisibility } from '@/features/timeline/audio';
import { normalizeAIVisibility, isSupplementVisible } from '@/features/timeline/aiVisibility';

export const preferencesDomain = {
  getters: {
    roomUpdatePreference: state => roomId => normalizeUpdatePreference(state.roomUpdatePreferences?.[roomId]),
    roomAIVisibility: (state) => (roomId) => normalizeAIVisibility(state.roomAIVisibility?.[roomId]),
    isSupplementVisible: (state) => (supplement, roomId = state.room.id) =>
      isSupplementVisible(supplement, state.setting.displaySupplement, state.roomAIVisibility?.[roomId?._id || roomId]),
    speechSpeed: (state) => state.setting.speechSpeed,
    displayName: (state) => state.setting.displayName,
    displayDate: (state) => state.setting.displayDate,
    displayTag: (state) => state.setting.displayTag,
    displayAlternativeText: (state) => state.setting.displayAlternativeText !== false,
    displaySupplement: (state) => state.setting.displaySupplement,
    displayActionButton: (state) => state.setting.displayActionButton,
    enableTextAnimation: (state) => state.setting.enableTextAnimation,
    animationSpeed: (state) => state.setting.animationSpeed,
    displayUserKickButton: (state) => state.setting.displayUserKickButton,
    ariahiddenAppToolbar: (state) => state.ariahidden.appToolbar,
    ariahiddenAppMenu: (state) => state.ariahidden.appMenu,
    ariahiddenAppView: (state) => state.ariahidden.appView,
    inertAppContainer: (state) => state.inertAppContainer,
  },
  mutations: {
    setRoomUpdatePreference(state, {roomId, preference}) {
      if (!/^[a-f0-9]{24}$/i.test(roomId || '')) return;
      const next = normalizeUpdatePreference(preference);
      if (JSON.stringify(normalizeUpdatePreference(state.roomUpdatePreferences?.[roomId])) !== JSON.stringify(next)) state.updateNotices = (state.updateNotices || []).filter(n => n.roomId !== roomId);
      state.roomUpdatePreferences = {...state.roomUpdatePreferences,[roomId]:next};
    },
    appendUpdateNotices(state, entries) {
      let list = [...(state.updateNotices || [])];
      for (const entry of entries) {
        const key = [entry.roomId,entry.postId,entry.replyId,entry.supplementId,entry.kind,entry.media].join(':');
        list = list.filter(n => n.key !== key);
        list.push({...entry,key});
      }
      state.updateNotices = list.slice(-100);
    },
    dismissUpdateNotices(state, keys) { state.updateNotices = (state.updateNotices || []).filter(n => !keys.includes(n.key)); },
    setRoomAIVisibility(state, { roomId, preference }) {
      if (!/^[a-f0-9]{24}$/i.test(roomId || '')) return;
      state.roomAIVisibility = { ...state.roomAIVisibility, [roomId]: normalizeAIVisibility(preference) };
      refreshSpeechVisibility();
    },
    setTimeLineSetting(state, data) {
      Object.assign(state.setting, {
        speechSpeed: data.speechSpeed,
        displayName: data.displayName,
        displayDate: data.displayDate,
        displayTag: data.displayTag,
        displaySupplement: data.displaySupplement,
        displayAlternativeText: data.displayAlternativeText ?? state.setting.displayAlternativeText ?? true,
        displayActionButton: data.displayActionButton,
        enableTextAnimation: data.enableTextAnimation,
        animationSpeed: data.animationSpeed,
        displayUserKickButton: data.displayUserKickButton,
      });
      refreshSpeechVisibility();
    },
    setInertAppContainer(state, data) {
      state.inertAppContainer = data;
    },
  },
  actions: {
    doUpdateTimeLineSetting: ({ commit }, data) => commit('setTimeLineSetting', data),
    doSetInertAppContainer: ({ commit }, data) => commit('setInertAppContainer', data),
  },
};
