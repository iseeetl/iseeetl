import { expect, vi } from 'vitest';
import { createRoomTagDialogState, tagDialogCoordinator } from '@/features/room/tagDialogCoordinator';

describe('タグダイアログの開閉状態', () => {
  it('ダイアログ状態をインスタンスごとに生成する', () => {
    const first = createRoomTagDialogState();
    const second = createRoomTagDialogState();

    expect(first).to.deep.equal({
      floor: { listVisible: false },
      room: {
        listVisible: false,
        roomId: null,
      },
    });
    expect(first.floor).not.to.equal(second.floor);
    expect(first.room).not.to.equal(second.room);
  });

  it('フロア一覧は初回に開き、再押下時はnextTickで閉じる', () => {
    const state = createRoomTagDialogState();
    const callbacks = [];
    const scheduleNextTick = vi.fn((callback) => callbacks.push(callback));

    tagDialogCoordinator.toggleFloorList(state, scheduleNextTick);
    expect(state.floor.listVisible).to.equal(true);
    expect(scheduleNextTick).not.toHaveBeenCalled();

    tagDialogCoordinator.toggleFloorList(state, scheduleNextTick);
    expect(state.floor.listVisible).to.equal(true);
    expect(callbacks).to.have.lengthOf(1);

    callbacks[0]();
    expect(state.floor.listVisible).to.equal(false);
  });

  it('ルーム一覧を対象roomIdで開き、close時に対象を解放する', () => {
    const state = createRoomTagDialogState();

    tagDialogCoordinator.openRoomList(state, 'room-1');

    expect(state.room.roomId).to.equal('room-1');
    expect(state.room.listVisible).to.equal(true);

    tagDialogCoordinator.closeRoomList(state);

    expect(state.room.listVisible).to.equal(false);
    expect(state.room.roomId).to.equal(null);
  });
});
