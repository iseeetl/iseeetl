import { expect, vi } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import InviteFloorMemberDialog from '@/components/floor-member/InviteFloorMemberDialog.vue';
import DialogTargetContext from '@/components/common/DialogTargetContext.vue';
import floorMemberApi from '@/api/floorMember';
import { API_BASE_URL } from '@/api/apiClient';

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
  const wrapper = shallowMount(InviteFloorMemberDialog, {
    stubs: { InviteUrlField: false, MemberCapabilityGuidance: false, UiButton: UiButtonStub, UiDialog: UiDialogStub, ...(overrides.stubs || {}) },
    props: {
      dialogVisible: true,
      floorId: 'floor-1',
      floorTitle: 'Floor',
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

describe('フロアメンバーの招待', () => {
  let originalInvite;

  beforeEach(() => {
    originalInvite = floorMemberApi.invite;
  });

  afterEach(() => {
    floorMemberApi.invite = originalInvite;
  });

  it('招待作成前からメンバー一覧と同じ権限と注記を表示する', () => {
    const wrapper = createWrapper();
    const guidance = wrapper.get('[data-testid="member-capability-guidance"]');
    expect(guidance.findAll('h3').map((heading) => heading.text())).to.deep.equal([
      'memberCapabilities.allowed', 'memberCapabilities.denied',
    ]);
    expect(guidance.findAll('ul').map((list) => list.findAll('li').length)).to.deep.equal([6, 3]);
    expect(guidance.text()).to.include('floorMemberDialogs.capabilities.denied.members');
    expect(guidance.text()).to.include('memberCapabilities.roleNote');
    expect(guidance.text().includes('floorMemberDialogs.capabilities.creatorNote')).to.equal(true);
  });

  it('長い招待URLを読取専用の複数行欄に表示し、改行を加えずコピーする', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const wrapper = createWrapper();
    const url = `https://example.test/floor/invite/${'a'.repeat(500)}`;
    try {
      await wrapper.setData({ inviteUrl: url, issuedPeriod: '8h' });
      const field = wrapper.get('textarea[data-testid="dialog-invite-floor-member-url"]');
      expect(field.element.value).to.equal(url);
      expect(field.element.readOnly).to.equal(true);
      expect(wrapper.get(`label[for="${field.attributes('id')}"]`).text()).to.equal('floorMemberDialogs.inviteUrl');
      await wrapper.get('[data-testid="dialog-invite-floor-member-copy-desktop"]').trigger('click');
      expect(writeText).toHaveBeenCalledExactlyOnceWith(url);
      await wrapper.setData({ period: '3d' });
      await wrapper.vm.copyInviteUrl();
      expect(writeText).toHaveBeenCalledTimes(1);
    } finally {
      wrapper.unmount();
      if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
      else delete navigator.clipboard;
    }
  });

  it('対象フロアを説明に含め、見出しを初期フォーカス先にする', () => {
    const wrapper = createWrapper({ props: { floorTitle: 'Target Floor' } });
    const context = wrapper.findComponent(DialogTargetContext);
    const dialog = wrapper.findComponent(UiDialogStub);

    expect(context.props()).to.include({
      contextId: 'invite_floor_member_dialog_context',
      label: '対象フロア',
      name: 'Target Floor',
    });
    expect(dialog.props('descriptionIds')).to.equal(
      'invite_floor_member_dialog_context invite_floor_member_dialog_guidance invite_floor_member_dialog_description invite_floor_member_dialog_limit'
    );
    expect(dialog.props('initialFocus')).to.equal('#invite_floor_member_dialog_title');
    expect(wrapper.get('#invite_floor_member_dialog_title').attributes('tabindex')).to.equal('-1');
    expect(wrapper.find('#invite_floor_member_dialog_description').exists()).to.equal(true);
    expect(wrapper.find('#invite_floor_member_dialog_limit').exists()).to.equal(true);
    expect(wrapper.get('label[for="invite_floor_member_period"]').exists()).to.equal(true);
    expect(wrapper.get('#invite_floor_member_period').exists()).to.equal(true);
    expect(wrapper.find('#period').exists()).to.equal(false);
    const createRow = wrapper.get('[data-testid="dialog-invite-floor-member-create-row"]');
    expect(createRow.get('#invite_floor_member_period').exists()).to.equal(true);
    expect(
      createRow.get('[data-testid="dialog-invite-floor-member-create-button"]').exists()
    ).to.equal(true);
  });

  it('指定フロアの招待URLを作成し、readonly欄とstatus通知へ表示する', async () => {
    const calls = [];
    floorMemberApi.invite = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: { token: 'token-1' } });
    };
    const wrapper = createWrapper({
      props: { floorId: 'target-floor' },
      mocks: {
        $store: { getters: { floorId: 'stale-floor', floorTitle: 'Stale' }, dispatch: () => {} },
      },
    });
    await wrapper.setData({ period: '3d' });

    wrapper.vm.onPressCreateInviteUrl();
    await flushPromises();

    expect(calls).to.deep.equal([{ floor_id: 'target-floor', period: '3d' }]);
    expect(wrapper.vm.periodDisplayName).to.equal('3日');
    expect(wrapper.vm.issuedPeriod).to.equal('3d');
    const expectedUrl = `${API_BASE_URL || ''}/floor/target-floor/invite/token-1`;
    expect(wrapper.vm.inviteUrl).to.equal(expectedUrl);
    expect(wrapper.get('[data-testid="dialog-invite-floor-member-url"]').attributes('readonly')).to.equal('');
    expect(wrapper.get('[data-testid="dialog-invite-floor-member-url"]').element.value).to.equal(expectedUrl);
    expect(wrapper.get('[data-testid="dialog-invite-floor-member-status"]').attributes('role')).to.equal('status');
    expect(wrapper.get('[data-testid="dialog-invite-floor-member-status"]').text()).to.equal(
      'floorMemberDialogs.inviteCreated'
    );
  });

  it('URL作成後に有効期限を変えると再作成を通知してコピーを無効化する', async () => {
    const wrapper = createWrapper();
    await wrapper.setData({
      inviteUrl: 'https://example.test/invite/token',
      issuedPeriod: '8h',
      period: '3d',
    });

    expect(wrapper.vm.invitePeriodChanged).to.equal(true);
    expect(wrapper.vm.canCopyInviteUrl).to.equal(false);
    expect(wrapper.get('[data-testid="dialog-invite-floor-member-status"]').text()).to.equal(
      'floorMemberDialogs.invitePeriodChanged'
    );
    expect(wrapper.get('[data-testid="dialog-invite-floor-member-copy-desktop"]').attributes('disabled')).to.equal(
      ''
    );

    await wrapper.setData({ period: '8h' });
    expect(wrapper.vm.canCopyInviteUrl).to.equal(true);
  });

  it('dialogVisibleを同期し、closed後は状態を初期化してcloseを通知する', async () => {
    const wrapper = createWrapper({ props: { dialogVisible: false } });
    expect(wrapper.vm.visible).to.equal(false);
    await wrapper.setProps({ dialogVisible: true });
    expect(wrapper.vm.visible).to.equal(true);
    await wrapper.setData({ inviteUrl: 'url', issuedPeriod: '1m', period: '1m' });

    wrapper.vm.closedDialog();

    expect(wrapper.emitted().close).to.have.lengthOf(1);
    expect(wrapper.vm.inviteUrl).to.equal(null);
    expect(wrapper.vm.issuedPeriod).to.equal(null);
    expect(wrapper.vm.period).to.equal('8h');
  });

  it('送信中はキャンセルとclosedを無視する', () => {
    const wrapper = createWrapper();
    wrapper.setData({ sending: true, visible: true, inviteUrl: 'existing-url' });

    wrapper.vm.onPressCancelButton();
    wrapper.vm.closedDialog();

    expect(wrapper.vm.visible).to.equal(true);
    expect(wrapper.vm.inviteUrl).to.equal('existing-url');
    expect(wrapper.emitted().close).to.equal(undefined);
  });

  it('クリップボード成功/失敗をstatus/alertとして通知する', () => {
    const wrapper = createWrapper();
    const messages = [];
    wrapper.vm.setSnackbar = (message, role) => messages.push({ message, role });

    wrapper.vm.clipbordCopySuccess();
    wrapper.vm.clipbordCopyError();

    expect(messages).to.deep.equal([
      { message: 'クリップボードへコピーしました', role: 'status' },
      { message: 'クリップボードへのコピーに失敗しました', role: 'alert' },
    ]);
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
