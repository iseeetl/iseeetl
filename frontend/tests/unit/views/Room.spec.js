import { expect, vi } from 'vitest';
import { reactive } from 'vue';
import { setTestRoute, shallowMount } from '../helpers/testUtils';
import { createMemoryHistory, createRouter as createVueRouter } from 'vue-router';
import Room from '@/views/Room.vue';
import chatApi from '@/api/chat';
import roomApi from '@/api/room';

import flushPromises from '../helpers/flushPromises';

const buildRoomFixture = (id) => ({
  _id: id,
  image_name: null,
  room_display_hidden: false,
  member_only: false,
  current_user_is_room_member: false,
  guest_reaction_only: false,
  external_sns_button: false,
  lang: 'ja',
  title: id,
  description: '',
  translations: [],
  user: { _id: 'user-1', image_name: null, username: 'User' },
  created_at: '2026-07-11T00:00:00.000Z',
});

const FloorMemberDialogStub = {
  name: 'FloorMemberDialog',
  props: {
    dialogVisible: Boolean,
    propsRole: Object,
    floorId: String,
    floorTitle: String,
  },
  emits: ['close', 'delete', 'request-close'],
  methods: {
    applyDeletedMember() {
      return true;
    },
  },
  template: '<div></div>',
};

const DeleteFloorMemberDialogStub = {
  name: 'DeleteFloorMemberDialog',
  props: {
    dialogVisible: Boolean,
    propsFloorMember: Object,
    floorId: String,
    floorTitle: String,
  },
  emits: ['close', 'success'],
  template: '<div></div>',
};

const InviteFloorMemberDialogStub = {
  name: 'InviteFloorMemberDialog',
  props: {
    dialogVisible: Boolean,
    floorId: String,
    floorTitle: String,
  },
  emits: ['close'],
  template: '<div></div>',
};

const LeaveFloorMemberDialogStub = {
  name: 'LeaveFloorMemberDialog',
  props: {
    dialogVisible: Boolean,
    floorId: String,
    floorTitle: String,
  },
  emits: ['close', 'success'],
  template: '<div></div>',
};

const KickedUserDialogStub = {
  name: 'KickedUserDialog',
  props: {
    dialogVisible: Boolean,
    floorId: String,
    floorTitle: String,
  },
  emits: ['close', 'release', 'request-close'],
  methods: {
    applyReleasedUser() {
      return true;
    },
  },
  template: '<div></div>',
};

const DeleteKickedUserDialogStub = {
  name: 'DeleteKickedUserDialog',
  props: {
    dialogVisible: Boolean,
    floorId: String,
    floorTitle: String,
    kickedUser: Object,
  },
  emits: ['close', 'success'],
  template: '<div></div>',
};

const InviteRoomMemberDialogStub = {
  name: 'InviteRoomMemberDialog',
  props: {
    dialogVisible: Boolean,
    floorId: String,
    roomId: String,
    roomTitle: String,
  },
  emits: ['close'],
  template: '<div></div>',
};

const RoomMemberDialogStub = {
  name: 'RoomMemberDialog',
  props: {
    dialogVisible: Boolean,
    canDeleteMembers: Boolean,
    roomId: String,
    roomTitle: String,
  },
  emits: ['close', 'delete', 'request-close'],
  methods: {
    applyDeletedMember() {
      return true;
    },
  },
  template: '<div></div>',
};

const DeleteRoomMemberDialogStub = {
  name: 'DeleteRoomMemberDialog',
  props: {
    dialogVisible: Boolean,
    propsRoomMember: Object,
    roomTitle: String,
  },
  emits: ['close', 'success'],
  template: '<div></div>',
};

const ResourceQuickTextDialogStub = {
  name: 'ResourceQuickTextDialog',
  props: {
    dialogVisible: Boolean,
    resource: String,
    resourceId: String,
    targetName: String,
    canManage: Boolean,
  },
  emits: ['close'],
  template: '<div data-testid="resource-quicktext-dialog-stub" />',
};

const UpdateRoomDisplayConfirmStub = {
  name: 'UpdateRoomDisplayConfirm',
  props: {
    confirmVisible: Boolean,
    roomDisplayHidden: Boolean,
    sending: Boolean,
  },
  template: '<div />',
};

const baseStubs = {
  draggable: {
    props: ['list'],
    template: '<ul><slot v-for="(element, index) in list" name="item" :element="element" :index="index" /></ul>',
  },
  EditRoomDialog: true,
  DeleteRoomDialog: true,
  FloorMemberDialog: FloorMemberDialogStub,
  DeleteFloorMemberDialog: DeleteFloorMemberDialogStub,
  InviteFloorMemberDialog: InviteFloorMemberDialogStub,
  LeaveFloorMemberDialog: LeaveFloorMemberDialogStub,
  InviteRoomMemberDialog: InviteRoomMemberDialogStub,
  RoomMemberDialog: RoomMemberDialogStub,
  DeleteRoomMemberDialog: DeleteRoomMemberDialogStub,
  RoomTagDialog: true,
  ResourceQuickTextDialog: ResourceQuickTextDialogStub,
  FloorTagDialog: true,
  ScopedAIAnalysisSettingDialog: true,
  UpdateRoomDisplayConfirm: UpdateRoomDisplayConfirmStub,
  KickedUserDialog: KickedUserDialogStub,
  DeleteKickedUserDialog: DeleteKickedUserDialogStub,
};

const createRouter = (overrides = {}) => {
  const router = createVueRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/floor/:floor_id', name: 'Room', component: {} }],
  });
  const route = overrides.route || {};
  const params = route.params || { floor_id: 'floor-1' };
  const query = route.query || {};
  return setTestRoute(router, { name: 'Room', params, query });
};

const createStoreMock = (overrides = {}) => {
  const getters = {
    userIsLogin: true,
    userId: 'user-1',
    floorId: 'floor-1',
    floorTitle: 'Floor',
    errorMessage: null,
    ...overrides.getters,
  };
  const state = {
    user: {
      isLogin: getters.userIsLogin,
      id: 'user-1',
    },
  };
  return {
    getters,
    state,
    dispatch: overrides.dispatch || (() => {}),
  };
};

const createMountOptions = (overrides = {}) => ({
  stubs: { ...baseStubs, ...(overrides.stubs || {}) },
  router: overrides.router || createRouter({ route: overrides.route }),
  provide: overrides.provide || {},
  mocks: {
    $store: overrides.store || createStoreMock(),
    $t: (key) => key,
    $i18n: { locale: 'ja' },
    ...(overrides.mocks || {}),
  },
});

const buildViewWithoutLifecycle = (view) => ({
  ...view,
  created() {},
  mounted() {},
  beforeUnmount() {},
});

describe('ルーム一覧画面', () => {
  it('全ルーム表示確認へ送信状態を渡す', async () => {
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(View, createMountOptions());
    await wrapper.setData({ sending: true, updateRoomDisplayVisible: true, roomDisplayHidden: false });

    expect(wrapper.findComponent(UpdateRoomDisplayConfirmStub).props()).to.include({
      confirmVisible: true,
      roomDisplayHidden: false,
      sending: true,
    });
  });

  let originalRole;
  let originalUpdateDisplayHidden;
  let originalUpdateDisplayOrder;

  beforeEach(() => {
    originalRole = chatApi.role;
    originalUpdateDisplayHidden = roomApi.updateDisplayHidden;
    originalUpdateDisplayOrder = roomApi.updateDisplayOrder;
  });

  afterEach(() => {
    chatApi.role = originalRole;
    roomApi.updateDisplayHidden = originalUpdateDisplayHidden;
    roomApi.updateDisplayOrder = originalUpdateDisplayOrder;
  });

  it('ルーム情報リンクとドラッグボタンを入れ子にせず描画する', async () => {
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(View, createMountOptions());
    await wrapper.setData({
      floorTitle: 'Floor',
      rooms: [buildRoomFixture('room-1')],
      isAdmin: true,
    });

    const roomWrapper = wrapper.find('.room-wrapper');
    expect(roomWrapper.exists()).to.equal(true);
    expect(roomWrapper.find('ui-tooltip-stub').exists()).to.equal(true);
    expect(roomWrapper.find('.room-link').exists()).to.equal(true);
    expect(roomWrapper.find('.room-link ui-button-stub').exists()).to.equal(false);
  });

  it('setUserRoleで権限フラグを設定する', () => {
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(View, createMountOptions());

    wrapper.vm.setUserRole('Administrator');
    expect(wrapper.vm.isAdmin).to.equal(true);
    expect(wrapper.vm.isFloorEditor).to.equal(false);
    expect(wrapper.vm.isFloorMember).to.equal(false);

    wrapper.vm.setUserRole('FloorEditor');
    expect(wrapper.vm.isAdmin).to.equal(false);
    expect(wrapper.vm.isFloorEditor).to.equal(true);

    wrapper.vm.setUserRole('FloorMember');
    expect(wrapper.vm.isFloorMember).to.equal(true);

    wrapper.vm.setUserRole('RoomMember');
    expect(wrapper.vm.isRoomMember).to.equal(true);
  });

  it('管理者とフロア作成者だけにフロア・ルームのAI解析設定ボタンを表示する', async () => {
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(View, createMountOptions());
    await wrapper.setData({ rooms: [buildRoomFixture('room-1')] });

    await wrapper.setData({ isAdmin: true });
    expect(wrapper.find('[data-testid="room-floor-ai-analysis-settings-button"]').exists()).to.equal(true);
    expect(wrapper.find('[data-testid="room-ai-analysis-settings-button-room-1"]').exists()).to.equal(true);

    await wrapper.setData({ isAdmin: false, isFloorEditor: true });
    expect(wrapper.find('[data-testid="room-floor-ai-analysis-settings-button"]').exists()).to.equal(true);
    expect(wrapper.find('[data-testid="room-ai-analysis-settings-button-room-1"]').exists()).to.equal(true);

    await wrapper.setData({ isFloorEditor: false, isFloorMember: true });
    expect(wrapper.find('[data-testid="room-floor-ai-analysis-settings-button"]').exists()).to.equal(false);
    expect(wrapper.find('[data-testid="room-ai-analysis-settings-button-room-1"]').exists()).to.equal(false);
    expect(wrapper.find('[data-testid="room-tag-button-room-1"]').exists()).to.equal(true);

    await wrapper.setData({ isFloorMember: false, isRoomMember: true });
    expect(wrapper.find('[data-testid="room-floor-ai-analysis-settings-button"]').exists()).to.equal(false);
    expect(wrapper.find('[data-testid="room-ai-analysis-settings-button-room-1"]').exists()).to.equal(false);
    expect(wrapper.findAllComponents({ name: 'ScopedAIAnalysisSettingDialog' })).to.have.lengthOf(0);

    await wrapper.setData({ isRoomMember: false });
    expect(wrapper.find('[data-testid="room-floor-ai-analysis-settings-button"]').exists()).to.equal(false);
    expect(wrapper.find('[data-testid="room-ai-analysis-settings-button-room-1"]').exists()).to.equal(false);

    wrapper.vm.showFloorAIAnalysisSettingDialog();
    wrapper.vm.showRoomAIAnalysisSettingDialog('room-1');
    expect(wrapper.vm.floorAIAnalysisSettingDialogVisible).to.equal(false);
    expect(wrapper.vm.roomAIAnalysisSettingDialogVisible).to.equal(false);
  });

  it('管理権限に応じたルーム操作を表示し、削除対象を確認ダイアログへ渡す', async () => {
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(View, createMountOptions());
    const room = buildRoomFixture('room-1');
    await wrapper.setData({ rooms: [room], isAdmin: true });

    const adminActions = wrapper.find('.room-action');
    expect(adminActions.findAll('ui-button-stub').map((button) => button.text())).to.deep.equal([
      '削除',
      'ルームタグ',
      'aiAnalysisSettings.roomButton',
      'ルーム単語',
      '編集',
    ]);

    await adminActions.find('.delete-room-button-room-1').trigger('click');
    expect(wrapper.vm.deleteRoomDialogVisible).to.equal(true);
    expect(wrapper.vm.deleteRoomValue).to.deep.equal(room);

    await wrapper.setData({
      deleteRoomDialogVisible: false,
      isAdmin: false,
      isFloorMember: true,
    });
    expect(wrapper.find('.room-action').findAll('ui-button-stub').map((button) => button.text())).to.deep.equal([
      '削除',
      'ルームタグ',
      'ルーム単語',
      '編集',
    ]);

    await wrapper.setData({ isFloorMember: false, isRoomMember: true });
    expect(wrapper.find('.room-action').exists()).to.equal(false);
  });

  it('ルーム削除確認が閉じた後に次のルーム、一覧操作の順でフォーカスを復元する', async () => {
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(View, createMountOptions());
    const firstRoom = buildRoomFixture('room-1');
    const secondRoom = buildRoomFixture('room-2');
    const thirdRoom = buildRoomFixture('room-3');
    const nextRoomLink = document.createElement('a');
    nextRoomLink.id = 'room-3';
    nextRoomLink.href = '#room-3';
    document.body.appendChild(nextRoomLink);

    try {
      await wrapper.setData({ rooms: [firstRoom, secondRoom, thirdRoom], isAdmin: true });
      wrapper.vm.showDeleteRoomDialog(secondRoom);
      wrapper.vm.successDeleteRoom(secondRoom);
      wrapper.vm.closeDeleteRoom();
      await wrapper.vm.$nextTick();

      expect(wrapper.vm.rooms.map((room) => room._id)).to.deep.equal(['room-1', 'room-3']);
      expect(document.activeElement).to.equal(nextRoomLink);
    } finally {
      nextRoomLink.remove();
    }

    const createButton = document.createElement('button');
    createButton.dataset.testid = 'room-list-create-button';
    document.body.appendChild(createButton);

    try {
      await wrapper.setData({ rooms: [firstRoom] });
      wrapper.vm.showDeleteRoomDialog(firstRoom);
      wrapper.vm.successDeleteRoom(firstRoom);
      wrapper.vm.closeDeleteRoom();
      await wrapper.vm.$nextTick();

      expect(wrapper.vm.rooms).to.deep.equal([]);
      expect(document.activeElement).to.equal(createButton);
    } finally {
      createButton.remove();
    }
  });

  it('メンバー限定ルームだけに権限に応じた招待・一覧操作を表示する', async () => {
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(View, createMountOptions());
    const limitedRoom = { ...buildRoomFixture('limited-room'), member_only: true };
    const publicRoom = buildRoomFixture('public-room');
    await wrapper.setData({ rooms: [limitedRoom, publicRoom], isAdmin: true });

    expect(wrapper.find('[data-testid="room-invite-member-button-limited-room"]').exists()).to.equal(true);
    expect(wrapper.find('[data-testid="room-member-list-button-limited-room"]').exists()).to.equal(true);
    expect(wrapper.find('[data-testid="room-invite-member-button-public-room"]').exists()).to.equal(false);
    expect(wrapper.find('[data-testid="room-member-list-button-public-room"]').exists()).to.equal(false);
    expect(wrapper.findAll('.room-action')[0].findAll('ui-button-stub').map((button) => button.text())).to.deep.equal([
      '削除',
      'ルームタグ',
      'aiAnalysisSettings.roomButton',
      'ルーム単語',
      'ルームメンバー招待',
      'ルームメンバー一覧',
      '編集',
    ]);

    for (const roleKey of ['isFloorEditor', 'isFloorMember']) {
      await wrapper.setData({
        isAdmin: false,
        isFloorEditor: false,
        isFloorMember: false,
        [roleKey]: true,
        rooms: [limitedRoom],
      });
      expect(wrapper.find('[data-testid="room-invite-member-button-limited-room"]').exists()).to.equal(true);
      expect(wrapper.find('[data-testid="room-member-list-button-limited-room"]').exists()).to.equal(true);
    }

    await wrapper.setData({
      isAdmin: false,
      isFloorEditor: false,
      isFloorMember: false,
      rooms: [{ ...limitedRoom, current_user_is_room_member: true }],
    });
    const memberActions = wrapper.find('.room-action');
    expect(memberActions.find('[data-testid="room-invite-member-button-limited-room"]').exists()).to.equal(false);
    expect(memberActions.find('[data-testid="room-member-list-button-limited-room"]').exists()).to.equal(true);
    expect(memberActions.find('.delete-room-button-limited-room').exists()).to.equal(false);
    expect(memberActions.find('.edit-room-button-limited-room').exists()).to.equal(false);

    await wrapper.setData({ rooms: [limitedRoom] });
    expect(wrapper.find('.room-action').exists()).to.equal(false);
  });

  it('選択したルームをメンバーダイアログへ渡し、一覧と削除の遷移を管理する', async () => {
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(View, createMountOptions());
    const room = {
      ...buildRoomFixture('room-2'),
      member_only: true,
      lang: 'en',
      title: 'Original room',
      translations: [{ lang: 'ja', title: '対象ルーム' }],
    };
    const roomMember = { _id: 'member-1', user: { username: 'Member' } };
    await wrapper.setData({ floorId: 'floor-2', rooms: [room], isFloorEditor: true });

    await wrapper.find('[data-testid="room-invite-member-button-room-2"]').trigger('click');
    const inviteDialog = wrapper.findComponent(InviteRoomMemberDialogStub);
    expect(inviteDialog.props()).to.include({
      dialogVisible: true,
      floorId: 'floor-2',
      roomId: 'room-2',
      roomTitle: '対象ルーム',
    });
    inviteDialog.vm.$emit('close');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.roomMemberDialogs.targetRoom).to.equal(null);

    await wrapper.find('[data-testid="room-member-list-button-room-2"]').trigger('click');
    const listDialog = wrapper.findComponent(RoomMemberDialogStub);
    expect(listDialog.props('dialogVisible')).to.equal(true);
    expect(listDialog.props('roomId')).to.equal('room-2');
    expect(listDialog.props('roomTitle')).to.equal('対象ルーム');
    expect(listDialog.props('canDeleteMembers')).to.equal(true);
    const applyDeletedMember = vi.spyOn(listDialog.vm, 'applyDeletedMember');

    listDialog.vm.$emit('delete', roomMember);
    await wrapper.vm.$nextTick();
    const deleteDialog = wrapper.findComponent(DeleteRoomMemberDialogStub);
    expect(deleteDialog.props('dialogVisible')).to.equal(true);
    expect(deleteDialog.props('propsRoomMember')).to.deep.equal(roomMember);
    expect(deleteDialog.props('roomTitle')).to.equal('対象ルーム');
    expect(wrapper.vm.roomMemberDialogs.targetRoom).to.deep.equal(room);
    expect(wrapper.vm.roomMemberDialogs.listVisible).to.equal(true);

    deleteDialog.vm.$emit('close');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.roomMemberDialogs.listVisible).to.equal(true);
    expect(wrapper.vm.roomMemberDialogs.deleteVisible).to.equal(false);
    expect(wrapper.vm.roomMemberDialogs.targetRoom).to.deep.equal(room);
    expect(applyDeletedMember).not.toHaveBeenCalled();

    listDialog.vm.$emit('request-close');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.roomMemberDialogs.targetRoom).to.equal(null);
    expect(wrapper.vm.roomMemberDialogs.listVisible).to.equal(false);
  });

  it('フロアメンバーによるルームメンバーの削除は、そのルームの作成者だけに許可する', async () => {
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(View, createMountOptions());
    const ownRoom = { ...buildRoomFixture('own-room'), member_only: true };
    const otherRoom = {
      ...buildRoomFixture('other-room'),
      member_only: true,
      user: { _id: 'other-user', image_name: null, username: 'Other' },
    };
    await wrapper.setData({ rooms: [ownRoom, otherRoom], isFloorMember: true });

    await wrapper.find('[data-testid="room-member-list-button-own-room"]').trigger('click');
    const listDialog = wrapper.findComponent(RoomMemberDialogStub);
    expect(listDialog.props('canDeleteMembers')).to.equal(true);

    listDialog.vm.$emit('request-close');
    await wrapper.vm.$nextTick();
    await wrapper.find('[data-testid="room-member-list-button-other-room"]').trigger('click');
    expect(listDialog.props('canDeleteMembers')).to.equal(false);
  });

  it('メンバー削除成功後は対象ルームを維持して一覧を再表示する', async () => {
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(View, createMountOptions());
    const room = {
      ...buildRoomFixture('room-3'),
      member_only: true,
      lang: 'en',
      title: 'Original room',
      translations: [{ lang: 'ja', title: '翻訳済みルーム' }],
    };
    const roomMember = { _id: 'member-1', user: { username: 'Member' } };
    await wrapper.setData({ floorId: 'floor-1', rooms: [room], isAdmin: true });

    await wrapper.find('[data-testid="room-member-list-button-room-3"]').trigger('click');
    const listDialog = wrapper.findComponent(RoomMemberDialogStub);
    const applyDeletedMember = vi.spyOn(listDialog.vm, 'applyDeletedMember');
    listDialog.vm.$emit('delete', roomMember);
    await wrapper.vm.$nextTick();

    const deleteDialog = wrapper.findComponent(DeleteRoomMemberDialogStub);
    expect(listDialog.props('roomTitle')).to.equal('翻訳済みルーム');
    expect(deleteDialog.props('roomTitle')).to.equal('翻訳済みルーム');
    deleteDialog.vm.$emit('success', roomMember);
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.roomMemberDialogs.pendingDeletedMember).to.deep.equal(roomMember);
    expect(wrapper.vm.roomMemberDialogs.deleteValue).to.deep.equal(roomMember);
    expect(wrapper.vm.roomMemberDialogs.deleteVisible).to.equal(false);
    expect(applyDeletedMember).not.toHaveBeenCalled();

    deleteDialog.vm.$emit('close');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.roomMemberDialogs.targetRoom).to.deep.equal(room);
    expect(wrapper.vm.roomMemberDialogs.listVisible).to.equal(true);
    expect(wrapper.vm.roomMemberDialogs.deleteVisible).to.equal(false);
    expect(wrapper.vm.roomMemberDialogs.deleteValue).to.equal(null);
    expect(wrapper.vm.roomMemberDialogs.pendingDeletedMember).to.equal(null);
    expect(listDialog.props('roomId')).to.equal('room-3');
    expect(applyDeletedMember).toHaveBeenCalledOnce();
    expect(applyDeletedMember).toHaveBeenCalledWith(roomMember);
  });

  it('フロアタグのダイアログの表示を切り替え、対象フロアを渡して内部画面を同じダイアログに保つ', async () => {
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(View, createMountOptions());
    await wrapper.setData({ floorTitle: 'テストフロア' });

    wrapper.vm.showFloorTagDialog();
    expect(wrapper.vm.tagDialogs.floor.listVisible).to.equal(true);
    wrapper.vm.showFloorTagDialog();
    expect(wrapper.vm.tagDialogs.floor.listVisible).to.equal(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.tagDialogs.floor.listVisible).to.equal(false);

    const floorList = wrapper.findComponent({ name: 'FloorTagDialog' });
    expect(floorList.props('floorName')).to.equal('テストフロア');
    expect(wrapper.vm.tagDialogs.floor).to.deep.equal({ listVisible: false });

    wrapper.vm.showFloorTagDialog();
    floorList.vm.$emit('close');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.tagDialogs.floor.listVisible).to.equal(false);
  });

  it('フロア招待・脱退へ対象フロアを渡し、脱退成功後はフロア一覧へ遷移する', async () => {
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(View, createMountOptions());
    const push = vi.spyOn(wrapper.vm.$router, 'push').mockResolvedValue();
    await wrapper.setData({ floorId: 'floor-1', floorTitle: '対象フロア' });

    wrapper.vm.showInviteFloorMemberDialog();
    wrapper.vm.showLeaveFloorMemberDialog();
    await wrapper.vm.$nextTick();

    const inviteDialog = wrapper.findComponent(InviteFloorMemberDialogStub);
    const leaveDialog = wrapper.findComponent(LeaveFloorMemberDialogStub);
    expect(inviteDialog.props()).to.include({
      dialogVisible: true,
      floorId: 'floor-1',
      floorTitle: '対象フロア',
    });
    expect(leaveDialog.props()).to.include({
      dialogVisible: true,
      floorId: 'floor-1',
      floorTitle: '対象フロア',
    });

    leaveDialog.vm.$emit('success');
    await wrapper.vm.$nextTick();

    expect(push).toHaveBeenCalledWith({ name: 'Floor' });
    expect(wrapper.vm.leaveFloorMemberDialogVisible).to.equal(false);
  });

  it('フロアメンバー一覧はrequest-closeで親状態を閉じ、close通知では変更しない', async () => {
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(View, createMountOptions());
    await wrapper.setData({
      floorId: 'floor-1',
      floorTitle: '対象フロア',
      floorMemberDialogVisible: true,
    });
    const dialog = wrapper.findComponent(FloorMemberDialogStub);

    expect(dialog.props('dialogVisible')).to.equal(true);
    expect(dialog.props()).to.include({ floorId: 'floor-1', floorTitle: '対象フロア' });
    dialog.vm.$emit('close');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.floorMemberDialogVisible).to.equal(true);

    dialog.vm.$emit('request-close');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.floorMemberDialogVisible).to.equal(false);
    expect(dialog.props('dialogVisible')).to.equal(false);
  });

  it('フロアメンバー削除確認中も一覧を維持し、成功後に対象を一覧へ反映する', async () => {
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(View, createMountOptions());
    const member = { _id: 'member-1' };
    await wrapper.setData({ floorId: 'floor-1', floorTitle: '対象フロア', floorMemberDialogVisible: true });
    const listDialog = wrapper.findComponent(FloorMemberDialogStub);
    const applyDeletedMember = vi.spyOn(listDialog.vm, 'applyDeletedMember');

    listDialog.vm.$emit('delete', member);
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.floorMemberDialogVisible).to.equal(true);
    expect(wrapper.vm.deleteFloorMemberDialogVisible).to.equal(true);
    expect(wrapper.vm.deleteFloorMemberValue).to.deep.equal(member);

    const deleteDialog = wrapper.findComponent(DeleteFloorMemberDialogStub);
    expect(deleteDialog.props()).to.include({ floorId: 'floor-1', floorTitle: '対象フロア' });
    expect(deleteDialog.props('propsFloorMember')).to.deep.equal(member);
    deleteDialog.vm.$emit('success', member);
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.pendingDeletedFloorMember).to.deep.equal(member);
    expect(wrapper.vm.deleteFloorMemberDialogVisible).to.equal(false);
    expect(applyDeletedMember).not.toHaveBeenCalled();

    deleteDialog.vm.$emit('close');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.floorMemberDialogVisible).to.equal(true);
    expect(wrapper.vm.deleteFloorMemberDialogVisible).to.equal(false);
    expect(wrapper.vm.deleteFloorMemberValue).to.equal(null);
    expect(wrapper.vm.pendingDeletedFloorMember).to.equal(null);
    expect(applyDeletedMember).toHaveBeenCalledOnce();
    expect(applyDeletedMember).toHaveBeenCalledWith(member);
  });

  it('キック解除確認中も一覧を維持し、成功後に対象を一覧へ反映する', async () => {
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(View, createMountOptions());
    const kickedUser = {
      _id: 'kicked-1',
      user: { _id: 'user-2', username: '解除対象' },
    };
    await wrapper.setData({
      floorId: 'floor-1',
      floorTitle: '対象フロア',
      kickedUserDialogVisible: true,
    });
    const listDialog = wrapper.findComponent(KickedUserDialogStub);
    const applyReleasedUser = vi.spyOn(listDialog.vm, 'applyReleasedUser');

    expect(listDialog.props()).to.include({ floorId: 'floor-1', floorTitle: '対象フロア' });
    listDialog.vm.$emit('release', kickedUser);
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.kickedUserDialogVisible).to.equal(true);
    expect(wrapper.vm.deleteKickedUserDialogVisible).to.equal(true);
    expect(wrapper.vm.deleteKickedUserValue).to.deep.equal(kickedUser);

    const releaseDialog = wrapper.findComponent(DeleteKickedUserDialogStub);
    expect(releaseDialog.props()).to.include({ floorId: 'floor-1', floorTitle: '対象フロア' });
    expect(releaseDialog.props('kickedUser')).to.deep.equal(kickedUser);
    releaseDialog.vm.$emit('success', kickedUser);
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.pendingReleasedKickedUser).to.deep.equal(kickedUser);
    expect(wrapper.vm.deleteKickedUserDialogVisible).to.equal(false);
    expect(applyReleasedUser).not.toHaveBeenCalled();

    releaseDialog.vm.$emit('close');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.deleteKickedUserValue).to.equal(null);
    expect(wrapper.vm.pendingReleasedKickedUser).to.equal(null);
    expect(applyReleasedUser).toHaveBeenCalledOnce();
    expect(applyReleasedUser).toHaveBeenCalledWith(kickedUser);
  });

  it('キック済みユーザ一覧はrequest-closeで親状態を閉じる', async () => {
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(View, createMountOptions());
    await wrapper.setData({ kickedUserDialogVisible: true });
    const dialog = wrapper.findComponent(KickedUserDialogStub);

    dialog.vm.$emit('request-close');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.kickedUserDialogVisible).to.equal(false);
    expect(dialog.props('dialogVisible')).to.equal(false);
  });

  it('ルームタグのダイアログへ翻訳済みの対象名を渡し、内部画面を同じダイアログに保つ', async () => {
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(View, createMountOptions());
    const room = {
      ...buildRoomFixture('room-1'),
      lang: 'en',
      title: 'English room',
      translations: [{ lang: 'ja', title: 'テストルーム', description: '' }],
    };
    await wrapper.setData({ rooms: [room] });

    wrapper.vm.showRoomTagDialog('room-1');
    await wrapper.vm.$nextTick();
    const roomList = wrapper.findComponent({ name: 'RoomTagDialog' });
    expect(roomList.props('dialogVisible')).to.equal(true);
    expect(roomList.props('roomId')).to.equal('room-1');
    expect(roomList.props('roomName')).to.equal('テストルーム');

    roomList.vm.$emit('close');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.tagDialogs.room.listVisible).to.equal(false);
    expect(wrapper.vm.tagDialogs.room.roomId).to.equal(null);
  });

  it('AI解析設定ダイアログへ対象範囲・floorId・roomIdを渡す', async () => {
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(View, createMountOptions());
    const room = {
      ...buildRoomFixture('room-1'),
      lang: 'en',
      title: 'English room',
      translations: [{ lang: 'ja', title: '対象ルーム', description: '' }],
    };
    await wrapper.setData({
      floorId: 'floor-1',
      floorTitle: '対象フロア',
      rooms: [room],
      isFloorEditor: true,
    });

    wrapper.vm.showFloorAIAnalysisSettingDialog();
    wrapper.vm.showRoomAIAnalysisSettingDialog('room-1');
    await wrapper.vm.$nextTick();

    const dialogs = wrapper.findAllComponents({ name: 'ScopedAIAnalysisSettingDialog' });
    expect(dialogs).to.have.lengthOf(2);
    expect(dialogs[0].props()).to.include({
      dialogVisible: true,
      scope: 'floor',
      floorId: 'floor-1',
      targetName: '対象フロア',
    });
    expect(dialogs[1].props()).to.include({
      dialogVisible: true,
      scope: 'room',
      floorId: 'floor-1',
      roomId: 'room-1',
      targetName: '対象ルーム',
    });

    wrapper.vm.closeRoomAIAnalysisSettingDialog();
    expect(wrapper.vm.aiAnalysisSettingRoomId).to.equal(null);
    expect(wrapper.vm.aiAnalysisSettingRoomTargetName).to.equal('');
    expect(wrapper.vm.roomAIAnalysisSettingDialogVisible).to.equal(false);
  });

  it('フロア単語ボタンは画面遷移せず対象フロアの管理ダイアログを開き、closeで状態を解放する', async () => {
    const router = createRouter();
    const pushCalls = [];
    router.push = (route) => pushCalls.push(route);
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(View, createMountOptions({ router }));
    await wrapper.setData({
      floorId: 'floor-2',
      floorTitle: '対象フロア',
      isAdmin: true,
    });

    await wrapper.get('[data-testid="room-floor-quicktext-button"]').trigger('click');

    expect(pushCalls).to.deep.equal([]);
    const dialog = wrapper.findComponent(ResourceQuickTextDialogStub);
    expect(dialog.props()).to.include({
      dialogVisible: true,
      resource: 'floor',
      resourceId: 'floor-2',
      targetName: '対象フロア',
      canManage: true,
    });

    dialog.vm.$emit('close');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.floorQuickTextDialogVisible).to.equal(false);
    expect(wrapper.findComponent(ResourceQuickTextDialogStub).exists()).to.equal(false);
  });

  it('ルーム単語ボタンは画面遷移せず選択ルームを渡し、対象切替とclose時の解放を行う', async () => {
    const router = createRouter();
    const pushCalls = [];
    router.push = (route) => pushCalls.push(route);
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(View, createMountOptions({ router }));
    const firstRoom = {
      ...buildRoomFixture('room-1'),
      lang: 'en',
      title: 'First room',
      translations: [{ lang: 'ja', title: '最初のルーム', description: '' }],
    };
    const secondRoom = {
      ...buildRoomFixture('room-2'),
      title: '次のルーム',
    };
    await wrapper.setData({
      rooms: [firstRoom, secondRoom],
      isFloorEditor: true,
    });

    await wrapper.get('[data-testid="room-quicktext-button-room-1"]').trigger('click');
    expect(pushCalls).to.deep.equal([]);
    expect(wrapper.findComponent(ResourceQuickTextDialogStub).props()).to.include({
      dialogVisible: true,
      resource: 'room',
      resourceId: 'room-1',
      targetName: '最初のルーム',
      canManage: true,
    });

    await wrapper.get('[data-testid="room-quicktext-button-room-2"]').trigger('click');
    expect(wrapper.vm.roomQuickTextDialogTarget).to.deep.equal(secondRoom);
    const switchedDialog = wrapper.findComponent(ResourceQuickTextDialogStub);
    expect(switchedDialog.props()).to.include({
      resourceId: 'room-2',
      targetName: '次のルーム',
      canManage: true,
    });

    switchedDialog.vm.$emit('close');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.roomQuickTextDialogVisible).to.equal(false);
    expect(wrapper.vm.roomQuickTextDialogTarget).to.equal(null);
    expect(wrapper.findComponent(ResourceQuickTextDialogStub).exists()).to.equal(false);
  });

  it('単語管理の権限がなければ、メソッドを直接呼んでもダイアログを開かない', async () => {
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(View, createMountOptions());
    const room = buildRoomFixture('room-1');
    await wrapper.setData({ floorId: 'floor-1', rooms: [room], isRoomMember: true });

    expect(wrapper.find('[data-testid="room-floor-quicktext-button"]').exists()).to.equal(false);
    expect(wrapper.find('[data-testid="room-quicktext-button-room-1"]').exists()).to.equal(false);
    wrapper.vm.showFloorQuickTextDialog();
    wrapper.vm.showRoomQuickTextDialog(room);
    expect(wrapper.vm.floorQuickTextDialogVisible).to.equal(false);
    expect(wrapper.vm.roomQuickTextDialogVisible).to.equal(false);
    expect(wrapper.vm.roomQuickTextDialogTarget).to.equal(null);

    await wrapper.setData({ isRoomMember: false, isFloorMember: true });
    expect(wrapper.find('[data-testid="room-floor-quicktext-button"]').exists()).to.equal(false);
    expect(wrapper.find('[data-testid="room-quicktext-button-room-1"]').exists()).to.equal(true);
    await wrapper.get('[data-testid="room-quicktext-button-room-1"]').trigger('click');
    expect(wrapper.findComponent(ResourceQuickTextDialogStub).props()).to.include({
      resource: 'room',
      resourceId: 'room-1',
      canManage: true,
    });

    wrapper.vm.closeRoomQuickTextDialog();
    await wrapper.setData({ isFloorMember: false, isFloorEditor: true });
    expect(wrapper.find('[data-testid="room-floor-quicktext-button"]').exists()).to.equal(true);
    expect(wrapper.find('[data-testid="room-quicktext-button-room-1"]').exists()).to.equal(true);
  });

  it('setFloorDetails は翻訳された説明を反映する', () => {
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(
      View,
      createMountOptions({
        mocks: { $i18n: { locale: 'ja' } },
      })
    );
    const floorData = {
      _id: 'floor-1',
      lang: 'en',
      title: 'Title',
      description: 'Desc',
      translations: [{ lang: 'ja', title: '日本語', description: '説明' }],
      image_name: null,
    };

    wrapper.vm.setFloorDetails(floorData);

    expect(wrapper.vm.floorTitle).to.equal('日本語');
    expect(wrapper.vm.floorDescription).to.equal('説明');
  });

  it('プロフィール言語変更後に表示中のフロア名と説明を再計算する', async () => {
    const i18n = reactive({ locale: 'ja' });
    const dispatchCalls = [];
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(
      View,
      createMountOptions({
        store: createStoreMock({
          dispatch: (type, payload) => dispatchCalls.push({ type, payload }),
        }),
        mocks: { $i18n: i18n },
      })
    );
    wrapper.vm.setFloorDetails({
      _id: 'floor-1',
      lang: 'ja',
      title: '日本語',
      description: '説明',
      translations: [{ lang: 'en', title: 'English', description: 'Description' }],
      image_name: null,
    });

    i18n.locale = 'en';
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.floorTitle).to.equal('English');
    expect(wrapper.vm.floorDescription).to.equal('Description');
    expect(dispatchCalls.at(-1)).to.deep.equal({
      type: 'doUpdateFloor',
      payload: { id: 'floor-1', title: 'English' },
    });
  });

  it('ログイン時にinitRoomが必要な処理を呼ぶ', async () => {
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(
      View,
      createMountOptions({
        store: createStoreMock({ getters: { userIsLogin: true } }),
      })
    );

    let roleCalls = 0;
    let kickedCalls = 0;
    let floorCalls = 0;
    let roomCalls = 0;

    wrapper.vm.checkUserRole = () => {
      roleCalls += 1;
      return Promise.resolve();
    };
    wrapper.vm.checkKickedUser = () => {
      kickedCalls += 1;
      return Promise.resolve(false);
    };
    wrapper.vm.fetchAndSetFloorDetails = () => {
      floorCalls += 1;
      return Promise.resolve();
    };
    wrapper.vm.fetchRoomList = () => {
      roomCalls += 1;
      return Promise.resolve();
    };

    await wrapper.vm.initRoom();

    expect(roleCalls).to.equal(1);
    expect(kickedCalls).to.equal(1);
    expect(floorCalls).to.equal(1);
    expect(roomCalls).to.equal(1);
  });

  it('初期化がすべて成功した後だけフロア情報をページ計測へ渡す', async () => {
    const token = Object.freeze({});
    const events = [];
    const pageReporter = {
      capture: vi.fn(() => token),
      activate: vi.fn((capturedToken, floor) => {
        events.push('activate');
        expect(capturedToken).to.equal(token);
        expect(floor).to.equal(rawFloor);
        return true;
      }),
      cancel: vi.fn(() => true),
    };
    const rawFloor = {
      _id: '507f1f77bcf86cd799439011',
      title: 'Raw Floor',
      translations: [{ lang: 'ja', title: '表示用翻訳' }],
    };
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(View, createMountOptions({
      provide: { analyticsPageReporter: pageReporter },
      store: createStoreMock({ getters: { userIsLogin: false } }),
    }));
    wrapper.vm.checkKickedUser = vi.fn().mockResolvedValue(false);
    wrapper.vm.fetchAndSetFloorDetails = vi.fn(async () => {
      events.push('floor');
      return rawFloor;
    });
    wrapper.vm.fetchRoomList = vi.fn(async () => {
      events.push('rooms');
    });

    expect(wrapper.vm.captureRoomListAnalytics()).to.equal(token);
    await wrapper.vm.initRoom();

    expect(events).to.deep.equal(['floor', 'rooms', 'activate']);
    expect(pageReporter.activate).toHaveBeenCalledOnce();
    expect(pageReporter.cancel).not.toHaveBeenCalled();
  });

  it('初期化失敗と画面破棄では対象の計測を取り消し、画面処理へ例外を返さない', async () => {
    const firstToken = Object.freeze({ id: 'first' });
    const secondToken = Object.freeze({ id: 'second' });
    const pageReporter = {
      capture: vi.fn()
        .mockReturnValueOnce(firstToken)
        .mockReturnValueOnce(secondToken),
      activate: vi.fn(() => true),
      cancel: vi.fn(() => true),
    };
    const router = createRouter({ route: { params: { floor_id: 'floor-1' } } });
    router.push = vi.fn();
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(View, createMountOptions({
      provide: { analyticsPageReporter: pageReporter },
      router,
      store: createStoreMock({ getters: { userIsLogin: false } }),
    }));
    wrapper.vm.checkKickedUser = vi.fn().mockResolvedValue(false);
    wrapper.vm.fetchAndSetFloorDetails = vi.fn().mockRejectedValue(new Error('failed'));

    wrapper.vm.captureRoomListAnalytics();
    await wrapper.vm.initRoom();
    expect(pageReporter.cancel).toHaveBeenCalledWith(firstToken);
    expect(pageReporter.activate).not.toHaveBeenCalled();

    wrapper.vm.captureRoomListAnalytics();
    expect(() => Room.beforeUnmount.call(wrapper.vm)).not.to.throw();
    expect(pageReporter.cancel).toHaveBeenCalledWith(secondToken);
  });

  it('アンマウント後に完了した旧フロア初期化の成功を後続処理へ反映しない', async () => {
    let resolveKickedCheck;
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(View, createMountOptions({
      store: createStoreMock({ getters: { userIsLogin: false } }),
    }));
    wrapper.vm.checkKickedUser = vi.fn(
      () => new Promise((resolve) => { resolveKickedCheck = resolve; })
    );
    wrapper.vm.fetchAndSetFloorDetails = vi.fn();
    wrapper.vm.fetchRoomList = vi.fn();
    wrapper.vm.activateRoomListAnalytics = vi.fn();

    const initialization = wrapper.vm.initRoom();
    await vi.waitFor(() => expect(resolveKickedCheck).to.be.a('function'));
    Room.beforeUnmount.call(wrapper.vm);
    resolveKickedCheck(false);
    await initialization;

    expect(wrapper.vm.fetchAndSetFloorDetails).not.toHaveBeenCalled();
    expect(wrapper.vm.fetchRoomList).not.toHaveBeenCalled();
    expect(wrapper.vm.activateRoomListAnalytics).not.toHaveBeenCalled();
  });

  it('アンマウント後に失敗した旧フロア初期化でエラー dispatch・画面遷移をしない', async () => {
    let rejectRoleCheck;
    const dispatch = vi.fn();
    const router = createRouter({ route: { params: { floor_id: 'floor-1' } } });
    router.push = vi.fn();
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(View, createMountOptions({
      router,
      store: createStoreMock({
        getters: { userIsLogin: true },
        dispatch,
      }),
    }));
    wrapper.vm.checkUserRole = vi.fn(
      () => new Promise((_resolve, reject) => { rejectRoleCheck = reject; })
    );

    const initialization = wrapper.vm.initRoom();
    await vi.waitFor(() => expect(rejectRoleCheck).to.be.a('function'));
    Room.beforeUnmount.call(wrapper.vm);
    rejectRoleCheck(new Error('stale failure'));
    await initialization;

    expect(dispatch).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('キック済みなら後続処理を呼ばない', async () => {
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(
      View,
      createMountOptions({
        store: createStoreMock({ getters: { userIsLogin: true } }),
      })
    );

    let floorCalls = 0;
    let roomCalls = 0;
    wrapper.vm.checkUserRole = () => Promise.resolve();
    wrapper.vm.checkKickedUser = () => Promise.resolve(true);
    wrapper.vm.fetchAndSetFloorDetails = () => {
      floorCalls += 1;
      return Promise.resolve();
    };
    wrapper.vm.fetchRoomList = () => {
      roomCalls += 1;
      return Promise.resolve();
    };

    await wrapper.vm.initRoom();

    expect(floorCalls).to.equal(0);
    expect(roomCalls).to.equal(0);
  });

  it('initRoom 失敗時はエラーメッセージと遷移を行う', async () => {
    const View = buildViewWithoutLifecycle(Room);
    const dispatchCalls = [];
    const pushCalls = [];
    const router = createRouter({ route: { params: { floor_id: 'floor-1' } } });
    router.push = (route) => pushCalls.push(route);
    const wrapper = shallowMount(
      View,
      createMountOptions({
        store: createStoreMock({
          getters: { userIsLogin: true },
          dispatch: (type, payload) => dispatchCalls.push({ type, payload }),
        }),
        router,
      })
    );

    const error = Object.assign(new Error('fail'), { response: { status: 401 } });
    wrapper.vm.checkUserRole = () => Promise.reject(error);

    await wrapper.vm.initRoom();

    expect(dispatchCalls.some((call) => call.type === 'doUpdateErrorMessage')).to.equal(true);
    expect(dispatchCalls.some((call) => call.type === 'doLogout')).to.equal(true);
    expect(pushCalls.some((call) => call.name === 'Floor')).to.equal(true);
    expect(pushCalls.some((call) => call.name === 'Login')).to.equal(true);
  });
  it('initRoomのNetwork Errorは基本文言と一度だけ連結する', async () => {
    const View = buildViewWithoutLifecycle(Room);
    const dispatchCalls = [];
    const router = createRouter({ route: { params: { floor_id: 'floor-1' } } });
    router.push = () => {};
    const wrapper = shallowMount(
      View,
      createMountOptions({
        store: createStoreMock({
          getters: { userIsLogin: false },
          dispatch: (type, payload) => dispatchCalls.push({ type, payload }),
        }),
        router,
      })
    );

    wrapper.vm.checkKickedUser = () => Promise.reject(new Error('Network Error'));
    await wrapper.vm.initRoom();

    const messageUpdate = dispatchCalls.find((call) => call.type === 'doUpdateErrorMessage');
    expect(messageUpdate.payload.message).to.equal('ルーム詳細の取得に失敗しました 処理に失敗しました');
  });

  it('member_only のゲストは入室できずアラートを出す', async () => {
    const View = buildViewWithoutLifecycle(Room);
    const pushCalls = [];
    const snackbarCalls = [];
    const router = createRouter();
    router.push = (route) => pushCalls.push(route);
    const wrapper = shallowMount(
      View,
      createMountOptions({
        store: createStoreMock({ getters: { userIsLogin: false } }),
        router,
      })
    );
    wrapper.vm.setSnackbar = (message, role) => snackbarCalls.push({ message, role });

    await wrapper.vm.checkAndNavigateToTimeline({ floor: 'f1', _id: 'r1', member_only: true });

    expect(pushCalls).to.have.lengthOf(0);
    expect(snackbarCalls[0].role).to.equal('alert');
  });

  it('前回の権限フラグが true でも最新ロールが無権限なら member_only を拒否する', async () => {
    const View = buildViewWithoutLifecycle(Room);
    chatApi.role = () => Promise.resolve({ data: { role: 'User' } });
    const pushCalls = [];
    const snackbarCalls = [];
    const router = createRouter();
    router.push = (route) => pushCalls.push(route);
    const wrapper = shallowMount(
      View,
      createMountOptions({
        store: createStoreMock({ getters: { userIsLogin: true } }),
        router,
      })
    );
    wrapper.vm.setSnackbar = (message, role) => snackbarCalls.push({ message, role });
    wrapper.vm.isRoomMember = true;

    await wrapper.vm.checkAndNavigateToTimeline({ floor: 'f1', _id: 'r1', member_only: true });

    expect(pushCalls).to.have.lengthOf(0);
    expect(snackbarCalls).to.have.lengthOf(1);
    expect(snackbarCalls[0].role).to.equal('alert');
  });

  it('全ルーム表示後に表示文言を通知し、一覧を再取得する', async () => {
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(View, createMountOptions());
    wrapper.vm.floorId = 'floor-1';
    wrapper.vm.updateRoomDisplayVisible = true;

    let fetchCalls = 0;
    let sendingAtFetch = null;
    const snackbarCalls = [];
    wrapper.vm.fetchRoomList = () => {
      fetchCalls += 1;
      sendingAtFetch = wrapper.vm.sending;
      return Promise.resolve();
    };
    wrapper.vm.setSnackbar = (message, role) => snackbarCalls.push({ message, role });
    roomApi.updateDisplayHidden = () => Promise.resolve();

    await wrapper.vm.updateRoomDisplay(false);

    expect(snackbarCalls[0]).to.deep.equal({ message: '全ルームを表示に変更しました', role: 'status' });
    expect(fetchCalls).to.equal(1);
    expect(sendingAtFetch).to.equal(false);
    expect(wrapper.vm.updateRoomDisplayVisible).to.equal(false);
  });

  it('全ルーム表示の失敗時に表示文言でエラーを通知する', async () => {
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(View, createMountOptions());
    const snackbarCalls = [];
    wrapper.vm.setSnackbar = (message, role) => snackbarCalls.push({ message, role });
    roomApi.updateDisplayHidden = () => Promise.reject(new Error('fail'));
    await wrapper.setData({ updateRoomDisplayVisible: true });

    await wrapper.vm.updateRoomDisplay(false);

    expect(snackbarCalls[0].role).to.equal('alert');
    expect(snackbarCalls[0].message).to.include('全ルームの表示変更に失敗しました');
    expect(wrapper.vm.updateRoomDisplayVisible).to.equal(true);
  });

  it('非表示ルームでもタイムラインへ遷移する', async () => {
    const View = buildViewWithoutLifecycle(Room);
    chatApi.role = () => Promise.resolve({ data: { role: 'User' } });
    const router = createRouter();
    const pushCalls = [];
    router.push = (route) => pushCalls.push(route);
    const wrapper = shallowMount(
      View,
      createMountOptions({
        store: createStoreMock({ getters: { userIsLogin: true } }),
        router,
      })
    );

    await wrapper.vm.checkAndNavigateToTimeline({ floor: 'f1', _id: 'r1', room_display_hidden: true });

    expect(pushCalls[0]).to.deep.equal({ path: '/floor/f1/room/r1' });
  });

  it('権限がある場合はタイムラインへ遷移する', async () => {
    const View = buildViewWithoutLifecycle(Room);
    chatApi.role = () => Promise.resolve({ data: { role: 'FloorMember' } });
    const pushCalls = [];
    const router = createRouter();
    router.push = (route) => pushCalls.push(route);
    const wrapper = shallowMount(
      View,
      createMountOptions({
        store: createStoreMock({ getters: { userIsLogin: true } }),
        router,
      })
    );

    await wrapper.vm.checkAndNavigateToTimeline({ floor: 'f1', _id: 'r1', member_only: true });

    expect(pushCalls[0]).to.deep.equal({ path: '/floor/f1/room/r1' });
  });

  it('role API が401ならログアウトしてログイン画面へ遷移する', async () => {
    const View = buildViewWithoutLifecycle(Room);
    chatApi.role = () => Promise.reject({ response: { status: 401 } });
    const dispatchCalls = [];
    const pushCalls = [];
    const router = createRouter();
    router.push = (route) => pushCalls.push(route);
    const wrapper = shallowMount(
      View,
      createMountOptions({
        store: createStoreMock({
          getters: { userIsLogin: true },
          dispatch: (type) => dispatchCalls.push(type),
        }),
        router,
      })
    );
    wrapper.vm.setSnackbar = () => {};

    await wrapper.vm.checkAndNavigateToTimeline({ floor: 'f1', _id: 'r1', member_only: false });

    expect(dispatchCalls).to.include('doLogout');
    expect(pushCalls.some((call) => call.name === 'Login')).to.equal(true);
  });

  it('onDragEndは401以外の失敗時に並び順を巻き戻す', async () => {
    const View = buildViewWithoutLifecycle(Room);
    const wrapper = shallowMount(View, createMountOptions());
    wrapper.vm.setSnackbar = () => {};
    wrapper.setData({
      floorId: 'floor-1',
      rooms: [buildRoomFixture('r2'), buildRoomFixture('r1')],
    });
    roomApi.updateDisplayOrder = () => Promise.reject(new Error('failed'));

    wrapper.vm.onDragEnd({ newDraggableIndex: 1, oldDraggableIndex: 0 });
    await flushPromises();

    expect(wrapper.vm.rooms.map((room) => room._id)).to.deep.equal(['r1', 'r2']);
  });
});
