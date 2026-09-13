import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import RoomTagManagement from '@/views/management/RoomTagManagement.vue';
import tagApi from '@/api/tag';
import { createMountOptions, buildViewWithoutLifecycle } from './helpers';
import flushPromises from '../../helpers/flushPromises';

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const ManagementListBaseRowsStub = {
  name: 'ManagementListBase',
  props: ['title', 'tableLabel', 'payloadBuilder'],
  data() {
    return { rows: [] };
  },
  computed: {
    tableAttrs() {
      return { 'aria-label': this.tableLabel || this.title };
    },
  },
  methods: {
    reload() {},
    reloadFromFirstPage() {},
    showError() {},
  },
  template: `
    <div>
      <slot name="actions" :fetching="false" />
      <slot name="filters" :fetching="false" />
      <slot name="table" :items="rows" :table-attrs="tableAttrs" />
      <slot name="dialogs" />
    </div>
  `,
};

describe('ルームタグの管理画面', () => {
  let originalManagementPaginate;
  let originalSetDeleteState;

  beforeEach(() => {
    originalManagementPaginate = tagApi.roomTag.managementPaginate;
    originalSetDeleteState = tagApi.roomTag.managementSetDeleteState;
  });

  afterEach(() => {
    tagApi.roomTag.managementPaginate = originalManagementPaginate;
    tagApi.roomTag.managementSetDeleteState = originalSetDeleteState;
  });

  it('fetchRoomTagは管理APIを呼ぶ', async () => {
    const calls = [];
    tagApi.roomTag.managementPaginate = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: { docs: [] } });
    };

    const View = buildViewWithoutLifecycle(RoomTagManagement);
    const wrapper = shallowMount(View, createMountOptions());
    await wrapper.vm.fetchRoomTag({ page: 1, search: 'tag' });

    expect(calls).to.deep.equal([{ page: 1, search: 'tag' }]);
  });

  it('状態絞り込み条件をデータへ反映し、変更時は先頭ページから再取得する', async () => {
    const View = buildViewWithoutLifecycle(RoomTagManagement);
    const wrapper = shallowMount(View, createMountOptions());
    const reloadCalls = [];
    wrapper.vm.$refs.listBase.reloadFromFirstPage = () => {
      reloadCalls.push('reload');
      return Promise.resolve();
    };

    expect(wrapper.vm.statusFilter).to.equal('all');
    expect(wrapper.vm.buildListPayload({ page: 2, search: 'tag' })).to.deep.equal({
      page: 2,
      search: 'tag',
    });
    await wrapper.vm.onStatusFilterChange('deleted');
    expect(wrapper.vm.buildListPayload({ page: 1, search: null })).to.deep.equal({
      page: 1,
      search: null,
      delete_flg: true,
    });
    await wrapper.vm.onStatusFilterChange('all');
    expect(wrapper.vm.buildListPayload({ page: 1, search: null })).to.deep.equal({ page: 1, search: null });
    expect(reloadCalls).to.deep.equal(['reload', 'reload']);
  });

  it('所属フロア・ルームと状態を表示し、有効なタグは編集・削除、削除済みタグは復元だけを表示する', async () => {
    const View = buildViewWithoutLifecycle(RoomTagManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({ stubs: { ManagementListBase: ManagementListBaseRowsStub } })
    );
    const listBase = wrapper.findComponent(ManagementListBaseRowsStub);
    await listBase.setData({
      rows: [
        {
          _id: 'active',
          order: 1,
          name: 'active',
          floor: { _id: 'floor-a', title: 'Floor A', delete_flg: false },
          room: { _id: 'room-a', floor: 'floor-a', title: 'Room A', delete_flg: false },
          delete_flg: false,
        },
        {
          _id: 'deleted',
          order: 2,
          name: 'deleted',
          floor: { _id: 'floor-b', title: 'Floor B', delete_flg: false },
          room: { _id: 'room-b', floor: 'floor-b', title: 'Room B', delete_flg: false },
          delete_flg: true,
        },
      ],
    });

    expect(wrapper.text()).to.contain('Floor A');
    expect(wrapper.text()).to.contain('Room A');
    expect(wrapper.text()).to.contain('Floor B');
    expect(wrapper.text()).to.contain('Room B');
    expect(wrapper.findAll('[data-testid="management-roomtag-edit"]')).to.have.lengthOf(1);
    expect(wrapper.findAll('[data-testid="management-roomtag-lifecycle"]')).to.have.lengthOf(2);
    expect(wrapper.findAll('.management-table__interactive-row')).to.have.lengthOf(0);
    expect(wrapper.get('table').attributes('aria-label')).to.equal('managementUi.tableLabel');
    expect(wrapper.findAllComponents({ name: 'ManagementStatusBadge' })).to.have.lengthOf(2);
  });

  it('親フロアやルームが利用できなければ理由を表示し、削除済みタグの復元を無効にする', async () => {
    const View = buildViewWithoutLifecycle(RoomTagManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({ stubs: { ManagementListBase: ManagementListBaseRowsStub } })
    );
    const tag = {
      _id: 'orphaned',
      order: 1,
      name: 'orphaned',
      floor: { title: 'Floor', delete_flg: false },
      room: { title: 'Deleted Room', delete_flg: true },
      delete_flg: true,
    };
    await wrapper.findComponent(ManagementListBaseRowsStub).setData({ rows: [tag] });

    const lifecycleButton = wrapper.get('[data-testid="management-roomtag-lifecycle"]');
    expect(lifecycleButton.attributes('disabled')).not.to.equal(undefined);
    expect(lifecycleButton.attributes('aria-describedby')).to.equal('management-roomtag-unavailable-orphaned');
    expect(wrapper.text()).to.contain('managementUi.parentUnavailableReason');
    expect(wrapper.findAllComponents({ name: 'ManagementStatusBadge' })).to.have.lengthOf(2);

    wrapper.vm.showLifecycleDialog(tag);
    expect(wrapper.vm.lifecycleTarget).to.equal(null);
  });

  it('継承元フロアタグが取得不能・削除済み・別フロアでも復元できる', () => {
    const View = buildViewWithoutLifecycle(RoomTagManagement);
    const wrapper = shallowMount(View, createMountOptions());
    const baseTag = {
      _id: 'inherited',
      name: 'inherited',
      floor: { _id: 'floor-1', title: 'Floor', delete_flg: false },
      room: { _id: 'room-1', floor: 'floor-1', title: 'Room', delete_flg: false },
      delete_flg: true,
    };

    const deletedSource = {
      ...baseTag,
      source_floor_tag: { _id: 'floor-tag-1', floor: 'floor-1', delete_flg: true },
    };
    const mismatchedSource = {
      ...baseTag,
      source_floor_tag: { _id: 'floor-tag-2', floor: 'floor-2', delete_flg: false },
    };
    const unavailableSource = {
      ...baseTag,
      source_floor_tag: 'floor-tag-missing',
    };

    expect(wrapper.vm.restoreUnavailable(deletedSource)).to.equal(false);
    expect(wrapper.vm.restoreUnavailable(mismatchedSource)).to.equal(false);
    expect(wrapper.vm.restoreUnavailable(unavailableSource)).to.equal(false);
    wrapper.vm.showLifecycleDialog(deletedSource);
    expect(wrapper.vm.lifecycleTarget).to.deep.equal(deletedSource);
  });

  it('showEditRoomTagDialogは選択済みタグを管理モードのダイアログへ渡す', async () => {
    const EditRoomTagDialogStub = {
      name: 'EditRoomTagDialog',
      props: [
        'dialogVisible',
        'roomTag',
        'floorName',
        'roomName',
        'tagName',
        'managementMode',
        'showLifecycleControl',
      ],
      template: '<div />',
    };
    const View = buildViewWithoutLifecycle(RoomTagManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({ stubs: { EditRoomTagDialog: EditRoomTagDialogStub } })
    );
    const tag = {
      _id: 't1',
      name: 'A',
      floor: { title: '翻訳済みフロア' },
      room: { title: '翻訳済みルーム' },
    };

    wrapper.vm.showEditRoomTagDialog(tag);
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.editRoomTagDialogVisible).to.equal(true);
    expect(wrapper.vm.selectedRoomTag).to.deep.equal(tag);
    const dialog = wrapper.findComponent({ name: 'EditRoomTagDialog' });
    expect(dialog.props('dialogVisible')).to.equal(true);
    expect(dialog.props('roomTag')._id).to.equal('t1');
    expect(dialog.props('floorName')).to.equal('翻訳済みフロア');
    expect(dialog.props('roomName')).to.equal('翻訳済みルーム');
    expect(dialog.props('tagName')).to.equal('A');
    expect(dialog.props('managementMode')).to.equal(true);
    expect(dialog.props('showLifecycleControl')).to.equal(false);
  });

  it('更新成功時にダイアログを閉じ、所属文脈を含む一覧を再取得する', async () => {
    const View = buildViewWithoutLifecycle(RoomTagManagement);
    const wrapper = shallowMount(View, createMountOptions());
    let reloadCount = 0;
    Object.assign(wrapper.vm.$refs.listBase, {
      reload: () => {
        reloadCount += 1;
      },
    });
    await wrapper.setData({ editRoomTagDialogVisible: true });
    wrapper.vm.successEditRoomTag();

    expect(reloadCount).to.equal(1);
    expect(wrapper.vm.editRoomTagDialogVisible).to.equal(false);
  });

  it('削除済みのタグは編集画面を開かず、所属情報とともに復元確認へ渡す', async () => {
    const View = buildViewWithoutLifecycle(RoomTagManagement);
    const wrapper = shallowMount(View, createMountOptions());
    const tag = {
      _id: 'deleted',
      name: 'Tag',
      floor: { _id: 'floor-1', title: 'Floor' },
      room: { _id: 'room-1', floor: 'floor-1', title: 'Room' },
      delete_flg: true,
    };

    wrapper.vm.showEditRoomTagDialog(tag);
    expect(wrapper.vm.editRoomTagDialogVisible).to.equal(false);

    wrapper.vm.showLifecycleDialog(tag);
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.lifecycleAction).to.equal('restore');
    expect(wrapper.findComponent({ name: 'ManagementLifecycleDialog' }).props('action')).to.equal('restore');
    expect(wrapper.vm.floorTitle(wrapper.vm.lifecycleTarget)).to.equal('Floor');
    expect(wrapper.vm.roomTitle(wrapper.vm.lifecycleTarget)).to.equal('Room');
  });

  it('削除状態APIと一覧再取得の完了まで対象と送信状態を維持する', async () => {
    const mutation = createDeferred();
    const reload = createDeferred();
    const calls = [];
    tagApi.roomTag.managementSetDeleteState = (payload) => {
      calls.push(payload);
      return mutation.promise;
    };
    const View = buildViewWithoutLifecycle(RoomTagManagement);
    const wrapper = shallowMount(View, createMountOptions());
    const reloadCalls = [];
    Object.assign(wrapper.vm.$refs.listBase, {
      reload: () => {
        reloadCalls.push('reload');
        return reload.promise;
      },
      showError: () => {},
    });
    wrapper.vm.showLifecycleDialog({ _id: 'tag-1', name: 'Tag', delete_flg: false });

    const operation = wrapper.vm.setDeleteState('delete');
    await wrapper.vm.$nextTick();
    expect(calls).to.deep.equal([{ _id: 'tag-1', delete_flg: true }]);
    expect(wrapper.vm.sending).to.equal(true);
    expect(wrapper.vm.lifecycleTarget._id).to.equal('tag-1');
    wrapper.vm.clearLifecycleDialog();
    await wrapper.vm.setDeleteState('delete');
    expect(calls).to.have.lengthOf(1);

    mutation.resolve();
    await flushPromises();
    expect(reloadCalls).to.deep.equal(['reload']);
    expect(wrapper.vm.sending).to.equal(true);

    reload.resolve();
    await operation;
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.lifecycleTarget._id).to.equal('tag-1');
    wrapper.vm.handleLifecycleDialogClosed();
    expect(wrapper.vm.lifecycleTarget).to.equal(null);
    expect(wrapper.vm.lifecycleDialogVisible).to.equal(false);
  });

  it('削除状態API失敗時は対象を維持する', async () => {
    const apiError = new Error('failed');
    tagApi.roomTag.managementSetDeleteState = () => Promise.reject(apiError);
    const View = buildViewWithoutLifecycle(RoomTagManagement);
    const wrapper = shallowMount(View, createMountOptions());
    const reloadCalls = [];
    const showErrorCalls = [];
    Object.assign(wrapper.vm.$refs.listBase, {
      reload: () => reloadCalls.push('reload'),
      showError: (...args) => showErrorCalls.push(args),
    });
    wrapper.vm.showLifecycleDialog({
      _id: 'tag-2',
      name: 'Tag',
      floor: { _id: 'floor-1', title: 'Floor', delete_flg: false },
      room: { _id: 'room-1', floor: 'floor-1', title: 'Room', delete_flg: false },
      delete_flg: true,
    });

    await wrapper.vm.setDeleteState('restore');

    expect(reloadCalls).to.have.lengthOf(0);
    expect(showErrorCalls).to.deep.equal([['復元に失敗しました', apiError]]);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.lifecycleTarget._id).to.equal('tag-2');
    expect(wrapper.vm.lifecycleDialogVisible).to.equal(true);
  });

  it('削除失敗時は削除の基本文言と対象を維持する', async () => {
    const apiError = new Error('failed');
    tagApi.roomTag.managementSetDeleteState = () => Promise.reject(apiError);
    const View = buildViewWithoutLifecycle(RoomTagManagement);
    const wrapper = shallowMount(View, createMountOptions());
    const showErrorCalls = [];
    wrapper.vm.$refs.listBase.showError = (...args) => showErrorCalls.push(args);
    wrapper.vm.showLifecycleDialog({
      _id: 'tag-active',
      name: 'Tag',
      floor: { _id: 'floor-1', title: 'Floor', delete_flg: false },
      room: { _id: 'room-1', floor: 'floor-1', title: 'Room', delete_flg: false },
      delete_flg: false,
    });

    await wrapper.vm.setDeleteState('delete');

    expect(showErrorCalls).to.deep.equal([['削除に失敗しました', apiError]]);
    expect(wrapper.vm.lifecycleTarget._id).to.equal('tag-active');
    expect(wrapper.vm.lifecycleDialogVisible).to.equal(true);
  });
});
