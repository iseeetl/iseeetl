import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import kickedUserApi from '@/api/kickedUser';
import DeleteKickedUserDialog from '@/components/kicked-user/DeleteKickedUserDialog.vue';
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
  props: { disabled: Boolean, tone: String },
  template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>',
};

const UiIconStub = {
  name: 'UiIcon',
  props: { name: String, size: Number },
  template: '<i :data-icon="name" />',
};

const createWrapper = (overrides = {}) => {
  const wrapper = shallowMount(DeleteKickedUserDialog, {
    stubs: { UiButton: UiButtonStub, UiDialog: UiDialogStub, UiIcon: UiIconStub },
    props: {
      dialogVisible: true,
      floorId: 'floor-1',
      floorTitle: 'Target Floor',
      kickedUser: { _id: 'kick-1', user: { _id: 'user-1', username: 'User' } },
      ...(overrides.props || {}),
    },
    mocks: {
      $store: { getters: { floorId: 'floor-1', floorTitle: 'Target Floor' }, dispatch: () => {} },
      $router: { push: () => {} },
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });
  const router = (overrides.mocks && overrides.mocks.$router) || { push: () => {} };
  Object.defineProperty(wrapper.vm, '$router', { value: router, configurable: true });
  return wrapper;
};

describe('キックの解除', () => {
  let originalRemove;

  beforeEach(() => {
    originalRemove = kickedUserApi.remove;
  });

  afterEach(() => {
    kickedUserApi.remove = originalRemove;
  });

  it('対象フロアと対象ユーザを説明に含め、取消を初期フォーカス先にする', () => {
    const wrapper = createWrapper();
    const contexts = wrapper.findAllComponents(DialogTargetContext);
    const dialog = wrapper.findComponent(UiDialogStub);

    expect(contexts).to.have.lengthOf(2);
    expect(contexts[0].props()).to.include({
      contextId: 'delete_kicked_user_dialog_floor_context',
      label: '対象フロア',
      name: 'Target Floor',
    });
    expect(contexts[1].props()).to.include({
      contextId: 'delete_kicked_user_dialog_user_context',
      label: '対象ユーザ',
      name: 'User',
    });
    expect(dialog.props('descriptionIds')).to.equal(
      'delete_kicked_user_dialog_floor_context delete_kicked_user_dialog_user_context delete-kicked-user-dialog-description'
    );
    expect(dialog.props('initialFocus')).to.equal('.release-kicked-user-cancel');
  });

  it('キックの解除には危険を示す削除色を使わず、primary色とlock_openアイコンを使う', () => {
    const wrapper = createWrapper();
    const confirmButtons = wrapper
      .findAllComponents(UiButtonStub)
      .filter((button) => button.attributes('data-testid')?.includes('confirm'));

    expect(confirmButtons).to.have.lengthOf(2);
    expect(confirmButtons.every((button) => button.props('tone') === 'primary')).to.equal(true);
    expect(wrapper.findAll('[data-icon="lock_open"]')).to.have.lengthOf(2);
  });

  it('指定フロアのキックを解除し、対象レコードをsuccessで返す', async () => {
    const calls = [];
    kickedUserApi.remove = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: { ok: true } });
    };
    const selected = { _id: 'kick-1', user: { _id: 'user-1', username: 'User' } };
    const wrapper = createWrapper({
      props: { floorId: 'target-floor', kickedUser: selected },
      mocks: {
        $store: { getters: { floorId: 'stale-floor' }, dispatch: () => {} },
      },
    });

    wrapper.vm.onPressDoneButton();
    await flushPromises();

    expect(calls).to.deep.equal([{ floor_id: 'target-floor', user_id: 'user-1' }]);
    expect(wrapper.emitted().success[0]).to.deep.equal([selected, { ok: true }]);
  });

  it('従来のid・nameプロパティでも対象レコードをsuccessイベントで返す', async () => {
    kickedUserApi.remove = () => Promise.resolve({ data: {} });
    const wrapper = createWrapper({
      props: {
        kickedUser: null,
        kickedUserId: 'legacy-user',
        kickedUserName: 'Legacy User',
      },
    });

    wrapper.vm.onPressDoneButton();
    await flushPromises();

    expect(wrapper.emitted().success[0][0]).to.deep.equal({
      user: { _id: 'legacy-user', username: 'Legacy User' },
    });
  });

  it('対象がなければAPIを呼ばない', () => {
    let called = false;
    kickedUserApi.remove = () => {
      called = true;
      return Promise.resolve({});
    };
    const wrapper = createWrapper({
      props: { kickedUser: null, kickedUserId: '', kickedUserName: '' },
    });

    wrapper.vm.onPressDoneButton();

    expect(called).to.equal(false);
    expect(wrapper.vm.sending).to.equal(false);
  });

  it('dialogVisibleを同期し、closed後にcloseを通知する', async () => {
    const wrapper = createWrapper({ props: { dialogVisible: false } });
    expect(wrapper.vm.visible).to.equal(false);
    await wrapper.setProps({ dialogVisible: true });
    expect(wrapper.vm.visible).to.equal(true);

    wrapper.vm.closedDialog();
    expect(wrapper.emitted().close).to.have.lengthOf(1);
  });

  it('送信中は取消・解除・closedを無視する', () => {
    const wrapper = createWrapper();
    let called = false;
    wrapper.setData({ sending: true, visible: true });
    wrapper.vm.releaseKickedUser = () => {
      called = true;
    };

    wrapper.vm.onPressCancelButton();
    wrapper.vm.onPressDoneButton();
    wrapper.vm.closedDialog();

    expect(wrapper.vm.visible).to.equal(true);
    expect(called).to.equal(false);
    expect(wrapper.emitted().close).to.equal(undefined);
  });

  it('401エラー時はログアウトしてログイン画面へ移動する', async () => {
    kickedUserApi.remove = () => Promise.reject({ response: { status: 401 } });
    const dispatchCalls = [];
    const pushCalls = [];
    const wrapper = createWrapper({
      mocks: {
        $store: {
          getters: { floorId: 'floor-1', floorTitle: 'Floor' },
          dispatch: (type) => dispatchCalls.push(type),
        },
        $router: { push: (payload) => pushCalls.push(payload) },
      },
    });

    wrapper.vm.onPressDoneButton();
    await flushPromises();

    expect(dispatchCalls).to.include('doLogout');
    expect(pushCalls).to.deep.equal([{ name: 'Login' }]);
  });
});
