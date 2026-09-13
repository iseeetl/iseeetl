import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import { createMemoryHistory, createRouter as createVueRouter } from 'vue-router';
import quickTextAPI from '@/api/quickText';
import EditQuickTextGroupDialog from '@/components/quicktext/EditQuickTextGroupDialog.vue';

import flushPromises from '../../helpers/flushPromises';
import { quickTextDialogStubs } from './quickTextDialogStubs';

const createRouter = () => {
  const router = createVueRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/login', name: 'Login' }],
  });
  router.push = () => Promise.resolve();
  return router;
};

const createWrapper = (overrides = {}) =>
  shallowMount(EditQuickTextGroupDialog, {
    router: overrides.router || createRouter(),
    stubs: quickTextDialogStubs,
    props: {
      dialogVisible: true,
      propsGroup: { _id: 'g1', title: 'Group' },
      ...(overrides.props || {}),
    },
    mocks: {
      $store: { getters: { lang: 'ja', userToken: 'token' }, dispatch: () => {} },
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });

let originalCreate;
let originalUpdate;

describe('共通単語グループの編集', () => {
  beforeEach(() => {
    originalCreate = quickTextAPI.createGroup;
    originalUpdate = quickTextAPI.updateGroup;
  });

  afterEach(() => {
    quickTextAPI.createGroup = originalCreate;
    quickTextAPI.updateGroup = originalUpdate;
  });

  it('編集対象がある場合は updateGroup を呼ぶ', async () => {
    const calls = [];
    quickTextAPI.updateGroup = (token, payload) => {
      calls.push({ token, payload });
      return Promise.resolve();
    };
    const wrapper = createWrapper();
    wrapper.vm.openedDialog();
    await wrapper.vm.$nextTick();

    wrapper.setData({ title: 'Updated' });
    await wrapper.vm.$nextTick();

    await wrapper.vm.onDone();
    await flushPromises();

    expect(calls[0]).to.deep.equal({
      token: 'token',
      payload: { resource: 'management', id: 'g1', title: 'Updated', lang: 'ja' },
    });
    expect(wrapper.emitted().success).to.have.lengthOf(1);
  });

  it('編集対象がない場合は createGroup を呼ぶ', async () => {
    const calls = [];
    quickTextAPI.createGroup = (token, payload) => {
      calls.push({ token, payload });
      return Promise.resolve();
    };

    const wrapper = createWrapper({ props: { propsGroup: null } });
    wrapper.vm.openedDialog();
    await wrapper.vm.$nextTick();

    wrapper.setData({ title: 'New' });
    await wrapper.vm.$nextTick();

    await wrapper.vm.onDone();
    await flushPromises();

    expect(calls[0]).to.deep.equal({
      token: 'token',
      payload: { resource: 'management', title: 'New', lang: 'ja' },
    });
    expect(wrapper.emitted().success).to.have.lengthOf(1);
  });

  it('入力が不正な場合は API を呼ばない', async () => {
    let called = false;
    quickTextAPI.createGroup = () => {
      called = true;
      return Promise.resolve();
    };

    const wrapper = createWrapper({ props: { propsGroup: null } });
    wrapper.vm.openedDialog();
    await wrapper.vm.$nextTick();

    wrapper.setData({ title: '' });
    await wrapper.vm.$nextTick();

    await wrapper.vm.onDone();
    await flushPromises();

    expect(called).to.equal(false);
    expect(wrapper.emitted().success).to.equal(undefined);
  });

  it('openedDialog は propsGroup なしで値をリセットする', async () => {
    const wrapper = createWrapper({ props: { propsGroup: null } });
    wrapper.setData({ id: 'g1', title: 'Old' });
    wrapper.vm.v$.title.$touch();
    expect(wrapper.vm.v$.title.$dirty).to.equal(true);

    wrapper.vm.openedDialog();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.id).to.equal(null);
    expect(wrapper.vm.title).to.equal(null);
    expect(wrapper.vm.v$.title.$dirty).to.equal(false);
  });

  it('編集対象を保持し、変更済みのキャンセルで破棄確認を表示する', async () => {
    const wrapper = createWrapper();
    const discardDialog = wrapper.findComponent({ name: 'ConfirmDialog' });

    expect(wrapper.vm.targetName).to.equal('Group');
    wrapper.vm.openedDialog();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.targetName).to.equal('Group');
    expect(wrapper.vm.hasUnsavedChanges).to.equal(false);

    await wrapper.setData({ title: 'Changed' });
    wrapper.vm.onCancel();

    expect(wrapper.vm.visible).to.equal(true);
    expect(wrapper.vm.discardConfirmVisible).to.equal(true);

    wrapper.vm.cancelDiscard();
    expect(wrapper.vm.visible).to.equal(true);
    discardDialog.vm.$emit('closed');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.visible).to.equal(true);

    wrapper.vm.onCancel();
    wrapper.vm.confirmDiscard();
    expect(wrapper.vm.visible).to.equal(true);
    expect(wrapper.vm.discardConfirmVisible).to.equal(false);
    expect(wrapper.vm.closeAfterDiscardConfirmation).to.equal(true);

    discardDialog.vm.$emit('closed');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.visible).to.equal(false);
    expect(wrapper.vm.closeAfterDiscardConfirmation).to.equal(false);
  });

  it('作成と編集で確定操作を作成・保存に分ける', async () => {
    const editWrapper = createWrapper();
    const createWrapperInstance = createWrapper({ props: { propsGroup: null } });
    const target = editWrapper.findComponent({ name: 'DialogTargetContext' });

    expect(editWrapper.findComponent({ name: 'BaseEditDialog' }).props()).to.include({
      descriptionIds: 'quicktext-group-target-context',
      confirmLabel: '保存',
      actionsAdjacent: true,
    });
    expect(target.props()).to.deep.equal({
      contextId: 'quicktext-group-target-context',
      label: '単語グループ名',
      name: 'Group',
    });
    expect(createWrapperInstance.findComponent({ name: 'BaseEditDialog' }).props()).to.include({
      descriptionIds: '',
      confirmLabel: '作成',
      actionsAdjacent: true,
    });
    expect(createWrapperInstance.findComponent({ name: 'DialogTargetContext' }).exists()).to.equal(false);
  });

  it('closedDialog は close を通知する', async () => {
    const wrapper = createWrapper();
    wrapper.vm.closedDialog();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted().close).to.have.lengthOf(1);
  });

  it('保存で401エラー時はログアウトしてログイン画面へ遷移する', async () => {
    quickTextAPI.updateGroup = () => Promise.reject({ response: { status: 401 } });
    const dispatchCalls = [];
    const wrapper = createWrapper({
      mocks: {
        $store: { getters: { lang: 'ja', userToken: 'token' }, dispatch: (type) => dispatchCalls.push(type) },
      },
    });
    wrapper.vm.openedDialog();
    await wrapper.vm.$nextTick();
    wrapper.setData({ title: 'Updated' });
    await wrapper.vm.$nextTick();

    await wrapper.vm.onDone();
    await flushPromises();

    expect(dispatchCalls).to.include('doLogout');
  });
});
