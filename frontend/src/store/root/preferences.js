import { refreshSpeechVisibility } from '@/features/timeline/audio';
import { normalizeAIVisibility, isSupplementVisible } from '@/features/timeline/aiVisibility';

export const preferencesDomain = {
  getters: {
    roomAIVisibility: (state) => (roomId) => normalizeAIVisibility(state.roomAIVisibility?.[roomId]),
    isSupplementVisible: (state) => (supplement, roomId = state.room.id) =>
      isSupplementVisible(supplement, state.setting.displaySupplement, state.roomAIVisibility?.[roomId?._id || roomId]),
    speechSpeed: (state) => state.setting.speechSpeed,
    displayName: (state) => state.setting.displayName,
    displayDate: (state) => state.setting.displayDate,
    displayTag: (state) => state.setting.displayTag,
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
