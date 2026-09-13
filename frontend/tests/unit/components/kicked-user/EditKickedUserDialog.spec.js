import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import { createMemoryHistory, createRouter as createVueRouter } from 'vue-router';
import kickedUserApi from '@/api/kickedUser';
import EditKickedUserDialog from '@/components/kicked-user/EditKickedUserDialog.vue';
import DialogTargetContext from '@/components/common/DialogTargetContext.vue';

import flushPromises from '../../helpers/flushPromises';
const createRouter = () => {
  const router = createVueRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/login', name: 'Login' }],
  });
  router.push = () => Promise.resolve();
  return router;
};

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
  template:
    '<section><header><slot name="title" /></header><main><slot /></main><footer><slot name="actions" /></footer><aside><slot name="status" /></aside></section>',
};

const UiButtonStub = {
  name: 'UiButton',
  inheritAttrs: false,
  props: { disabled: Boolean, tone: String },
  template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>',
};

const UiIconStub = {
  name: 'UiIcon',
  props: { name: String, size: Number },
  template: '<i :data-icon="name" />',
};

const baseStubs = {
  UiDialog: UiDialogStub,
  UiButton: UiButtonStub,
  UiIcon: UiIconStub,
};

const createWrapper = (overrides = {}) =>
  shallowMount(EditKickedUserDialog, {
    router: overrides.router || createRouter(),
    stubs: baseStubs,
    props: {
      dialogVisible: true,
      roomId: 'room-1',
      floorTitle: 'Floor 1',
      kickedUserId: 'user-2',
      kickedUserName: 'User2',
      ...(overrides.props || {}),
    },
    mocks: {
      $store: { dispatch: () => {} },
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });

describe('ユーザのキック', () => {
  let originalCreate;

  beforeEach(() => {
    originalCreate = kickedUserApi.create;
  });

  afterEach(() => {
    kickedUserApi.create = originalCreate;
  });

  it('対象フロアと対象ユーザを説明に含め、キャンセルを初期フォーカス先にする', () => {
    const wrapper = createWrapper();
    const contexts = wrapper.findAllComponents(DialogTargetContext);
    const dialog = wrapper.findComponent(UiDialogStub);

    expect(contexts).to.have.lengthOf(2);
    expect(contexts[0].props()).to.include({
      contextId: 'edit_kicked_user_dialog_floor_context',
      label: '対象フロア',
      name: 'Floor 1',
    });
    expect(contexts[1].props()).to.include({
      contextId: 'edit_kicked_user_dialog_user_context',
      label: '対象ユーザ',
      name: 'User2',
    });
    expect(dialog.props('descriptionIds')).to.equal(
      'edit_kicked_user_dialog_floor_context edit_kicked_user_dialog_user_context edit-kicked-user-dialog-description'
    );
    expect(dialog.props('initialFocus')).to.equal('.edit-kicked-user-cancel');
  });

  it('PCとスマートフォンでキックの文言とblockアイコンを使う', () => {
    const wrapper = createWrapper();
    const confirmButtons = wrapper
      .findAllComponents(UiButtonStub)
      .filter((button) => button.attributes('data-testid')?.includes('confirm'));

    expect(confirmButtons).to.have.lengthOf(2);
    expect(confirmButtons[0].attributes('aria-label')).to.equal('ユーザをキックする');
    expect(confirmButtons[1].text()).to.include('ユーザをキックする');
    expect(wrapper.findAll('[data-icon="block"]')).to.have.lengthOf(2);
  });

  it('対象ユーザまたはルームが未指定なら API を呼ばない', () => {
    const calls = [];
    kickedUserApi.create = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: {} });
    };

    const missingUserWrapper = createWrapper({ props: { kickedUserId: '' } });
    const missingRoomWrapper = createWrapper({ props: { roomId: '' } });

    missingUserWrapper.vm.onPressDoneButton();
    missingRoomWrapper.vm.onPressDoneButton();

    expect(calls).to.deep.equal([]);
    expect(missingUserWrapper.vm.sending).to.equal(false);
    expect(missingRoomWrapper.vm.sending).to.equal(false);
  });

  it('キック API の成功後は遷移を開始し、closed時に一度だけcloseを通知する', async () => {
    const calls = [];
    kickedUserApi.create = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: {} });
    };

    const wrapper = createWrapper();

    wrapper.vm.onPressDoneButton();
    await flushPromises();

    expect(calls).to.deep.equal([{ user_id: 'user-2', room_id: 'room-1' }]);
    expect(wrapper.vm.visible).to.equal(false);
    expect(wrapper.emitted().close).to.equal(undefined);

    wrapper.vm.closedDialog();
    expect(wrapper.emitted().close).to.have.lengthOf(1);
  });

  it('closedDialog は close を通知する', async () => {
    const wrapper = createWrapper();

    wrapper.vm.closedDialog();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted().close).to.have.lengthOf(1);
  });

  it('401応答を受けた場合はログアウトしてログイン画面へ移動する', async () => {
    kickedUserApi.create = () => Promise.reject({ response: { status: 401 } });
    const dispatchCalls = [];
    const wrapper = createWrapper({
      mocks: {
        $store: { dispatch: (type) => dispatchCalls.push(type) },
      },
    });

    wrapper.vm.onPressDoneButton();
    await flushPromises();

    expect(dispatchCalls).to.include('doLogout');
  });
});
