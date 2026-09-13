import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import RoomMemberManagement from '@/views/management/RoomMemberManagement.vue';
import roomMemberApi from '@/api/roomMember';
import { createMountOptions, buildViewWithoutLifecycle } from './helpers';

import flushPromises from '../../helpers/flushPromises';

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

describe('ルームメンバーの管理画面', () => {
  let originalPaginate;
  let originalManagementDelete;

  beforeEach(() => {
    originalPaginate = roomMemberApi.managementPaginate;
    originalManagementDelete = roomMemberApi.managementDelete;
  });

  afterEach(() => {
    roomMemberApi.managementPaginate = originalPaginate;
    roomMemberApi.managementDelete = originalManagementDelete;
  });

  it('一覧表へ重複しないルームメンバー一覧ラベルを渡す', () => {
    const View = buildViewWithoutLifecycle(RoomMemberManagement);
    const wrapper = shallowMount(View, createMountOptions());

    expect(wrapper.findComponent({ name: 'ManagementListBase' }).props('tableLabel')).to.equal(
      'ルームメンバー一覧'
    );
  });

  it('ルームメンバー取得で管理APIを呼ぶ', async () => {
    const calls = [];
    roomMemberApi.managementPaginate = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: { docs: [], page: 1, pages: 1, total: 0 } });
    };

    const View = buildViewWithoutLifecycle(RoomMemberManagement);
    const wrapper = shallowMount(View, createMountOptions());
    await wrapper.vm.fetchRoomMember({ page: 1 });

    expect(calls[0]).to.deep.equal({ page: 1 });
  });

  it('削除ダイアログ表示で対象情報をセットし、対象ルームと対象ユーザを個別に渡す', async () => {
    const View = buildViewWithoutLifecycle(RoomMemberManagement);
    const wrapper = shallowMount(View, createMountOptions());
    const member = {
      _id: 'rm-1',
      room: { title: 'room-a' },
      user: { username: 'bob' },
    };

    wrapper.vm.showDeleteRoomMemberDialog(member);
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.deleteRoomMemberValue).to.deep.equal({
      dialogVisible: true,
      _id: 'rm-1',
      username: 'bob',
      roomTitle: 'room-a',
    });
    expect(wrapper.findComponent({ name: 'ManagementMemberDeleteDialog' }).props()).to.include({
      open: true,
      titleId: 'room-member-management-delete-dialog-title',
      title: 'ルームメンバー削除',
      resourceLabel: '対象ルーム',
      resourceName: 'room-a',
      userName: 'bob',
      message: '「room-a」からメンバー「bob」を削除します',
      testIdPrefix: 'management-room-member-delete',
    });
  });

  it('closeDeleteRoomMemberDialog で削除ダイアログ情報をクリアする', () => {
    const View = buildViewWithoutLifecycle(RoomMemberManagement);
    const wrapper = shallowMount(View, createMountOptions());
    wrapper.setData({
      deleteRoomMemberValue: {
        dialogVisible: true,
        _id: 'rm-1',
        username: 'bob',
        roomTitle: 'room-a',
      },
    });

    wrapper.vm.closeDeleteRoomMemberDialog();

    expect(wrapper.vm.deleteRoomMemberValue).to.deep.equal({
      dialogVisible: false,
      _id: null,
      username: null,
      roomTitle: null,
    });
  });

  it('deleteRoomMember は削除と reload の完了まで対象と処理中状態を維持する', async () => {
    const mutation = createDeferred();
    const reload = createDeferred();
    const deleteCalls = [];
    roomMemberApi.managementDelete = (payload) => {
      deleteCalls.push(payload);
      return mutation.promise;
    };

    let reloadCount = 0;
    const View = buildViewWithoutLifecycle(RoomMemberManagement);
    const wrapper = shallowMount(View, createMountOptions());
    Object.assign(wrapper.vm.$refs.listBase, {
      reload: () => {
        reloadCount += 1;
        return reload.promise;
      },
      showError: () => {},
    });
    wrapper.setData({
      deleteRoomMemberValue: {
        dialogVisible: true,
        _id: 'rm-1',
        username: 'bob',
        roomTitle: 'room-a',
      },
      sending: false,
    });
    await wrapper.vm.$nextTick();

    const request = wrapper.vm.deleteRoomMember();
    await wrapper.vm.$nextTick();

    const dialog = wrapper.findComponent({ name: 'ManagementMemberDeleteDialog' });
    expect(deleteCalls).to.deep.equal([{ _id: 'rm-1' }]);
    expect(wrapper.vm.sending).to.equal(true);
    expect(dialog.props()).to.include({ open: true, sending: true, resourceName: 'room-a', userName: 'bob' });

    wrapper.vm.closeDeleteRoomMemberDialog();
    wrapper.vm.deleteRoomMember();
    expect(deleteCalls).to.have.lengthOf(1);
    expect(wrapper.vm.deleteRoomMemberValue).to.deep.equal({
      dialogVisible: true,
      _id: 'rm-1',
      username: 'bob',
      roomTitle: 'room-a',
    });

    mutation.resolve();
    await flushPromises();

    expect(reloadCount).to.equal(1);
    expect(wrapper.vm.sending).to.equal(true);
    expect(wrapper.vm.deleteRoomMemberValue.dialogVisible).to.equal(true);

    wrapper.vm.closeDeleteRoomMemberDialog();
    wrapper.vm.deleteRoomMember();
    expect(deleteCalls).to.have.lengthOf(1);
    expect(wrapper.vm.deleteRoomMemberValue._id).to.equal('rm-1');

    reload.resolve();
    await request;
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.deleteRoomMemberValue).to.deep.equal({
      dialogVisible: false,
      _id: null,
      username: null,
      roomTitle: null,
    });
  });

  it('deleteRoomMember 失敗時は reload せず対象を維持して再操作できる', async () => {
    let deleteCount = 0;
    roomMemberApi.managementDelete = () => {
      deleteCount += 1;
      return Promise.reject(new Error('network'));
    };
    const errors = [];
    let reloadCount = 0;

    const View = buildViewWithoutLifecycle(RoomMemberManagement);
    const wrapper = shallowMount(View, createMountOptions());
    Object.assign(wrapper.vm.$refs.listBase, {
      reload: () => {
        reloadCount += 1;
      },
      showError: (message, error) => errors.push({ message, error }),
    });
    wrapper.setData({
      deleteRoomMemberValue: {
        dialogVisible: true,
        _id: 'rm-1',
        username: 'bob',
        roomTitle: 'room-a',
      },
      sending: false,
    });
    await wrapper.vm.$nextTick();

    await wrapper.vm.deleteRoomMember();

    expect(wrapper.vm.sending).to.equal(false);
    expect(reloadCount).to.equal(0);
    expect(wrapper.vm.deleteRoomMemberValue).to.deep.equal({
      dialogVisible: true,
      _id: 'rm-1',
      username: 'bob',
      roomTitle: 'room-a',
    });
    expect(errors).to.have.lengthOf(1);
    expect(errors[0].message).to.equal('ルームメンバーの削除に失敗しました');

    await wrapper.vm.deleteRoomMember();
    expect(deleteCount).to.equal(2);
  });

  it('deleteRoomMember 成功後の reload 失敗は削除エラーにせず処理を終了する', async () => {
    roomMemberApi.managementDelete = () => Promise.resolve();
    const errors = [];

    const View = buildViewWithoutLifecycle(RoomMemberManagement);
    const wrapper = shallowMount(View, createMountOptions());
    Object.assign(wrapper.vm.$refs.listBase, {
      reload: () => Promise.reject(new Error('reload failed')),
      showError: (message, error) => errors.push({ message, error }),
    });
    wrapper.setData({
      deleteRoomMemberValue: {
        dialogVisible: true,
        _id: 'rm-1',
        username: 'bob',
        roomTitle: 'room-a',
      },
    });
    await wrapper.vm.$nextTick();

    await wrapper.vm.deleteRoomMember();

    expect(errors).to.have.lengthOf(0);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.deleteRoomMemberValue).to.deep.equal({
      dialogVisible: false,
      _id: null,
      username: null,
      roomTitle: null,
    });
  });
});
