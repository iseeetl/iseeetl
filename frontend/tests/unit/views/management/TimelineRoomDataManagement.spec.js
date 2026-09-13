import { h } from 'vue';
import { expect, vi } from 'vitest';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import { shallowMount } from '../../helpers/testUtils';
import TimelineRoomDataManagement from '@/views/management/TimelineRoomDataManagement.vue';
import chatApi from '@/api/chat';
import floorApi from '@/api/floor';
import roomApi from '@/api/room';
import { createMountOptions, buildViewWithoutLifecycle } from './helpers';

describe('ルームのタイムラインデータ管理画面', () => {
  let originalFloorManagementDetail;
  let originalRoomPaginate;
  let originalEstimate;
  let originalTimeline;
  let originalTimelineMedia;
  let originalCreateElement;
  let originalAppendChild;
  let originalCreateObjectURL;
  let originalRevokeObjectURL;

  const createWrapper = () => {
    const View = buildViewWithoutLifecycle(TimelineRoomDataManagement);
    return shallowMount(View, {
      ...createMountOptions(),
      props: { floorId: 'f1' },
    });
  };

  beforeEach(() => {
    originalFloorManagementDetail = floorApi.managementDetail;
    originalRoomPaginate = roomApi.managementPaginate;
    originalEstimate = chatApi.managementTimelineEstimate;
    originalTimeline = chatApi.managementTimeline;
    originalTimelineMedia = chatApi.managementTimelineMedia;
    originalCreateElement = document.createElement;
    originalAppendChild = document.body.appendChild;
    originalCreateObjectURL = window.URL.createObjectURL;
    originalRevokeObjectURL = window.URL.revokeObjectURL;
  });

  afterEach(() => {
    floorApi.managementDetail = originalFloorManagementDetail;
    roomApi.managementPaginate = originalRoomPaginate;
    chatApi.managementTimelineEstimate = originalEstimate;
    chatApi.managementTimeline = originalTimeline;
    chatApi.managementTimelineMedia = originalTimelineMedia;
    document.createElement = originalCreateElement;
    document.body.appendChild = originalAppendChild;
    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it.each([0, 100 * 1024 * 1024 - 1, 100 * 1024 * 1024])('概算%s バイトを確認してから取得し、100 MiB以上だけ警告する', async (bytes) => {
    chatApi.managementTimelineEstimate = vi.fn().mockResolvedValue({ data: { estimatedBytes: bytes } });
    chatApi.managementTimeline = vi.fn().mockResolvedValue({ data: [] });
    const wrapper = createWrapper();
    await wrapper.setData({ floor: { title: 'Floor' } });
    wrapper.vm.triggerDownload = vi.fn();
    await wrapper.vm.prepareDownload({ _id: 'r1', title: 'Room' }, 'json');
    expect(chatApi.managementTimeline).not.toHaveBeenCalled();
    const dialog = wrapper.findComponent(ConfirmDialog);
    expect(dialog.props('dialogVisible')).toBe(true);
    expect(dialog.find('[role="alert"]').exists()).toBe(bytes >= 100 * 1024 * 1024);
    expect(wrapper.vm.downloadConfirmation.estimatedBytes).toBe(bytes);
    expect(wrapper.vm.formatExportSize(bytes)).toContain(bytes ? 'MiB' : 'B');
    await dialog.vm.$emit('confirm');
    await Promise.resolve();
    expect(chatApi.managementTimeline).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('取消と概算失敗では本体を取得せず、再試行できる', async () => {
    chatApi.managementTimelineEstimate = vi.fn().mockRejectedValueOnce(new Error('estimate failed')).mockResolvedValue({ data: { estimatedBytes: 100 } });
    chatApi.managementTimelineMedia = vi.fn();
    const wrapper = createWrapper();
    wrapper.vm.showError = vi.fn();
    await wrapper.setData({ floor: { title: 'Floor' } });
    await wrapper.vm.prepareDownload({ _id: 'r1' }, 'media');
    expect(wrapper.vm.showError).toHaveBeenCalledOnce();
    expect(wrapper.vm.isDownloadDisabled({ _id: 'r1' })).toBe(false);
    await wrapper.vm.prepareDownload({ _id: 'r1' }, 'media');
    wrapper.findComponent(ConfirmDialog).vm.$emit('cancel');
    expect(wrapper.vm.downloadConfirmation).toBeNull();
    expect(chatApi.managementTimelineMedia).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('画面の対象フロア変更後に遅い概算応答が届いても確認を開かない', async () => {
    let resolve;
    chatApi.managementTimelineEstimate = () => new Promise((done) => { resolve = done; });
    const wrapper = createWrapper();
    await wrapper.setData({ floor: { title: 'Floor' } });
    const pending = wrapper.vm.prepareDownload({ _id: 'r1' }, 'json');
    await wrapper.setProps({ floorId: 'f2' });
    resolve({ data: { estimatedBytes: 100 } });
    await pending;
    expect(wrapper.vm.downloadConfirmation).toBeNull();
    wrapper.unmount();
  });

  it('ルーム一覧を選択フロアで絞り込むデータを組み立てる', async () => {
    const calls = [];
    roomApi.managementPaginate = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: { docs: [] } });
    };

    const wrapper = createWrapper();
    const payload = wrapper.vm.buildRoomPayload({ page: 3, search: 'Room' });
    await wrapper.vm.fetchRooms(payload);

    expect(payload).to.deep.equal({ page: 3, search: 'Room', floor_id: 'f1' });
    expect(calls).to.deep.equal([{ page: 3, search: 'Room', floor_id: 'f1' }]);
  });

  it('一覧は標準 tableの固定構造を使用する', () => {
    const item = {
      _id: 'room-1',
      title: 'Room',
      user: { username: 'owner' },
      member_only: false,
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
    const View = buildViewWithoutLifecycle(TimelineRoomDataManagement);
    const wrapper = shallowMount(View, {
      ...createMountOptions({
        stubs: {
          ManagementListBase: ManagementListBaseStub,
        },
      }),
      props: {
        floorId: 'f1',
      },
    });
    const table = wrapper.find('.management-table-scroll > table.management-table');
    const dataRow = table.find('tbody tr');

    expect(table.exists()).to.equal(true);
    expect(table.attributes('aria-label')).to.equal('ルーム一覧');
    expect(table.find('thead').exists()).to.equal(true);
    expect(table.find('tbody').exists()).to.equal(true);
    table.findAll('thead th').forEach((header) => {
      expect(header.attributes('scope')).to.equal('col');
    });
    expect(dataRow.attributes('role')).to.equal(undefined);
    expect(dataRow.attributes('tabindex')).to.equal(undefined);
  });

  it('削除済みルームもdanger状態を表示し、両ダウンロード操作を利用できる', async () => {
    const item = {
      _id: 'room-deleted',
      title: 'Deleted Room',
      user: { username: 'owner' },
      member_only: false,
      room_display_hidden: false,
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
    const View = buildViewWithoutLifecycle(TimelineRoomDataManagement);
    const wrapper = shallowMount(View, {
      ...createMountOptions({
        stubs: {
          ManagementListBase: ManagementListBaseStub,
        },
      }),
      props: { floorId: 'f1' },
    });
    await wrapper.setData({ floor: { _id: 'f1', title: 'Deleted Floor', delete_flg: true } });

    const badges = wrapper.findAllComponents({ name: 'ManagementStatusBadge' });
    const jsonButton = wrapper.find('[data-testid="timeline-json-room-deleted"]');
    const mediaButton = wrapper.find('[data-testid="timeline-media-room-deleted"]');

    expect(badges[0].props('tone')).to.equal('danger');
    expect(jsonButton.attributes('aria-label')).to.equal('managementUi.downloadJsonAria');
    expect(mediaButton.attributes('aria-label')).to.equal('managementUi.downloadMediaAria');
    expect(jsonButton.attributes('disabled')).to.equal('false');
    expect(mediaButton.attributes('disabled')).to.equal('false');
    expect(jsonButton.attributes('aria-describedby')).to.equal(undefined);
    expect(mediaButton.attributes('aria-describedby')).to.equal(undefined);
    expect(wrapper.find('#timeline-room-disabled-reason-room-deleted').exists()).to.equal(false);
  });

  it('管理用フロア詳細を取得して削除済みでも画面タイトルへ表示する', async () => {
    const calls = [];
    floorApi.managementDetail = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: { _id: 'f1', title: 'Floor A', delete_flg: true } });
    };

    const wrapper = createWrapper();
    await wrapper.vm.fetchFloor();

    expect(calls).to.deep.equal([{ _id: 'f1' }]);
    expect(wrapper.vm.floor).to.deep.equal({ _id: 'f1', title: 'Floor A', delete_flg: true });
    expect(wrapper.vm.pageTitle).to.equal('タイムラインデータ管理 - Floor A');
  });

  it('ルーム行からタイムラインJSONをダウンロードする', async () => {
    const calls = [];
    chatApi.managementTimeline = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: [{ _id: 'post1' }] });
    };

    const wrapper = createWrapper();
    await wrapper.setData({ floor: { _id: 'f1', title: 'Floor/A' } });

    const link = {
      href: '',
      download: '',
      parentNode: null,
      clicked: false,
      click() {
        this.clicked = true;
      },
    };
    let revokedUrl = null;
    document.createElement = () => link;
    document.body.appendChild = (node) => {
      node.parentNode = {
        removeChild() {
          node.parentNode = null;
        },
      };
      return node;
    };
    window.URL.createObjectURL = () => 'blob:timeline';
    window.URL.revokeObjectURL = (url) => {
      revokedUrl = url;
    };

    await wrapper.vm.downloadTimeline({ _id: 'r1', title: 'Room:A', delete_flg: false });

    expect(calls).to.deep.equal([{ floor_id: 'f1', room_id: 'r1' }]);
    expect(link.clicked).to.equal(true);
    expect(link.download).to.equal('Floor_A_Room_A_timeline.json');
    expect(revokedUrl).to.equal('blob:timeline');
    expect(wrapper.vm.downloadingKey).to.equal(null);
  });

  it('ルーム行からメディアZIPをダウンロードする', async () => {
    const calls = [];
    chatApi.managementTimelineMedia = (payload, options) => {
      calls.push({ payload, options });
      return Promise.resolve({ data: 'binary-data' });
    };

    const wrapper = createWrapper();
    await wrapper.setData({ floor: { _id: 'f1', title: 'Floor A' } });

    const link = {
      href: '',
      download: '',
      parentNode: null,
      clicked: false,
      click() {
        this.clicked = true;
      },
    };
    document.createElement = () => link;
    document.body.appendChild = (node) => {
      node.parentNode = {
        removeChild() {
          node.parentNode = null;
        },
      };
      return node;
    };
    window.URL.createObjectURL = () => 'blob:media';
    window.URL.revokeObjectURL = () => {};

    await wrapper.vm.downloadMedia({ _id: 'r1', title: 'Room A', delete_flg: false });

    expect(calls).to.deep.equal([
      {
        payload: { floor_id: 'f1', room_id: 'r1' },
        options: { responseType: 'blob' },
      },
    ]);
    expect(link.clicked).to.equal(true);
    expect(link.download).to.equal('Floor A_Room A_media.zip');
    expect(wrapper.vm.downloadingKey).to.equal(null);
  });

  it('フロア未取得時だけはダウンロードを開始しない', async () => {
    let calls = 0;
    chatApi.managementTimeline = () => {
      calls += 1;
      return Promise.resolve({ data: [] });
    };

    const wrapper = createWrapper();
    await wrapper.vm.downloadTimeline({ _id: 'r1', title: 'Room', delete_flg: false });

    expect(calls).to.equal(0);
  });

  it('削除済みフロア内の削除済みルームからもJSONを取得する', async () => {
    const calls = [];
    chatApi.managementTimeline = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: [] });
    };

    const wrapper = createWrapper();
    wrapper.vm.triggerDownload = () => {};
    await wrapper.setData({ floor: { _id: 'f1', title: 'Deleted Floor', delete_flg: true } });
    await wrapper.vm.downloadTimeline({ _id: 'r2', title: 'Deleted Room', delete_flg: true });

    expect(calls).to.deep.equal([{ floor_id: 'f1', room_id: 'r2' }]);
    expect(wrapper.vm.downloadingKey).to.equal(null);
  });

  it('ダウンロード失敗を一覧のスナックバーへ渡す', async () => {
    chatApi.managementTimeline = () => Promise.reject(new Error('failed'));

    const wrapper = createWrapper();
    const errors = [];
    Object.assign(wrapper.vm.$refs.listBase, {
      showError: (message, error) => errors.push({ message, error }),
    });
    await wrapper.setData({ floor: { _id: 'f1', title: 'Floor' } });
    await wrapper.vm.downloadTimeline({ _id: 'r1', title: 'Room', delete_flg: false });

    expect(errors).to.have.lengthOf(1);
    expect(errors[0].message).to.equal('タイムラインJSONの取得に失敗しました');
    expect(errors[0].error.message).to.equal('failed');
  });
});
