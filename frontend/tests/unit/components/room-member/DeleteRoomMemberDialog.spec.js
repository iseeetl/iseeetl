import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import roomMemberApi from '@/api/roomMember';
import DeleteRoomMemberDialog from '@/components/room-member/DeleteRoomMemberDialog.vue';
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
  emits: ['request-close', 'opened', 'closed'],
  template:
    '<section><header><slot name="title" /></header><main><slot /></main><footer><slot name="actions" /></footer><aside><slot name="status" /></aside></section>',
};

const UiButtonStub = {
  name: 'UiButton',
  inheritAttrs: false,
  props: {
    disabled: Boolean,
  },
  template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>',
};

const baseStubs = {
  UiButton: UiButtonStub,
  UiDialog: UiDialogStub,
};

const createWrapper = (overrides = {}) => {
  const wrapper = shallowMount(DeleteRoomMemberDialog, {
    stubs: baseStubs,
    props: {
      dialogVisible: true,
      propsRoomMember: { _id: 'rm-1', user: { username: 'Member' } },
      roomTitle: 'Target Room',
      ...(overrides.props || {}),
    },
    mocks: {
      $store: { dispatch: () => {} },
      $router: { push: () => {} },
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });
  const router = (overrides.mocks && overrides.mocks.$router) || { push: () => {} };
  Object.defineProperty(wrapper.vm, '$router', { value: router, configurable: true });
  return wrapper;
};

describe('ルームメンバーの削除', () => {
  let original = {};

  beforeEach(() => {
    original.removeApi = roomMemberApi.remove;
  });

  afterEach(() => {
    roomMemberApi.remove = original.removeApi;
  });

  it('削除APIを呼び出して成功イベントを通知する', async () => {
    const apiCalls = [];
    const snackbarCalls = [];
    roomMemberApi.remove = (payload) => {
      apiCalls.push(payload);
      return Promise.resolve({ data: { ok: true } });
    };

    const wrapper = createWrapper();
    wrapper.vm.setSnackbar = (message, role) => snackbarCalls.push({ message, role });
    wrapper.vm.onPressDoneButton();
    await flushPromises();

    expect(apiCalls).to.deep.equal([{ _id: 'rm-1' }]);
    expect(wrapper.emitted().success[0][0]).to.deep.equal({ ok: true });
    expect(snackbarCalls).to.deep.equal([{ message: 'roomMemberDialogs.deleteTitle: 完了', role: 'status' }]);
  });

  it('dialogVisibleの変更でvisibleが同期される', async () => {
    const wrapper = createWrapper({ props: { dialogVisible: false } });
    expect(wrapper.vm.visible).to.equal(false);
    await wrapper.setProps({ dialogVisible: true });
    expect(wrapper.vm.visible).to.equal(true);
  });

  it('翻訳済み対象ルームと対象メンバーを表示し、説明と初期フォーカスを関連付ける', () => {
    const wrapper = createWrapper();
    const contexts = wrapper.findAllComponents(DialogTargetContext);
    const dialog = wrapper.findComponent(UiDialogStub);

    expect(contexts).to.have.lengthOf(2);
    expect(contexts[0].props()).to.include({
      contextId: 'delete_room_member_dialog_room_context',
      label: '対象ルーム',
      name: 'Target Room',
    });
    expect(contexts[1].props()).to.include({
      contextId: 'delete_room_member_dialog_member_context',
      label: 'roomMemberDialogs.targetMember',
      name: 'Member',
    });
    expect(dialog.props('descriptionIds')).to.equal(
      'delete_room_member_dialog_room_context delete_room_member_dialog_member_context delete_room_member_dialog_description'
    );
    expect(dialog.props('initialFocus')).to.equal('.delete-room-member-cancel');
    expect(wrapper.get('#delete_room_member_dialog_title').text()).to.equal('roomMemberDialogs.deleteTitle');
    expect(wrapper.vm.memberId).to.equal('rm-1');
    expect(wrapper.vm.userName).to.equal('Member');
  });

  it('削除対象がなければAPIを呼ばない', () => {
    let called = false;
    roomMemberApi.remove = () => {
      called = true;
      return Promise.resolve({});
    };
    const wrapper = createWrapper({ props: { propsRoomMember: null } });

    wrapper.vm.onPressDoneButton();

    expect(called).to.equal(false);
    expect(wrapper.vm.sending).to.equal(false);
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

  it('sending中はキャンセル/削除の操作を無視する', () => {
    const wrapper = createWrapper();
    let called = false;
    wrapper.setData({ sending: true, visible: true });
    wrapper.vm.deleteRoomMember = () => {
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
        $store: { dispatch: (type) => dispatchCalls.push(type) },
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
