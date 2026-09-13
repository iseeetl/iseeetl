import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import floorMemberApi from '@/api/floorMember';
import LeaveFloorMemberDialog from '@/components/floor-member/LeaveFloorMemberDialog.vue';
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

const createWrapper = (overrides = {}) => {
  const wrapper = shallowMount(LeaveFloorMemberDialog, {
    stubs: { UiButton: UiButtonStub, UiDialog: UiDialogStub },
    props: {
      dialogVisible: true,
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

describe('フロアメンバーからの脱退', () => {
  let originalLeave;

  beforeEach(() => {
    originalLeave = floorMemberApi.leave;
  });

  afterEach(() => {
    floorMemberApi.leave = originalLeave;
  });

  it('対象フロアを説明に含め、取消を初期フォーカス先にする', () => {
    const wrapper = createWrapper();
    const context = wrapper.findComponent(DialogTargetContext);
    const dialog = wrapper.findComponent(UiDialogStub);

    expect(context.props()).to.include({
      contextId: 'leave_floor_member_dialog_context',
      label: '対象フロア',
      name: 'Target Floor',
    });
    expect(dialog.props('descriptionIds')).to.equal(
      'leave_floor_member_dialog_context leave_floor_member_dialog_description'
    );
    expect(dialog.props('initialFocus')).to.equal('.leave-floor-member-cancel');
  });

  it('明示された対象フロアから脱退してsuccessを通知する', async () => {
    const calls = [];
    floorMemberApi.leave = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: { ok: true } });
    };
    const wrapper = createWrapper({
      props: { floorId: 'target-floor' },
      mocks: {
        $store: { getters: { floorId: 'stale-floor' }, dispatch: () => {} },
      },
    });

    wrapper.vm.onPressDoneButton();
    await flushPromises();

    expect(calls).to.deep.equal([{ floor_id: 'target-floor' }]);
    expect(wrapper.emitted().success[0][0]).to.deep.equal({ ok: true });
  });

  it('dialogVisibleを同期し、closed後にcloseを通知する', async () => {
    const wrapper = createWrapper({ props: { dialogVisible: false } });
    expect(wrapper.vm.visible).to.equal(false);
    await wrapper.setProps({ dialogVisible: true });
    expect(wrapper.vm.visible).to.equal(true);

    wrapper.vm.closedDialog();
    expect(wrapper.emitted().close).to.have.lengthOf(1);
  });

  it('送信中は取消・脱退・closedを無視する', () => {
    const wrapper = createWrapper();
    let called = false;
    wrapper.setData({ sending: true, visible: true });
    wrapper.vm.leaveFloorMember = () => {
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
