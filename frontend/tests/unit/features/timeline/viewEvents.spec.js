import { expect, vi } from 'vitest';
import {
  createTimelineDialogEventHandlers,
  createTimelineHeaderEvents,
  dispatchTimelineDialogEvent,
} from '@/features/timeline/viewEvents';

describe('タイムラインの画面イベント連携', () => {
  it('ヘッダとダイアログの公開イベントを固定した参照へ変換する', () => {
    const context = new Proxy(
      {},
      {
        get(target, key) {
          if (!target[key]) target[key] = vi.fn();
          return target[key];
        },
      }
    );

    const headerEvents = createTimelineHeaderEvents(context);
    const dialogEvents = createTimelineDialogEventHandlers(context);

    expect(Object.isFrozen(headerEvents)).to.equal(true);
    expect(Object.isFrozen(dialogEvents)).to.equal(true);
    expect(headerEvents.showRoomInfoDialog).to.equal(context.showRoomInfoDialog);
    expect(headerEvents).not.to.have.property('showInviteRoomMemberDialog');
    expect(headerEvents).not.to.have.property('showRoomMemberDialog');
    expect(dialogEvents.successCreateFilter).to.equal(context.successCreateFilter);
    expect(dialogEvents.postSaved).to.equal(context.postSaved);
    expect(dialogEvents.confirmSoundCaution).to.equal(context.confirmSoundCaution);
    expect(dialogEvents.timelineSettingSaved).to.equal(context.timelineSettingSaved);
    expect(dialogEvents).not.to.have.property('deleteRoomMemberSuccess');
  });

  it('既知のダイアログイベントだけをdispatchする', () => {
    const handler = vi.fn();

    dispatchTimelineDialogEvent({ closeDialog: handler }, 'closeDialog', ['value']);
    dispatchTimelineDialogEvent({ closeDialog: handler }, 'unknown', []);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith('value');
  });
});
