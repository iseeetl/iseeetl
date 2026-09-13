import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import FloorManagement from '@/views/management/FloorManagement.vue';
import floorApi from '@/api/floor';
import flushPromises from '../../helpers/flushPromises';
import { createMountOptions, buildViewWithoutLifecycle } from './helpers';

const createFloor = (overrides = {}) => ({
  _id: 'floor-1',
  title: 'Floor',
  description: 'Description',
  image_name: null,
  floor_display_hidden: false,
  delete_flg: false,
  lang: 'ja',
  target_langs: [],
  translations: [],
  user: { username: 'owner' },
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: null,
  deleted_at: null,
  ...overrides,
});

const createListStub = (items) => ({
  name: 'ManagementListBase',
  props: ['title', 'tableLabel', 'payloadBuilder'],
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
  const View = buildViewWithoutLifecycle(FloorManagement);
  return shallowMount(View, createMountOptions(overrides));
};

describe('フロアの管理画面', () => {
  let originalPaginate;
  let originalSetDeleteState;

  beforeEach(() => {
    originalPaginate = floorApi.managementPaginate;
    originalSetDeleteState = floorApi.managementSetDeleteState;
  });

  afterEach(() => {
    floorApi.managementPaginate = originalPaginate;
    floorApi.managementSetDeleteState = originalSetDeleteState;
  });

  it('更新成功後に一覧を再読み込みする', () => {
    const wrapper = createWrapper();
    let reloadCount = 0;
    Object.assign(wrapper.vm.$refs.listBase, {
      reload: () => {
        reloadCount += 1;
      },
    });

    wrapper.vm.editFloorValue.dialogVisible = true;
    wrapper.vm.successEditFloor();

    expect(reloadCount).to.equal(1);
    expect(wrapper.vm.editFloorValue.dialogVisible).to.equal(false);
  });

  it('fetchFloorsは管理APIを呼ぶ', async () => {
    const calls = [];
    floorApi.managementPaginate = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: {} });
    };
    const wrapper = createWrapper();

    await wrapper.vm.fetchFloors({ page: 2, search: 'word', delete_flg: false });

    expect(calls[0]).to.deep.equal({ page: 2, search: 'word', delete_flg: false });
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

  it('データの状態と表示設定をバッジで示し、行全体を操作対象にしない', async () => {
    const wrapper = createWrapper({
      stubs: {
        ManagementListBase: createListStub([
          createFloor(),
          createFloor({
            _id: 'floor-2',
            title: 'Deleted floor',
            delete_flg: true,
            floor_display_hidden: true,
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
    ]);
    expect(rows[1].findAll('.status-badge').map((badge) => badge.text())).to.deep.equal([
      'managementUi.statusDeleted',
      'managementUi.statusHidden',
    ]);

    await rows[0].trigger('click');
    expect(wrapper.vm.editFloorValue.dialogVisible).to.equal(false);
  });

  it('有効フロアだけを編集でき、管理編集では論理削除入力要素を隠す', async () => {
    const EditFloorDialogStub = {
      name: 'EditFloorDialog',
      props: ['dialogVisible', 'propsFloor', 'managementMode', 'showLifecycleControl'],
      template: '<div />',
    };
    const wrapper = createWrapper({ stubs: { EditFloorDialog: EditFloorDialogStub } });
    const deletedFloor = createFloor({ delete_flg: true });

    wrapper.vm.showEditFloorDialog(deletedFloor);
    expect(wrapper.vm.editFloorValue.dialogVisible).to.equal(false);

    wrapper.vm.showEditFloorDialog(createFloor());
    await wrapper.vm.$nextTick();

    const dialog = wrapper.findComponent({ name: 'EditFloorDialog' });
    expect(dialog.props()).to.include({
      dialogVisible: true,
      managementMode: true,
      showLifecycleControl: false,
    });
    expect(dialog.props('propsFloor')._id).to.equal('floor-1');
  });

  it('削除処理中は対象を維持し、成功後に一覧を更新して閉じる', async () => {
    let resolveRequest;
    const apiCalls = [];
    floorApi.managementSetDeleteState = (payload) => {
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
    const target = createFloor();
    wrapper.vm.showLifecycleDialog(target);

    const request = wrapper.vm.setDeleteState('delete');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.sending).to.equal(true);
    wrapper.vm.clearLifecycleDialog();
    expect(wrapper.vm.lifecycleTarget).to.deep.equal(target);

    resolveRequest({ data: {} });
    await request;

    expect(apiCalls).to.deep.equal([{ _id: 'floor-1', delete_flg: true }]);
    expect(reloadCount).to.equal(1);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.lifecycleDialogVisible).to.equal(false);
    expect(wrapper.vm.lifecycleTarget).to.deep.equal(target);
    wrapper.vm.handleLifecycleDialogClosed();
    expect(wrapper.vm.lifecycleTarget).to.equal(null);
  });

  it('削除状態更新に失敗した場合は対象を維持して再試行可能にする', async () => {
    const error = new Error('failed');
    floorApi.managementSetDeleteState = () => Promise.reject(error);
    const wrapper = createWrapper();
    const shownErrors = [];
    Object.assign(wrapper.vm.$refs.listBase, {
      showError: (...args) => shownErrors.push(args),
    });
    const target = createFloor({ delete_flg: true });
    wrapper.vm.showLifecycleDialog(target);

    await wrapper.vm.setDeleteState('restore');
    await flushPromises();

    expect(shownErrors).to.deep.equal([['復元に失敗しました', error]]);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.lifecycleDialogVisible).to.equal(true);
    expect(wrapper.vm.lifecycleTarget).to.deep.equal(target);

    const activeTarget = createFloor();
    wrapper.vm.showLifecycleDialog(activeTarget);
    await wrapper.vm.setDeleteState('delete');

    expect(shownErrors).to.deep.equal([
      ['復元に失敗しました', error],
      ['削除に失敗しました', error],
    ]);
  });
});
