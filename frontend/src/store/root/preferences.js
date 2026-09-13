export const preferencesDomain = {
  getters: {
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
