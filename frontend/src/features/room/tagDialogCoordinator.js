export const createRoomTagDialogState = () => ({
  floor: {
    listVisible: false,
  },
  room: {
    listVisible: false,
    roomId: null,
  },
});

export const tagDialogCoordinator = {
  toggleFloorList(state, scheduleNextTick) {
    if (state.floor.listVisible) {
      scheduleNextTick(() => {
        state.floor.listVisible = false;
      });
      return;
    }

    state.floor.listVisible = true;
  },
  closeFloorList(state) {
    state.floor.listVisible = false;
  },
  openRoomList(state, roomId) {
    state.room.roomId = roomId;
    state.room.listVisible = true;
  },
  closeRoomList(state) {
    state.room.listVisible = false;
    state.room.roomId = null;
  },
};
