import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import FloorMemberManagement from '@/views/management/FloorMemberManagement.vue';
import floorMemberApi from '@/api/floorMember';
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

describe('フロアメンバーの管理画面', () => {
  let originalPaginate;
  let originalManagementDelete;

  beforeEach(() => {
    originalPaginate = floorMemberApi.managementPaginate;
    originalManagementDelete = floorMemberApi.managementDelete;
  });

  afterEach(() => {
    floorMemberApi.managementPaginate = originalPaginate;
    floorMemberApi.managementDelete = originalManagementDelete;
  });

  it('一覧表へ重複しないフロアメンバー一覧ラベルを渡す', () => {
    const View = buildViewWithoutLifecycle(FloorMemberManagement);
    const wrapper = shallowMount(View, createMountOptions());

    expect(wrapper.findComponent({ name: 'ManagementListBase' }).props('tableLabel')).to.equal(
      'フロアメンバー一覧'
    );
  });

  it('フロアメンバー取得で管理APIを呼ぶ', async () => {
    const calls = [];
    floorMemberApi.managementPaginate = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: { docs: [], page: 1, pages: 1, total: 0 } });
    };

    const View = buildViewWithoutLifecycle(FloorMemberManagement);
    const wrapper = shallowMount(View, createMountOptions());
    await wrapper.vm.fetchFloorMember({ page: 1 });

    expect(calls[0]).to.deep.equal({ page: 1 });
  });

  it('削除ダイアログ表示で対象情報をセットし、対象フロアと対象ユーザを個別に渡す', async () => {
    const View = buildViewWithoutLifecycle(FloorMemberManagement);
    const wrapper = shallowMount(View, createMountOptions());
    const member = {
      _id: 'fm-1',
      floor: { _id: 'floor-1', title: '1F' },
      user: { username: 'alice' },
    };

    wrapper.vm.showDeleteFloorMemberDialog(member);
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.deleteFloorMemberValue).to.deep.equal({
      dialogVisible: true,
      _id: 'fm-1',
      username: 'alice',
      floorTitle: '1F',
    });
    expect(wrapper.findComponent({ name: 'ManagementMemberDeleteDialog' }).props()).to.include({
      open: true,
      titleId: 'floor-member-management-delete-dialog-title',
      title: 'フロアメンバー削除',
      resourceLabel: '対象フロア',
      resourceName: '1F',
      userName: 'alice',
      message: '「1F」からメンバー「alice」を削除します',
      testIdPrefix: 'management-floor-member-delete',
    });
  });

  it('closeDeleteFloorMemberDialog で削除ダイアログ情報をクリアする', () => {
    const View = buildViewWithoutLifecycle(FloorMemberManagement);
    const wrapper = shallowMount(View, createMountOptions());
    wrapper.setData({
      deleteFloorMemberValue: {
        dialogVisible: true,
        _id: 'fm-1',
        username: 'alice',
        floorTitle: '1F',
      },
    });

    wrapper.vm.closeDeleteFloorMemberDialog();

    expect(wrapper.vm.deleteFloorMemberValue).to.deep.equal({
      dialogVisible: false,
      _id: null,
      username: null,
      floorTitle: null,
    });
  });

  it('親フロア参照が欠損していても管理削除ダイアログを開ける', () => {
    const View = buildViewWithoutLifecycle(FloorMemberManagement);
    const wrapper = shallowMount(View, createMountOptions());

    wrapper.vm.showDeleteFloorMemberDialog({
      _id: 'fm-orphan',
      floor: null,
      user: { username: 'alice' },
    });

    expect(wrapper.vm.deleteFloorMemberValue).to.deep.equal({
      dialogVisible: true,
      _id: 'fm-orphan',
      username: 'alice',
      floorTitle: 'managementUi.referenceUnavailable',
    });
  });

  it('deleteFloorMember は削除と reload の完了まで対象と処理中状態を維持する', async () => {
    const mutation = createDeferred();
    const reload = createDeferred();
    const managementDeleteCalls = [];
    floorMemberApi.managementDelete = (payload) => {
      managementDeleteCalls.push(payload);
      return mutation.promise;
    };

    let reloadCount = 0;
    const View = buildViewWithoutLifecycle(FloorMemberManagement);
    const wrapper = shallowMount(View, createMountOptions());
    Object.assign(wrapper.vm.$refs.listBase, {
      reload: () => {
        reloadCount += 1;
        return reload.promise;
      },
      showError: () => {},
    });
    wrapper.setData({
      deleteFloorMemberValue: {
        dialogVisible: true,
        _id: 'fm-1',
        username: 'alice',
        floorTitle: '1F',
      },
      sending: false,
    });
    await wrapper.vm.$nextTick();

    const request = wrapper.vm.deleteFloorMember();
    await wrapper.vm.$nextTick();

    const dialog = wrapper.findComponent({ name: 'ManagementMemberDeleteDialog' });
    expect(managementDeleteCalls).to.deep.equal([{ _id: 'fm-1' }]);
    expect(wrapper.vm.sending).to.equal(true);
    expect(dialog.props()).to.include({ open: true, sending: true, resourceName: '1F', userName: 'alice' });

    wrapper.vm.closeDeleteFloorMemberDialog();
    wrapper.vm.deleteFloorMember();
    expect(managementDeleteCalls).to.have.lengthOf(1);
    expect(wrapper.vm.deleteFloorMemberValue).to.deep.equal({
      dialogVisible: true,
      _id: 'fm-1',
      username: 'alice',
      floorTitle: '1F',
    });

    mutation.resolve();
    await flushPromises();

    expect(reloadCount).to.equal(1);
    expect(wrapper.vm.sending).to.equal(true);
    expect(wrapper.vm.deleteFloorMemberValue.dialogVisible).to.equal(true);

    wrapper.vm.closeDeleteFloorMemberDialog();
    wrapper.vm.deleteFloorMember();
    expect(managementDeleteCalls).to.have.lengthOf(1);
    expect(wrapper.vm.deleteFloorMemberValue._id).to.equal('fm-1');

    reload.resolve();
    await request;
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.deleteFloorMemberValue).to.deep.equal({
      dialogVisible: false,
      _id: null,
      username: null,
      floorTitle: null,
    });
  });

  it('deleteFloorMember 失敗時は reload せず対象を維持して再操作できる', async () => {
    let managementDeleteCount = 0;
    floorMemberApi.managementDelete = () => {
      managementDeleteCount += 1;
      return Promise.reject(new Error('network'));
    };
    const errors = [];
    let reloadCount = 0;

    const View = buildViewWithoutLifecycle(FloorMemberManagement);
    const wrapper = shallowMount(View, createMountOptions());
    Object.assign(wrapper.vm.$refs.listBase, {
      reload: () => {
        reloadCount += 1;
      },
      showError: (message, error) => errors.push({ message, error }),
    });
    wrapper.setData({
      deleteFloorMemberValue: {
        dialogVisible: true,
        _id: 'fm-1',
        username: 'alice',
        floorTitle: '1F',
      },
      sending: false,
    });
    await wrapper.vm.$nextTick();

    await wrapper.vm.deleteFloorMember();

    expect(wrapper.vm.sending).to.equal(false);
    expect(reloadCount).to.equal(0);
    expect(wrapper.vm.deleteFloorMemberValue).to.deep.equal({
      dialogVisible: true,
      _id: 'fm-1',
      username: 'alice',
      floorTitle: '1F',
    });
    expect(errors).to.have.lengthOf(1);
    expect(errors[0].message).to.equal('フロアメンバーの削除に失敗しました');

    await wrapper.vm.deleteFloorMember();
    expect(managementDeleteCount).to.equal(2);
  });

  it('deleteFloorMember 成功後の reload 失敗は削除エラーにせず処理を終了する', async () => {
    floorMemberApi.managementDelete = () => Promise.resolve();
    const errors = [];

    const View = buildViewWithoutLifecycle(FloorMemberManagement);
    const wrapper = shallowMount(View, createMountOptions());
    Object.assign(wrapper.vm.$refs.listBase, {
      reload: () => Promise.reject(new Error('reload failed')),
      showError: (message, error) => errors.push({ message, error }),
    });
    wrapper.setData({
      deleteFloorMemberValue: {
        dialogVisible: true,
        _id: 'fm-1',
        username: 'alice',
        floorTitle: '1F',
      },
    });
    await wrapper.vm.$nextTick();

    await wrapper.vm.deleteFloorMember();

    expect(errors).to.have.lengthOf(0);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.deleteFloorMemberValue).to.deep.equal({
      dialogVisible: false,
      _id: null,
      username: null,
      floorTitle: null,
    });
  });
});
