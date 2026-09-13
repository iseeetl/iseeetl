import { h } from 'vue';
import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import TimelineDataManagement from '@/views/management/TimelineDataManagement.vue';
import floorApi from '@/api/floor';
import { createMountOptions, buildViewWithoutLifecycle } from './helpers';

describe('タイムラインデータの管理画面', () => {
  let originalFloorPaginate;

  beforeEach(() => {
    originalFloorPaginate = floorApi.managementPaginate;
  });

  afterEach(() => {
    floorApi.managementPaginate = originalFloorPaginate;
  });

  it('フロア管理と同じ検索付き一覧設定を使用する', () => {
    const View = buildViewWithoutLifecycle(TimelineDataManagement);
    const wrapper = shallowMount(View, createMountOptions());

    const listBase = wrapper.findComponent({ name: 'ManagementListBase' });
    expect(listBase.exists()).to.equal(true);
    expect(listBase.props('title')).to.equal('タイムラインデータ管理');
    expect(listBase.props('tableLabel')).to.equal('フロア一覧');
    expect(listBase.props('errorMessage')).to.equal('フロアの取得に失敗しました');
    expect(listBase.props('searchEnabled')).to.equal(true);
    expect(listBase.props('searchMinLength')).to.equal(2);
    expect(listBase.props('searchMaxLength')).to.equal(10);
  });

  it('一覧は標準 tableの固定構造を使用する', () => {
    const item = {
      _id: 'floor-1',
      title: 'Floor',
      user: { username: 'owner' },
      delete_flg: false,
      created_at: '2026-07-27T00:00:00.000Z',
      updated_at: null,
      deleted_at: null,
    };
    const ManagementListBaseStub = {
      name: 'ManagementListBase',
      props: ['tableLabel'],
      setup(props, { slots }) {
        return () =>
          h(
            'div',
            slots.table?.({
              items: [item],
              fetching: false,
              tableAttrs: { 'aria-label': props.tableLabel },
            })
          );
      },
    };
    const View = buildViewWithoutLifecycle(TimelineDataManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({
        stubs: {
          ManagementListBase: ManagementListBaseStub,
        },
      })
    );
    const table = wrapper.find('.management-table-scroll > table.management-table');
    const dataRow = table.find('tbody tr');

    expect(table.exists()).to.equal(true);
    expect(table.attributes('aria-label')).to.equal('フロア一覧');
    expect(table.find('thead').exists()).to.equal(true);
    expect(table.find('tbody').exists()).to.equal(true);
    table.findAll('thead th').forEach((header) => {
      expect(header.attributes('scope')).to.equal('col');
    });
    expect(dataRow.attributes('role')).to.equal(undefined);
    expect(dataRow.attributes('tabindex')).to.equal(undefined);
  });

  it('削除済みフロアもdanger状態を表示し、ルーム一覧を選択できる', () => {
    const item = {
      _id: 'floor-deleted',
      title: 'Deleted Floor',
      user: { username: 'owner' },
      floor_display_hidden: false,
      delete_flg: true,
      created_at: '2026-07-27T00:00:00.000Z',
      updated_at: null,
      deleted_at: '2026-07-28T00:00:00.000Z',
    };
    const ManagementListBaseStub = {
      name: 'ManagementListBase',
      setup(props, { slots }) {
        return () => h('div', slots.table?.({ items: [item], fetching: false, tableAttrs: {} }));
      },
    };
    const View = buildViewWithoutLifecycle(TimelineDataManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({
        stubs: {
          ManagementListBase: ManagementListBaseStub,
        },
      })
    );

    const badges = wrapper.findAllComponents({ name: 'ManagementStatusBadge' });
    const button = wrapper.find('[data-testid="timeline-floor-rooms-floor-deleted"]');

    expect(badges[0].props('tone')).to.equal('danger');
    expect(button.attributes('aria-label')).to.equal('managementUi.showRoomsAria');
    expect(button.attributes('disabled')).to.equal('false');
    expect(button.attributes('aria-describedby')).to.equal(undefined);
    expect(wrapper.find('#timeline-floor-disabled-reason-floor-deleted').exists()).to.equal(false);
  });

  it('fetchFloors は管理用フロアページングAPIを呼ぶ', async () => {
    const calls = [];
    floorApi.managementPaginate = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: { docs: [] } });
    };

    const View = buildViewWithoutLifecycle(TimelineDataManagement);
    const wrapper = shallowMount(View, createMountOptions());
    await wrapper.vm.fetchFloors({ page: 2, search: 'Floor' });

    expect(calls).to.deep.equal([{ page: 2, search: 'Floor' }]);
  });

  it('有効なフロアからルーム一覧へ遷移する', () => {
    const View = buildViewWithoutLifecycle(TimelineDataManagement);
    const wrapper = shallowMount(View, createMountOptions());
    const calls = [];
    wrapper.vm.$router.push = (location) => calls.push(location);

    wrapper.vm.showRooms({ _id: 'f1', title: 'Floor', delete_flg: false });

    expect(calls).to.deep.equal([
      {
        name: 'TimelineRoomDataManagement',
        params: { floorId: 'f1' },
      },
    ]);
  });

  it('削除済みフロアからもデータ回収用のルーム一覧へ遷移する', () => {
    const View = buildViewWithoutLifecycle(TimelineDataManagement);
    const wrapper = shallowMount(View, createMountOptions());
    const calls = [];
    wrapper.vm.$router.push = (location) => calls.push(location);

    wrapper.vm.showRooms({ _id: 'f1', title: 'Floor', delete_flg: true });

    expect(calls).to.deep.equal([
      {
        name: 'TimelineRoomDataManagement',
        params: { floorId: 'f1' },
      },
    ]);
  });
});
