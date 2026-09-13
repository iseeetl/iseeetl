import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import FloorTagManagement from '@/views/management/FloorTagManagement.vue';
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

describe('フロアタグの管理画面', () => {
  let originalManagementPaginate;
  let originalRemove;

  beforeEach(() => {
    originalManagementPaginate = tagApi.floorTag.managementPaginate;
    originalRemove = tagApi.floorTag.managementRemove;
  });

  afterEach(() => {
    tagApi.floorTag.managementPaginate = originalManagementPaginate;
    tagApi.floorTag.managementRemove = originalRemove;
  });

  it('fetchFloorTagは管理APIを呼ぶ', async () => {
    const calls = [];
    tagApi.floorTag.managementPaginate = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: { docs: [] } });
    };

    const View = buildViewWithoutLifecycle(FloorTagManagement);
    const wrapper = shallowMount(View, createMountOptions());
    await wrapper.vm.fetchFloorTag({ page: 2, search: 'abc' });

    expect(calls).to.deep.equal([{ page: 2, search: 'abc' }]);
  });

  it('一覧はページと検索語だけを送り、削除状態の絞り込みを表示しない', () => {
    const View = buildViewWithoutLifecycle(FloorTagManagement);
    const wrapper = shallowMount(View, createMountOptions());
    expect(wrapper.vm.buildListPayload({ page: 2, search: 'tag' })).to.deep.equal({ page: 2, search: 'tag' });
    expect(wrapper.findComponent({ name: 'ManagementStatusFilter' }).exists()).to.equal(false);
  });

  it('所属フロアと状態を表示し、有効なタグは編集・削除、復元操作を表示しない', async () => {
    const View = buildViewWithoutLifecycle(FloorTagManagement);
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
          delete_flg: false,
        },
        {
          _id: 'deleted',
          order: 2,
          name: 'deleted',
          floor: { _id: 'floor-b', title: 'Floor B', delete_flg: false },
          delete_flg: true,
        },
      ],
    });

    expect(wrapper.text()).to.contain('Floor A');
    expect(wrapper.text()).to.contain('Floor B');
    expect(wrapper.findAll('[data-testid="management-floortag-edit"]')).to.have.lengthOf(2);
    expect(wrapper.findAll('[data-testid="management-floortag-lifecycle"]')).to.have.lengthOf(2);
    expect(wrapper.findAll('.management-table__interactive-row')).to.have.lengthOf(0);
    expect(wrapper.get('table').attributes('aria-label')).to.equal('managementUi.tableLabel');
    expect(wrapper.findAllComponents({ name: 'ManagementStatusBadge' })).to.have.lengthOf(0);
  });

  it('所属先が削除済みでも未使用タグの削除確認を開ける', async () => {
    const View = buildViewWithoutLifecycle(FloorTagManagement);
    const wrapper = shallowMount(View, createMountOptions());
    const tag = { _id: 'tag-1', name: 'Tag', floor: { title: 'Floor', delete_flg: true }, room: { title: 'Room', delete_flg: true } };
    wrapper.vm.showLifecycleDialog(tag);
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.lifecycleTarget).to.deep.equal(tag);
    expect(wrapper.findComponent({ name: 'ManagementLifecycleDialog' }).props('action')).to.equal('delete');
  });

  it('複製元タグがなくてもタグの編集を開ける', () => {
    const View = buildViewWithoutLifecycle(FloorTagManagement);
    const wrapper = shallowMount(View, createMountOptions());
    const tag = { _id: 'tag-1', name: 'Tag', source_category_tag: null, source_floor_tag: null };
    wrapper.vm.showEditFloorTagDialog(tag);
    expect(wrapper.vm.editFloorTagDialogVisible).to.equal(true);
  });

  it('showEditFloorTagDialogは選択済みタグを管理モードのダイアログへ渡す', async () => {
    const EditFloorTagDialogStub = {
      name: 'EditFloorTagDialog',
      props: [
        'dialogVisible',
        'floorTag',
        'floorName',
        'tagName',
        'managementMode',
      ],
      template: '<div />',
    };
    const View = buildViewWithoutLifecycle(FloorTagManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({ stubs: { EditFloorTagDialog: EditFloorTagDialogStub } })
    );
    const tag = { _id: 't1', name: 'A', floor: { title: '翻訳済みフロア' } };

    wrapper.vm.showEditFloorTagDialog(tag);
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.editFloorTagDialogVisible).to.equal(true);
    expect(wrapper.vm.selectedFloorTag).to.deep.equal(tag);
    const dialog = wrapper.findComponent({ name: 'EditFloorTagDialog' });
    expect(dialog.props('dialogVisible')).to.equal(true);
    expect(dialog.props('floorTag')._id).to.equal('t1');
    expect(dialog.props('floorName')).to.equal('翻訳済みフロア');
    expect(dialog.props('tagName')).to.equal('A');
    expect(dialog.props('managementMode')).to.equal(true);
  });

  it('更新成功時にダイアログを閉じ、所属文脈を含む一覧を再取得する', async () => {
    const View = buildViewWithoutLifecycle(FloorTagManagement);
    const wrapper = shallowMount(View, createMountOptions());
    let reloadCount = 0;
    Object.assign(wrapper.vm.$refs.listBase, {
      reload: () => {
        reloadCount += 1;
      },
    });
    await wrapper.setData({ editFloorTagDialogVisible: true });
    wrapper.vm.successEditFloorTag();

    expect(reloadCount).to.equal(1);
    expect(wrapper.vm.editFloorTagDialogVisible).to.equal(false);
  });

  it('物理削除の確認には復元できないことを表示する', async () => {
    const View = buildViewWithoutLifecycle(FloorTagManagement);
    const wrapper = shallowMount(View, createMountOptions());
    wrapper.vm.showLifecycleDialog({ _id: 'tag-1', name: 'Tag' });
    await wrapper.vm.$nextTick();
    const dialog = wrapper.findComponent({ name: 'ManagementLifecycleDialog' });
    expect(dialog.props('action')).to.equal('delete');
    expect(dialog.props('showDeleteRecoveryNote')).to.equal(false);
    expect(dialog.props('warning')).to.equal('この操作は元に戻せません');
  });

  it('削除APIと一覧再取得の完了まで対象と送信状態を維持する', async () => {
    const mutation = createDeferred();
    const reload = createDeferred();
    const calls = [];
    tagApi.floorTag.managementRemove = (payload) => {
      calls.push(payload);
      return mutation.promise;
    };
    const View = buildViewWithoutLifecycle(FloorTagManagement);
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

    const operation = wrapper.vm.deleteTag();
    await wrapper.vm.$nextTick();
    expect(calls).to.deep.equal([{ _id: 'tag-1' }]);
    expect(wrapper.vm.sending).to.equal(true);
    expect(wrapper.vm.lifecycleTarget._id).to.equal('tag-1');
    wrapper.vm.clearLifecycleDialog();
    await wrapper.vm.deleteTag();
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

  it('削除API失敗時は対象を維持する', async () => {
    const apiError = new Error('failed');
    tagApi.floorTag.managementRemove = () => Promise.reject(apiError);
    const View = buildViewWithoutLifecycle(FloorTagManagement);
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
      floor: { title: 'Floor', delete_flg: false },
      delete_flg: true,
    });

    await wrapper.vm.deleteTag();

    expect(reloadCalls).to.have.lengthOf(0);
    expect(showErrorCalls).to.deep.equal([['削除に失敗しました', apiError]]);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.lifecycleTarget._id).to.equal('tag-2');
    expect(wrapper.vm.lifecycleDialogVisible).to.equal(true);
  });

  it('削除失敗時は削除の基本文言と対象を維持する', async () => {
    const apiError = new Error('failed');
    tagApi.floorTag.managementRemove = () => Promise.reject(apiError);
    const View = buildViewWithoutLifecycle(FloorTagManagement);
    const wrapper = shallowMount(View, createMountOptions());
    const showErrorCalls = [];
    wrapper.vm.$refs.listBase.showError = (...args) => showErrorCalls.push(args);
    wrapper.vm.showLifecycleDialog({
      _id: 'tag-active',
      name: 'Tag',
      floor: { title: 'Floor', delete_flg: false },
      delete_flg: false,
    });

    await wrapper.vm.deleteTag();

    expect(showErrorCalls).to.deep.equal([['削除に失敗しました', apiError]]);
    expect(wrapper.vm.lifecycleTarget._id).to.equal('tag-active');
    expect(wrapper.vm.lifecycleDialogVisible).to.equal(true);
  });
});
