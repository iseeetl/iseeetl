import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import RoomManagement from '@/views/management/RoomManagement.vue';
import roomApi from '@/api/room';
import flushPromises from '../../helpers/flushPromises';
import { createMountOptions, buildViewWithoutLifecycle } from './helpers';

const createRoom = (overrides = {}) => ({
  _id: 'room-1',
  floor: { _id: 'floor-1', title: 'Floor', delete_flg: false },
  user: { username: 'owner' },
  title: 'Room',
  description: 'Description',
  image_name: null,
  lang: 'ja',
  guest_reaction_only: false,
  member_only: false,
  notification: true,
  external_sns_button: false,
  room_display_hidden: false,
  delete_flg: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: null,
  deleted_at: null,
  ...overrides,
});

const createListStub = (items) => ({
  name: 'ManagementListBase',
  props: ['title', 'tableLabel', 'payloadBuilder', 'errorMessage'],
  data: () => ({ items }),
  methods: {
    reload() {},
    reloadFromFirstPage() {},
    showError() {},
  },
  template: `
    <section>
      <slot name="actions" :fetching="false" />
      <slot name="filters" :fetching="false" />
      <slot name="table" :items="items" :table-attrs="{ 'aria-label': tableLabel }" />
      <slot name="dialogs" />
    </section>
  `,
});

const UiButtonStub = {
  name: 'UiButton',
  props: ['tone', 'appearance', 'disabled'],
  emits: ['click'],
  template: '<button :disabled="disabled" :data-tone="tone" @click="$emit(\'click\')"><slot /></button>',
};

const ManagementStatusBadgeStub = {
  name: 'ManagementStatusBadge',
  props: ['label', 'tone'],
  template: '<span class="status-badge" :data-tone="tone">{{ label }}</span>',
};

const createWrapper = (overrides = {}) => {
  const View = buildViewWithoutLifecycle(RoomManagement);
  return shallowMount(View, createMountOptions(overrides));
};

describe('ルームの管理画面', () => {
  let originalPaginate;
  let originalSetDeleteState;

  beforeEach(() => {
    originalPaginate = roomApi.managementPaginate;
    originalSetDeleteState = roomApi.managementSetDeleteState;
  });

  afterEach(() => {
    roomApi.managementPaginate = originalPaginate;
    roomApi.managementSetDeleteState = originalSetDeleteState;
  });

  it('検索条件、table名、エラーメッセージをManagementListBaseに渡す', () => {
    const wrapper = createWrapper();
    const listBase = wrapper.findComponent({ name: 'ManagementListBase' });

    expect(listBase.props()).to.include({
      title: 'ルーム管理',
      tableLabel: 'managementUi.tableLabel',
      errorMessage: 'managementUi.loadResourceFailed',
      searchEnabled: true,
      searchMinLength: 2,
      searchMaxLength: 100,
      searchLabel: '検索',
    });
  });

  it('fetchRoomは管理APIを呼ぶ', async () => {
    const calls = [];
    roomApi.managementPaginate = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: {} });
    };
    const wrapper = createWrapper();

    await wrapper.vm.fetchRoom({ page: 2, search: 'word', delete_flg: false });

    expect(calls).to.deep.equal([{ page: 2, search: 'word', delete_flg: false }]);
  });

  it('状態絞り込み条件をboolean delete_flgへ変換し、allでは省略する', async () => {
    const wrapper = createWrapper();
    let reloadFromFirstPageCount = 0;
    Object.assign(wrapper.vm.$refs.listBase, {
      reloadFromFirstPage: () => {
        reloadFromFirstPageCount += 1;
        return Promise.resolve();
      },
    });

    expect(wrapper.vm.statusFilter).to.equal('all');
    expect(wrapper.vm.buildListPayload({ page: 2, search: 'word' })).to.deep.equal({
      page: 2,
      search: 'word',
    });
    await wrapper.vm.onStatusFilterChange('deleted');
    expect(wrapper.vm.buildListPayload({ page: 1, search: null })).to.deep.equal({
      page: 1,
      search: null,
      delete_flg: true,
    });
    await wrapper.vm.onStatusFilterChange('all');
    expect(wrapper.vm.buildListPayload({ page: 1, search: null })).to.deep.equal({ page: 1, search: null });
    expect(reloadFromFirstPageCount).to.equal(2);
  });

  it('データの状態・表示設定・公開範囲をバッジで示し、行全体を操作対象にしない', async () => {
    const wrapper = createWrapper({
      stubs: {
        ManagementListBase: createListStub([
          createRoom(),
          createRoom({
            _id: 'room-2',
            title: 'Deleted room',
            delete_flg: true,
            room_display_hidden: true,
            member_only: true,
            deleted_at: '2026-02-01T00:00:00.000Z',
          }),
        ]),
        ManagementStatusBadge: ManagementStatusBadgeStub,
        UiButton: UiButtonStub,
      },
    });
    const rows = wrapper.findAll('tbody tr');

    expect(wrapper.get('table').attributes('aria-label')).to.equal('managementUi.tableLabel');
    expect(rows).to.have.lengthOf(2);
    expect(rows[0].classes()).not.to.include('management-table__interactive-row');
    expect(rows[0].findAll('button').map((button) => button.text())).to.deep.equal([
      'managementUi.delete',
      'managementUi.edit',
    ]);
    expect(wrapper.get('table').classes()).to.include('management-table--wide');
    expect(rows[1].findAll('button').map((button) => button.text())).to.deep.equal(['managementUi.restore']);
    expect(rows[0].findAll('.status-badge').map((badge) => badge.text())).to.deep.equal([
      'managementUi.statusActive',
      'managementUi.statusVisible',
      'managementUi.statusPublic',
    ]);
    expect(rows[1].findAll('.status-badge').map((badge) => badge.text())).to.deep.equal([
      'managementUi.statusDeleted',
      'managementUi.statusHidden',
      'managementUi.statusMembersOnly',
    ]);

    await rows[0].trigger('click');
    expect(wrapper.vm.editRoomValue.dialogVisible).to.equal(false);
  });

  it('有効ルームだけを編集でき、管理編集では論理削除入力要素を隠す', async () => {
    const EditRoomDialogStub = {
      name: 'EditRoomDialog',
      props: ['dialogVisible', 'room', 'managementMode', 'showLifecycleControl'],
      template: '<div />',
    };
    const wrapper = createWrapper({ stubs: { EditRoomDialog: EditRoomDialogStub } });

    wrapper.vm.showEditRoomDialog(createRoom({ delete_flg: true }));
    expect(wrapper.vm.editRoomValue.dialogVisible).to.equal(false);

    wrapper.vm.showEditRoomDialog(createRoom());
    await wrapper.vm.$nextTick();

    const dialog = wrapper.findComponent({ name: 'EditRoomDialog' });
    expect(dialog.props()).to.include({
      dialogVisible: true,
      managementMode: true,
      showLifecycleControl: false,
    });
    expect(dialog.props('room')._id).to.equal('room-1');
    expect(dialog.props('room').floor).to.equal('floor-1');
  });

  it('親フロアが削除済みまたは不明なら利用不可を示し、復元を無効化して理由を関連付ける', () => {
    const blockedRoom = createRoom({
      delete_flg: true,
      floor: { _id: 'floor-1', title: 'Deleted floor', delete_flg: true },
    });
    const wrapper = createWrapper({
      stubs: {
        ManagementListBase: createListStub([blockedRoom]),
        ManagementStatusBadge: ManagementStatusBadgeStub,
        UiButton: UiButtonStub,
      },
    });
    const button = wrapper.get('tbody button');
    const reason = wrapper.get('.management-action-reason');

    expect(wrapper.vm.isRestoreUnavailable(blockedRoom)).to.equal(true);
    expect(wrapper.vm.isRestoreUnavailable(createRoom({ delete_flg: true, floor: null }))).to.equal(true);
    expect(wrapper.findAll('.status-badge').map((badge) => badge.text())).to.include(
      'managementUi.statusUnavailable'
    );
    expect(button.element.disabled).to.equal(true);
    expect(button.attributes('aria-describedby')).to.equal(reason.attributes('id'));
    expect(reason.text()).to.equal('managementUi.parentUnavailableReason');

    wrapper.vm.showLifecycleDialog(blockedRoom);
    expect(wrapper.vm.lifecycleTarget).to.equal(null);
  });

  it('削除処理中は対象を維持し、成功後に一覧を更新して閉じる', async () => {
    let resolveRequest;
    const apiCalls = [];
    roomApi.managementSetDeleteState = (payload) => {
      apiCalls.push(payload);
      return new Promise((resolve) => {
        resolveRequest = resolve;
      });
    };
    const wrapper = createWrapper();
    let reloadCount = 0;
    Object.assign(wrapper.vm.$refs.listBase, {
      reload: () => {
        reloadCount += 1;
        return Promise.resolve();
      },
    });
    const target = createRoom({ delete_flg: true });
    wrapper.vm.showLifecycleDialog(target);

    const request = wrapper.vm.setDeleteState('restore');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.sending).to.equal(true);
    wrapper.vm.clearLifecycleDialog();
    expect(wrapper.vm.lifecycleTarget).to.deep.equal(target);

    resolveRequest({ data: {} });
    await request;

    expect(apiCalls).to.deep.equal([{ _id: 'room-1', delete_flg: false }]);
    expect(reloadCount).to.equal(1);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.lifecycleDialogVisible).to.equal(false);
    expect(wrapper.vm.lifecycleTarget).to.deep.equal(target);
    wrapper.vm.handleLifecycleDialogClosed();
    expect(wrapper.vm.lifecycleTarget).to.equal(null);
  });

  it('削除状態更新に失敗した場合は対象を維持して再試行可能にする', async () => {
    const error = new Error('failed');
    roomApi.managementSetDeleteState = () => Promise.reject(error);
    const wrapper = createWrapper();
    const shownErrors = [];
    Object.assign(wrapper.vm.$refs.listBase, {
      showError: (...args) => shownErrors.push(args),
    });
    const target = createRoom();
    wrapper.vm.showLifecycleDialog(target);

    await wrapper.vm.setDeleteState('delete');
    await flushPromises();

    expect(shownErrors).to.deep.equal([['削除に失敗しました', error]]);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.lifecycleDialogVisible).to.equal(true);
    expect(wrapper.vm.lifecycleTarget).to.deep.equal(target);

    const deletedTarget = createRoom({ delete_flg: true });
    wrapper.vm.showLifecycleDialog(deletedTarget);
    await wrapper.vm.setDeleteState('restore');

    expect(shownErrors).to.deep.equal([
      ['削除に失敗しました', error],
      ['復元に失敗しました', error],
    ]);
  });

  it('closeEditRoomは編集状態を初期化する', () => {
    const wrapper = createWrapper();
    wrapper.setData({
      editRoomValue: {
        dialogVisible: true,
        _id: 'r1',
        floor: 'f1',
        title: 'Room',
        description: 'Desc',
        image_name: 'img.png',
        lang: 'ja',
        guest_reaction_only: true,
        member_only: true,
        notification: false,
        external_sns_button: true,
        room_display_hidden: true,
        delete_flg: true,
      },
    });

    wrapper.vm.closeEditRoom();

    expect(wrapper.vm.editRoomValue).to.deep.equal({
      dialogVisible: false,
      _id: null,
      floor: null,
      title: null,
      description: null,
      image_name: null,
      lang: null,
      guest_reaction_only: false,
      member_only: false,
      notification: true,
      external_sns_button: false,
      room_display_hidden: false,
      delete_flg: false,
    });
  });
});
