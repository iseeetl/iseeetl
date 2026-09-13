import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import floorMemberApi from '@/api/floorMember';
import DeleteFloorMemberDialog from '@/components/floor-member/DeleteFloorMemberDialog.vue';
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

const createWrapper = (overrides = {}) => {
  const wrapper = shallowMount(DeleteFloorMemberDialog, {
    stubs: { UiButton: UiButtonStub, UiDialog: UiDialogStub },
    props: {
      dialogVisible: true,
      propsFloorMember: { _id: 'fm-1', user: { username: 'Member' } },
      floorId: 'floor-1',
      floorTitle: 'Target Floor',
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

describe('フロアメンバーの削除', () => {
  let originalRemove;

  beforeEach(() => {
    originalRemove = floorMemberApi.remove;
  });

  afterEach(() => {
    floorMemberApi.remove = originalRemove;
  });

  it('対象フロアと対象メンバーを説明に含め、取消を初期フォーカス先にする', () => {
    const wrapper = createWrapper();
    const contexts = wrapper.findAllComponents(DialogTargetContext);
    const dialog = wrapper.findComponent(UiDialogStub);

    expect(contexts).to.have.lengthOf(2);
    expect(contexts[0].props()).to.include({
      contextId: 'delete_floor_member_dialog_floor_context',
      label: '対象フロア',
      name: 'Target Floor',
    });
    expect(contexts[1].props()).to.include({
      contextId: 'delete_floor_member_dialog_member_context',
      label: 'floorMemberDialogs.targetMember',
      name: 'Member',
    });
    expect(dialog.props('descriptionIds')).to.equal(
      'delete_floor_member_dialog_floor_context delete_floor_member_dialog_member_context delete_floor_member_dialog_description'
    );
    expect(dialog.props('initialFocus')).to.equal('.delete-floor-member-cancel');
  });

  it('明示されたフロアで削除し、API応答に依存せず対象メンバーをsuccessで返す', async () => {
    const calls = [];
    floorMemberApi.remove = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: { ok: true } });
    };
    const selected = { _id: 'fm-1', user: { username: 'Member' } };
    const wrapper = createWrapper({
      props: { propsFloorMember: selected, floorId: 'target-floor' },
      mocks: {
        $store: { getters: { floorId: 'stale-floor' }, dispatch: () => {} },
      },
    });

    wrapper.vm.onPressDoneButton();
    await flushPromises();

    expect(calls).to.deep.equal([{ _id: 'fm-1', floor_id: 'target-floor' }]);
    expect(wrapper.emitted().success[0]).to.deep.equal([selected, { ok: true }]);
  });

  it('削除対象がない場合はAPIを呼ばない', () => {
    let called = false;
    floorMemberApi.remove = () => {
      called = true;
      return Promise.resolve({});
    };
    const wrapper = createWrapper({ props: { propsFloorMember: null } });

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

  it('送信中は取消・削除・closedを無視する', () => {
    const wrapper = createWrapper();
    let called = false;
    wrapper.setData({ sending: true, visible: true });
    wrapper.vm.deleteFloorMember = () => {
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
      },
    });

    expect(wrapper.vm.handleAuthError({ response: { status: 401 } })).to.equal(true);
    expect(dispatchCalls).to.include('doLogout');
    expect(pushCalls).to.deep.equal([{ name: 'Login' }]);
  });
});
