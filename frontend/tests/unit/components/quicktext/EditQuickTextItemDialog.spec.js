import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import { createMemoryHistory, createRouter as createVueRouter } from 'vue-router';
import quickTextAPI from '@/api/quickText';
import EditQuickTextItemDialog from '@/components/quicktext/EditQuickTextItemDialog.vue';

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
  shallowMount(EditQuickTextItemDialog, {
    router: overrides.router || createRouter(),
    stubs: quickTextDialogStubs,
    props: {
      dialogVisible: true,
      propsItem: { _id: 'i1', label: 'Item' },
      group: { _id: 'g1', title: 'Group' },
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

describe('共通単語の編集', () => {
  beforeEach(() => {
    originalCreate = quickTextAPI.createItem;
    originalUpdate = quickTextAPI.updateItem;
  });

  afterEach(() => {
    quickTextAPI.createItem = originalCreate;
    quickTextAPI.updateItem = originalUpdate;
  });

  it('編集対象がある場合は updateItem を呼ぶ', async () => {
    const calls = [];
    quickTextAPI.updateItem = (token, payload) => {
      calls.push({ token, payload });
      return Promise.resolve();
    };

    const wrapper = createWrapper();
    wrapper.vm.openedDialog();
    await wrapper.vm.$nextTick();

    wrapper.setData({ label: 'Updated' });
    await wrapper.vm.$nextTick();

    await wrapper.vm.onDone();
    await flushPromises();

    expect(calls[0]).to.deep.equal({
      token: 'token',
      payload: { resource: 'management', id: 'i1', label: 'Updated', lang: 'ja' },
    });
    expect(wrapper.emitted().success).to.have.lengthOf(1);
  });

  it('編集対象がない場合は createItem を呼ぶ', async () => {
    const calls = [];
    quickTextAPI.createItem = (token, payload) => {
      calls.push({ token, payload });
      return Promise.resolve();
    };

    const wrapper = createWrapper({ props: { propsItem: null } });
    wrapper.vm.openedDialog();
    await wrapper.vm.$nextTick();

    wrapper.setData({ label: 'New' });
    await wrapper.vm.$nextTick();

    await wrapper.vm.onDone();
    await flushPromises();

    expect(calls[0]).to.deep.equal({
      token: 'token',
      payload: { resource: 'management', groupId: 'g1', label: 'New', lang: 'ja' },
    });
    expect(wrapper.emitted().success).to.have.lengthOf(1);
  });

  it('入力が不正な場合は API を呼ばない', async () => {
    let called = false;
    quickTextAPI.createItem = () => {
      called = true;
      return Promise.resolve();
    };

    const wrapper = createWrapper({ props: { propsItem: null } });
    wrapper.vm.openedDialog();
    await wrapper.vm.$nextTick();

    wrapper.setData({ label: '' });
    await wrapper.vm.$nextTick();

    await wrapper.vm.onDone();
    await flushPromises();

    expect(called).to.equal(false);
    expect(wrapper.emitted().success).to.equal(undefined);
  });

  it('openedDialog は propsItem なしで値をリセットする', async () => {
    const wrapper = createWrapper({ props: { propsItem: null } });
    wrapper.setData({ id: 'i1', label: 'Old' });
    wrapper.vm.v$.label.$touch();
    expect(wrapper.vm.v$.label.$dirty).to.equal(true);

    wrapper.vm.openedDialog();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.id).to.equal(null);
    expect(wrapper.vm.label).to.equal(null);
    expect(wrapper.vm.v$.label.$dirty).to.equal(false);
  });

  it('所属グループと編集対象を保持し、変更済みのキャンセルで破棄確認を表示する', async () => {
    const wrapper = createWrapper({
      props: {
        group: { _id: 'g1', title: 'Group' },
      },
    });
    const discardDialog = wrapper.findComponent({ name: 'ConfirmDialog' });

    expect(wrapper.vm.targetName).to.equal('Item');
    wrapper.vm.openedDialog();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.targetName).to.equal('Item');
    expect(wrapper.vm.hasUnsavedChanges).to.equal(false);

    await wrapper.setData({ label: 'Changed' });
    wrapper.vm.onCancel();

    expect(wrapper.vm.visible).to.equal(true);
    expect(wrapper.vm.discardConfirmVisible).to.equal(true);

    wrapper.vm.cancelDiscard();
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

  it('作成と編集で確定操作を作成・保存に分ける', () => {
    const editWrapper = createWrapper();
    const createWrapperInstance = createWrapper({ props: { propsItem: null } });
    const contexts = editWrapper.findAllComponents({ name: 'DialogTargetContext' });

    expect(editWrapper.findComponent({ name: 'BaseEditDialog' }).props()).to.include({
      descriptionIds: 'quicktext-item-group-context quicktext-item-target-context',
      confirmLabel: '保存',
      actionsAdjacent: true,
    });
    expect(contexts.map((context) => context.props())).to.deep.equal([
      { contextId: 'quicktext-item-group-context', label: '単語グループ名', name: 'Group' },
      { contextId: 'quicktext-item-target-context', label: '名称', name: 'Item' },
    ]);
    expect(createWrapperInstance.findComponent({ name: 'BaseEditDialog' }).props()).to.include({
      descriptionIds: 'quicktext-item-group-context',
      confirmLabel: '作成',
      actionsAdjacent: true,
    });
  });

  it('closedDialog は close を通知する', async () => {
    const wrapper = createWrapper();
    wrapper.vm.closedDialog();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted().close).to.have.lengthOf(1);
  });

  it('保存で401エラー時はログアウトしてログイン画面へ遷移する', async () => {
    quickTextAPI.updateItem = () => Promise.reject({ response: { status: 401 } });
    const dispatchCalls = [];
    const wrapper = createWrapper({
      mocks: {
        $store: { getters: { lang: 'ja', userToken: 'token' }, dispatch: (type) => dispatchCalls.push(type) },
      },
    });
    wrapper.vm.openedDialog();
    await wrapper.vm.$nextTick();
    wrapper.setData({ label: 'Updated' });
    await wrapper.vm.$nextTick();

    await wrapper.vm.onDone();
    await flushPromises();

    expect(dispatchCalls).to.include('doLogout');
  });
});
