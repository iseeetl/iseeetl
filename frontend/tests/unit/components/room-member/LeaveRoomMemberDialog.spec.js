import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import roomMemberApi from '@/api/roomMember';
import LeaveRoomMemberDialog from '@/components/room-member/LeaveRoomMemberDialog.vue';
import DialogTargetContext from '@/components/common/DialogTargetContext.vue';

import flushPromises from '../../helpers/flushPromises';

const UiDialogStub = {
  name: 'UiDialog',
  props: {
    open: Boolean,
    titleId: String,
    descriptionIds: String,
    initialFocus: String,
    closeOnEscape: Boolean,
    closeOnBackdrop: Boolean,
  },
  emits: ['request-close', 'closed'],
  template:
    '<section><header><slot name="title" /></header><main><slot /></main><footer><slot name="actions" /></footer><aside><slot name="status" /></aside></section>',
};

const UiButtonStub = {
  name: 'UiButton',
  inheritAttrs: false,
  props: { disabled: Boolean },
  template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>',
};

const UiIconStub = {
  name: 'UiIcon',
  props: { name: String },
  template: '<i :data-name="name" />',
};

const baseStubs = {
  UiButton: UiButtonStub,
  UiDialog: UiDialogStub,
  UiIcon: UiIconStub,
};

const createWrapper = (overrides = {}) => {
  const wrapper = shallowMount(LeaveRoomMemberDialog, {
    stubs: baseStubs,
    props: {
      dialogVisible: true,
      roomId: 'room-1',
      roomTitle: 'Room title',
      ...(overrides.props || {}),
    },
    mocks: {
      $store: { getters: { roomId: 'store-room', roomTitle: 'Store room' }, dispatch: () => {} },
      $router: { push: () => {} },
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });
  const router = (overrides.mocks && overrides.mocks.$router) || { push: () => {} };
  Object.defineProperty(wrapper.vm, '$router', { value: router, configurable: true });
  return wrapper;
};

describe('ルームメンバーからの脱退', () => {
  let original = {};

  beforeEach(() => {
    original.leaveApi = roomMemberApi.leave;
  });

  afterEach(() => {
    roomMemberApi.leave = original.leaveApi;
  });

  it('dialogVisibleの変更でvisibleが同期される', async () => {
    const wrapper = createWrapper({ props: { dialogVisible: false } });
    expect(wrapper.vm.visible).to.equal(false);
    await wrapper.setProps({ dialogVisible: true });
    expect(wrapper.vm.visible).to.equal(true);
  });

  it('対象ルームと説明を関連付け、キャンセルを初期フォーカス先にする', () => {
    const wrapper = createWrapper();
    const context = wrapper.findComponent(DialogTargetContext);
    const dialog = wrapper.findComponent(UiDialogStub);

    expect(context.props()).to.include({
      contextId: 'leave_room_member_dialog_context',
      label: '対象ルーム',
      name: 'Room title',
    });
    expect(dialog.props()).to.include({
      descriptionIds: 'leave_room_member_dialog_context leave_room_member_dialog_description',
      initialFocus: '.leave-room-member-cancel',
    });
    expect(wrapper.get('#leave_room_member_dialog_description').text()).to.equal('ルームメンバー脱退');
    expect(
      wrapper.get('[data-testid="dialog-leave-room-member-confirm-mobile"] [data-name="logout"]').exists()
    ).to.equal(true);
    expect(wrapper.find('.common-dialog-actions__start').exists()).to.equal(false);
  });

  it('props未指定時はストアの対象ルームを使用する', () => {
    const wrapper = createWrapper({ props: { roomId: '', roomTitle: '' } });

    expect(wrapper.vm.resolvedRoomId).to.equal('store-room');
    expect(wrapper.vm.resolvedRoomTitle).to.equal('Store room');
  });

  it('closedDialogでcloseを通知する', () => {
    const wrapper = createWrapper();
    wrapper.setData({ sending: false });

    wrapper.vm.closedDialog();

    expect(wrapper.emitted().close).to.have.lengthOf(1);
  });

  it('sending中はcloseを通知しない', () => {
    const wrapper = createWrapper();
    wrapper.setData({ sending: true });

    wrapper.vm.closedDialog();

    expect(wrapper.emitted().close).to.equal(undefined);
  });

  it('脱退APIを呼び出して成功イベントを通知する', async () => {
    const apiCalls = [];
    const snackbarCalls = [];
    roomMemberApi.leave = (payload) => {
      apiCalls.push(payload);
      return Promise.resolve({ data: { ok: true } });
    };

    const wrapper = createWrapper();
    wrapper.vm.setSnackbar = (message, role) => snackbarCalls.push({ message, role });
    wrapper.vm.onPressDoneButton();
    await flushPromises();

    expect(apiCalls).to.deep.equal([{ room_id: 'room-1' }]);
    expect(wrapper.emitted().success[0][0]).to.deep.equal({ ok: true });
    expect(snackbarCalls).to.deep.equal([{ message: 'ルームメンバー脱退: 完了', role: 'status' }]);
    expect(wrapper.vm.sending).to.equal(false);
  });

  it('対象ルームIDがなければAPIを呼ばない', () => {
    let called = false;
    roomMemberApi.leave = () => {
      called = true;
      return Promise.resolve({});
    };
    const wrapper = createWrapper({
      props: { roomId: '' },
      mocks: {
        $store: { getters: { roomId: '', roomTitle: 'Store room' }, dispatch: () => {} },
      },
    });

    wrapper.vm.onPressDoneButton();

    expect(called).to.equal(false);
    expect(wrapper.vm.sending).to.equal(false);
  });

  it('sending中はキャンセル/脱退の操作を無視する', () => {
    const wrapper = createWrapper();
    let called = false;
    wrapper.setData({ sending: true, visible: true });
    wrapper.vm.leaveRoomMember = () => {
      called = true;
    };

    wrapper.vm.onPressCancelButton();
    wrapper.vm.onPressDoneButton();

    expect(wrapper.vm.visible).to.equal(true);
    expect(called).to.equal(false);
  });

  it('401エラー時はログアウトしてログイン画面へ移動する', () => {
    const dispatchCalls = [];
    const pushCalls = [];
    const wrapper = createWrapper({
      mocks: {
        $store: { getters: { roomId: 'room-1' }, dispatch: (type) => dispatchCalls.push(type) },
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
