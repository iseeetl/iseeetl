import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import roomApi from '@/api/room';
import DeleteRoomDialog from '@/components/room/DeleteRoomDialog.vue';

import flushPromises from '../../helpers/flushPromises';

const baseStubs = {
  UiDialog: {
    name: 'UiDialog',
    props: ['open', 'titleId', 'descriptionIds', 'initialFocus', 'closeOnEscape', 'closeOnBackdrop'],
    template:
      '<section><header><slot name="title" /></header><main><slot /></main><footer><slot name="actions" /></footer><aside><slot name="status" /></aside></section>',
  },
};

const createWrapper = (overrides = {}) => {
  const wrapper = shallowMount(DeleteRoomDialog, {
    stubs: baseStubs,
    props: {
      dialogVisible: true,
      room: { _id: 'room-1', title: 'Room' },
      targetName: '翻訳済みRoom',
      ...(overrides.props || {}),
    },
    mocks: {
      $store: { getters: { floorId: 'floor-1', floorTitle: 'Floor' }, dispatch: () => {} },
      $router: { push: () => {} },
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });
  const router = (overrides.mocks && overrides.mocks.$router) || { push: () => {} };
  Object.defineProperty(wrapper.vm, '$router', { value: router, configurable: true });
  return wrapper;
};

describe('ルームの削除', () => {
  let original = {};

  beforeEach(() => {
    original.remove = roomApi.remove;
  });

  afterEach(() => {
    roomApi.remove = original.remove;
  });

  it('削除APIを呼び出して成功イベントを通知する', async () => {
    const apiCalls = [];
    roomApi.remove = (payload) => {
      apiCalls.push(payload);
      return Promise.resolve({ data: { ok: true } });
    };

    const wrapper = createWrapper();
    wrapper.vm.openedDialog();
    await wrapper.vm.$nextTick();

    wrapper.vm.onPressDoneButton();
    await flushPromises();

    expect(apiCalls).to.deep.equal([{ _id: 'room-1' }]);
    expect(wrapper.emitted().success[0][0]).to.deep.equal({ ok: true });
  });

  it('dialogVisibleの変更でvisibleが同期される', async () => {
    const wrapper = createWrapper({ props: { dialogVisible: false } });
    expect(wrapper.vm.visible).to.equal(false);
    await wrapper.setProps({ dialogVisible: true });
    expect(wrapper.vm.visible).to.equal(true);
  });

  it('openedDialogで値を設定する', () => {
    const wrapper = createWrapper();
    wrapper.vm.openedDialog();

    expect(wrapper.vm.id).to.equal('room-1');
    expect(wrapper.vm.title).to.equal('Room');
    expect(wrapper.vm.floor_id).to.equal('floor-1');
    expect(wrapper.vm.floor_title).to.equal('Floor');
  });

  it('翻訳済み対象名と削除影響をダイアログの説明へ関連付ける', () => {
    const wrapper = createWrapper();
    const dialog = wrapper.findComponent({ name: 'UiDialog' });
    const targetContext = wrapper.findComponent({ name: 'DialogTargetContext' });

    expect(dialog.props('descriptionIds')).to.equal(
      'delete_room_dialog_context delete_room_dialog_description'
    );
    expect(dialog.props('initialFocus')).to.equal("[data-testid='delete-room-dialog-cancel']");
    expect(targetContext.props()).to.include({
      contextId: 'delete_room_dialog_context',
      label: '対象ルーム',
      name: '翻訳済みRoom',
    });
  });

  it('用途が分かる削除タイトルと確認文言を使用する', () => {
    const wrapper = createWrapper();

    expect(wrapper.text()).to.contain('ルームを削除');
    expect(wrapper.text()).to.contain('このルームを削除しますか？');
    expect(wrapper.text()).to.contain(
      '削除すると一覧から外れ、通常操作ではこのルームとタイムラインを利用できなくなります。'
    );
  });

  it('closedDialogでcloseを通知する', () => {
    const wrapper = createWrapper();
    wrapper.setData({ sending: false, title: 'temp' });

    wrapper.vm.closedDialog();

    expect(wrapper.vm.title).to.equal(null);
    expect(wrapper.emitted().close).to.have.lengthOf(1);
  });

  it('sending中はキャンセル/削除の操作を無視する', () => {
    const wrapper = createWrapper();
    let called = false;
    wrapper.setData({ sending: true, visible: true });
    wrapper.vm.deleteRoom = () => {
      called = true;
    };

    wrapper.vm.onPressCancelButton();
    wrapper.vm.onPressDoneButton();
    wrapper.vm.closedDialog();

    expect(wrapper.vm.visible).to.equal(true);
    expect(called).to.equal(false);
    expect(wrapper.emitted().close).to.equal(undefined);
  });

  it('401エラー時はログアウトしてログイン画面へ移動する', () => {
    const dispatchCalls = [];
    const pushCalls = [];
    const wrapper = createWrapper({
      mocks: {
        $store: {
          getters: { floorId: 'floor-1', floorTitle: 'Floor' },
          dispatch: (type) => dispatchCalls.push(type),
        },
        $router: { push: (payload) => pushCalls.push(payload) },
        $t: (key) => key,
      },
    });

    const result = wrapper.vm.handleAuthError({ response: { status: 401 } });

    expect(result).to.equal(true);
    expect(dispatchCalls).to.include('doLogout');
    expect(pushCalls).to.deep.equal([{ name: 'Login' }]);
  });
});
