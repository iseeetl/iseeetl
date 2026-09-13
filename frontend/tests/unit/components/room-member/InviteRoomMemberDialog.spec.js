import { expect, vi } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import InviteRoomMemberDialog from '@/components/room-member/InviteRoomMemberDialog.vue';
import DialogTargetContext from '@/components/common/DialogTargetContext.vue';
import roomMemberApi from '@/api/roomMember';
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
  const wrapper = shallowMount(InviteRoomMemberDialog, {
    stubs: { InviteUrlField: false, MemberCapabilityGuidance: false, ...baseStubs, ...(overrides.stubs || {}) },
    directives: {
      clipboard: {
        bind() {},
        update() {},
        unbind() {},
      },
    },
    props: {
      dialogVisible: true,
      floorId: 'floor-1',
      roomId: 'room-1',
      roomTitle: 'Room',
      ...(overrides.props || {}),
    },
    mocks: {
      $store: {
        getters: { roomId: 'room-1', floorId: 'floor-1', roomTitle: 'Room' },
        dispatch: () => {},
      },
      $router: { push: () => {} },
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });
  const router = (overrides.mocks && overrides.mocks.$router) || { push: () => {} };
  Object.defineProperty(wrapper.vm, '$router', { value: router, configurable: true });
  return wrapper;
};

describe('ルームメンバーの招待', () => {
  let original = {};

  beforeEach(() => {
    original.inviteApi = roomMemberApi.invite;
  });

  afterEach(() => {
    roomMemberApi.invite = original.inviteApi;
  });

  it('招待作成前からメンバー一覧と同じ権限と注記を表示する', () => {
    const wrapper = createWrapper();
    const guidance = wrapper.get('[data-testid="member-capability-guidance"]');
    expect(guidance.findAll('h3').map((heading) => heading.text())).to.deep.equal([
      'memberCapabilities.allowed', 'memberCapabilities.denied',
    ]);
    expect(guidance.findAll('ul').map((list) => list.findAll('li').length)).to.deep.equal([3, 4]);
    expect(guidance.text()).to.include('roomMemberDialogs.capabilities.denied.members');
    expect(guidance.text()).to.include('memberCapabilities.roleNote');
    expect(guidance.text().includes('floorMemberDialogs.capabilities.creatorNote')).to.equal(false);
  });

  it('長い招待URLを読取専用の複数行欄に表示し、改行を加えずコピーする', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const wrapper = createWrapper();
    const url = `https://example.test/room/invite/${'a'.repeat(500)}`;
    try {
      await wrapper.setData({ inviteUrl: url, issuedPeriod: '8h' });
      const field = wrapper.get('textarea[data-testid="dialog-invite-room-member-url"]');
      expect(field.element.value).to.equal(url);
      expect(field.element.readOnly).to.equal(true);
      expect(wrapper.get(`label[for="${field.attributes('id')}"]`).text()).to.equal('roomMemberDialogs.inviteUrl');
      await wrapper.get('[data-testid="dialog-invite-room-member-copy-desktop"]').trigger('click');
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

  it('ダイアログの説明参照先を招待URL作成前からDOMに維持する', () => {
    const wrapper = createWrapper();

    expect(wrapper.find('#invite_room_member_dialog_description').exists()).to.equal(true);
    expect(wrapper.find('#invite_room_member_dialog_limit').exists()).to.equal(true);
    expect(wrapper.find('[data-testid="dialog-invite-room-member-status"]').exists()).to.equal(true);
  });

  it('翻訳済み対象ルームを共通コンテキストで表示し、見出しを初期フォーカス先にする', () => {
    const wrapper = createWrapper({ props: { roomTitle: '翻訳済みルーム' } });
    const context = wrapper.findComponent(DialogTargetContext);
    const dialog = wrapper.findComponent(UiDialogStub);

    expect(context.props()).to.include({
      contextId: 'invite_room_member_dialog_context',
      label: '対象ルーム',
      name: '翻訳済みルーム',
    });
    expect(dialog.props('descriptionIds')).to.equal(
      'invite_room_member_dialog_context invite_room_member_dialog_guidance invite_room_member_dialog_description invite_room_member_dialog_limit'
    );
    expect(dialog.props('initialFocus')).to.equal('#invite_room_member_dialog_title');
    expect(wrapper.get('#invite_room_member_dialog_title').attributes('tabindex')).to.equal('-1');
    expect(wrapper.get('label[for="invite_room_member_period"]').exists()).to.equal(true);
    expect(wrapper.get('#invite_room_member_period').exists()).to.equal(true);
    const createRow = wrapper.get('[data-testid="dialog-invite-room-member-create-row"]');
    expect(createRow.get('#invite_room_member_period').exists()).to.equal(true);
    expect(
      createRow.get('[data-testid="dialog-invite-room-member-create-button"]').exists()
    ).to.equal(true);
  });

  it('dialogVisibleの変更でvisibleが同期される', async () => {
    const wrapper = createWrapper({ props: { dialogVisible: false } });
    expect(wrapper.vm.visible).to.equal(false);
    await wrapper.setProps({ dialogVisible: true });
    expect(wrapper.vm.visible).to.equal(true);
  });

  it('closedDialogでcloseを通知する', () => {
    const wrapper = createWrapper();
    wrapper.setData({ sending: false, inviteUrl: 'x', period: '1m' });

    wrapper.vm.closedDialog();

    expect(wrapper.vm.inviteUrl).to.equal(null);
    expect(wrapper.vm.period).to.equal('8h');
    expect(wrapper.emitted().close).to.have.lengthOf(1);
  });

  it('sending中はclosed通知でも値を維持してcloseを通知しない', () => {
    const wrapper = createWrapper();
    wrapper.setData({ sending: true, inviteUrl: 'existing-url' });

    wrapper.vm.closedDialog();

    expect(wrapper.vm.inviteUrl).to.equal('existing-url');
    expect(wrapper.emitted().close).to.equal(undefined);
  });

  it('指定されたルームの招待URLを作成して表示用の文字列を設定する', async () => {
    const apiCalls = [];
    roomMemberApi.invite = (payload, options) => {
      apiCalls.push(payload);
      options.onUploadProgress({ loaded: 1, total: 2 });
      return Promise.resolve({ data: { token: 'token-1' } });
    };

    const wrapper = createWrapper({
      props: { floorId: 'target-floor', roomId: 'target-room', roomTitle: 'Target Room' },
      mocks: {
        $store: {
          getters: { roomId: 'stale-room', floorId: 'stale-floor', roomTitle: 'Stale Room' },
          dispatch: () => {},
        },
      },
    });
    wrapper.setData({ period: '3d' });

    wrapper.vm.onPressCreateInviteUrl();
    await flushPromises();

    expect(apiCalls[0]).to.deep.equal({ room_id: 'target-room', period: '3d' });
    expect(wrapper.vm.periodDisplayName).to.equal('3日');
    expect(wrapper.vm.issuedPeriod).to.equal('3d');
    const baseUrl = API_BASE_URL || '';
    expect(wrapper.vm.inviteUrl).to.equal(`${baseUrl}/floor/target-floor/room/target-room/invite/token-1`);
    expect(wrapper.get('[data-testid="dialog-invite-room-member-url"]').attributes('readonly')).to.equal('');
    expect(wrapper.get('[data-testid="dialog-invite-room-member-url"]').element.value).to.equal(
      `${baseUrl}/floor/target-floor/room/target-room/invite/token-1`
    );
    expect(wrapper.get('[data-testid="dialog-invite-room-member-status"]').attributes('role')).to.equal('status');
    expect(wrapper.get('[data-testid="dialog-invite-room-member-status"]').text()).to.equal(
      'roomMemberDialogs.inviteCreated'
    );
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.progressAmount).to.equal(0);
  });

  it('対象フロアまたはルームIDがなければAPIを呼ばない', () => {
    let called = false;
    roomMemberApi.invite = () => {
      called = true;
      return Promise.resolve({});
    };
    const missingFloor = createWrapper({ props: { floorId: '' } });
    const missingRoom = createWrapper({ props: { roomId: '' } });

    missingFloor.vm.onPressCreateInviteUrl();
    missingRoom.vm.onPressCreateInviteUrl();

    expect(called).to.equal(false);
    expect(missingFloor.vm.sending).to.equal(false);
    expect(missingRoom.vm.sending).to.equal(false);
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
    expect(wrapper.get('[data-testid="dialog-invite-room-member-status"]').text()).to.equal(
      'roomMemberDialogs.invitePeriodChanged'
    );
    expect(wrapper.get('[data-testid="dialog-invite-room-member-copy-desktop"]').attributes('disabled')).to.equal(
      ''
    );

    await wrapper.setData({ period: '8h' });
    expect(wrapper.vm.canCopyInviteUrl).to.equal(true);
  });

  it('招待URL作成中はキャンセル操作を無視する', () => {
    const wrapper = createWrapper();
    wrapper.setData({ sending: true, visible: true });

    wrapper.vm.onPressCancelButton();

    expect(wrapper.vm.visible).to.equal(true);
  });

  it('閉じた時に進捗を初期化する', () => {
    const wrapper = createWrapper();
    wrapper.setData({ progressAmount: 75 });

    wrapper.vm.closedDialog();

    expect(wrapper.vm.progressAmount).to.equal(0);
  });

  it('クリップボード成功/失敗でスナックバーを表示する', () => {
    const wrapper = createWrapper();
    const messages = [];
    wrapper.vm.setSnackbar = (message, role) => {
      messages.push({ message, role });
    };

    wrapper.vm.clipbordCopySuccess();
    wrapper.vm.clipbordCopyError();

    expect(messages[0]).to.deep.equal({ message: 'クリップボードへコピーしました', role: 'status' });
    expect(messages[1]).to.deep.equal({ message: 'クリップボードへのコピーに失敗しました', role: 'alert' });
  });

  it('401エラー時はログアウトしてログイン画面へ移動する', () => {
    const dispatchCalls = [];
    const pushCalls = [];
    const wrapper = createWrapper({
      mocks: {
        $store: {
          getters: { roomId: 'room-1', floorId: 'floor-1', roomTitle: 'Room' },
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
