export const contextDomain = {
  getters: {
    floorId: (state) => state.floor.id,
    floorTitle: (state) => state.floor.title,
    floorTargetLangs: (state) => state.floor.targetLangs,
    roomId: (state) => state.room.id,
    roomTitle: (state) => state.room.title,
    roomMemberOnly: (state) => state.room.memberOnly,
    roomRole: (state) => state.room.role,
    tagList: (state) => state.tag.list,
    tagClipboardList: (state) => state.tagClipboard.list,
    guestSoundTags: (state) => state.guestSoundTags,
    filters: (state) => state.filters,
    tempRoomId: (state) => state.tempRoomId,
  },
  mutations: {
    setFloor(state, data) {
      state.floor.id = data.id;
      state.floor.title = data.title;
    },
    setFloorId(state, data) {
      state.floor.id = data.id;
    },
    setFloorTitle(state, data) {
      state.floor.title = data.title;
    },
    setFloorTargetLangs(state, data) {
      state.floor.targetLangs = data.targetLangs;
    },
    setRoom(state, data) {
      Object.assign(state.room, {
        id: data.id,
        title: data.title,
        memberOnly: data.memberOnly,
        role: data.role,
      });
    },
    setRoomId(state, data) {
      state.room.id = data.id;
    },
    setRoomTitle(state, data) {
      state.room.title = data.title;
    },
    setRoomMemberOnly(state, data) {
      state.room.memberOnly = data.memberOnly;
    },
    setRoomRole(state, data) {
      state.room.role = data.role;
    },
    setTagList(state, data) {
      state.tag.list = data.list;
    },
    setTagClipboardList(state, data) {
      state.tagClipboard.list = Array.isArray(data.list) ? data.list.slice() : [];
    },
    setGuestSoundTags(state, data) {
      state.guestSoundTags = data.guestSoundTags;
    },
    setFilters(state, data) {
      if (data.filters.length !== 0) state.filters[data.roomId] = data.filters;
      else delete state.filters[data.roomId];
    },
    setTempRoomId(state, data) {
      state.tempRoomId = data.tempRoomId;
    },
  },
  actions: {
    doUpdateFloor: ({ commit }, data) => commit('setFloor', data),
    doUpdateFloorId: ({ commit }, data) => commit('setFloorId', data),
    doUpdateFloorTitle: ({ commit }, data) => commit('setFloorTitle', data),
    doUpdateFloorTargetLangs: ({ commit }, data) => commit('setFloorTargetLangs', data),
    doUpdateRoom: ({ commit }, data) => commit('setRoom', data),
    doUpdateRoomId: ({ commit }, data) => commit('setRoomId', data),
    doUpdateRoomTitle: ({ commit }, data) => commit('setRoomTitle', data),
    doUpdateRoomMemberOnly: ({ commit }, data) => commit('setRoomMemberOnly', data),
    doUpdateRoomRole: ({ commit }, data) => commit('setRoomRole', data),
    doUpdateTagList: ({ commit }, data) => commit('setTagList', data),
    doSetTagClipboardList: ({ commit }, data) => commit('setTagClipboardList', data),
    doSetGuestSoundTags: ({ commit }, data) => commit('setGuestSoundTags', data),
    doSetFilters: ({ commit }, data) => commit('setFilters', data),
    doSetTempRoomId: ({ commit }, data) => commit('setTempRoomId', data),
  },
};
