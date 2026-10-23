export const feedbackDomain = {
  getters: {
    errorMessage: (state) => state.error.message,
    politeMessage: (state) => state.message.politeMessage,
    assertiveMessage: (state) => state.message.assertiveMessage,
    snackbarVisible: (state) => state.message.snackbarVisible,
    snackbarAction: (state) => state.message.snackbarAction,
    snackbarMessage: (state) => state.message.snackbarMessage,
    snackbarPosition: (state) => state.message.snackbarPosition,
    snackbarDuration: (state) => state.message.snackbarDuration,
    snackbarIsInfinity: (state) => state.message.snackbarIsInfinity,
  },
  mutations: {
    setErrorMessage(state, data) {
      state.error.message = data.message;
    },
    setSnackbar(state, { message, role = 'status', action = null }) {
      state.message.snackbarAction = action;
      state.message.snackbarMessage = message;
      state.message.snackbarVisible = true;
      if (role === 'alert') {
        state.message.assertiveMessage = message;
        state.message.politeMessage = '';
      } else {
        state.message.politeMessage = message;
        state.message.assertiveMessage = '';
      }
    },
    hideSnackbar(state) {
      state.message.snackbarVisible = false;
      state.message.snackbarMessage = '';
      state.message.snackbarAction = null;
      state.message.assertiveMessage = '';
      state.message.politeMessage = '';
    },
  },
  actions: {
    doUpdateErrorMessage: ({ commit }, data) => commit('setErrorMessage', data),
    doShowSnackbar: ({ commit }, { message, role = 'status', action = null }) => commit('setSnackbar', { message, role, action }),
    doHideSnackbar: ({ commit }) => commit('hideSnackbar'),
  },
};
