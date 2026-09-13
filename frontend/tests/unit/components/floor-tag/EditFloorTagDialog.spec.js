import { expect, vi } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import tagApi from '@/api/tag';
import EditFloorTagDialog from '@/components/floor-tag/EditFloorTagDialog.vue';


import flushPromises from '../../helpers/flushPromises';

const BaseEditDialogStub = {
  name: 'BaseEditDialog',
  props: ['confirmLabel', 'titleText', 'descriptionIds', 'actionsAdjacent', 'initialFocus'],
  template: '<div><slot/></div>',
};

const baseStubs = {
  BaseEditDialog: BaseEditDialogStub,
};

const createStoreMock = (overrides = {}) => ({
  getters: {
    lang: 'ja',
    floorId: 'floor-1',
    ...(overrides.getters || {}),
  },
  dispatch: overrides.dispatch || (() => {}),
});

const createWrapper = (overrides = {}) =>
  shallowMount(EditFloorTagDialog, {
    stubs: { ...baseStubs, ...(overrides.stubs || {}) },
    props: {
      dialogVisible: true,
      floorTag: { _id: 'tag-1' },
      managementMode: false,
      ...(overrides.props || {}),
    },
    mocks: {
      $store: overrides.store || createStoreMock(),
      $router: { push: () => {} },
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });

describe('フロアタグの編集', () => {
  it('通常・管理モードのタグ名入力に計測用の名称案内を表示しない', () => {
    [false, true].forEach((managementMode) => {
      const wrapper = createWrapper({ props: { managementMode } });

      expect(wrapper.findComponent({ name: 'AnalyticsResourceNotice' }).exists()).to.equal(false);
    });
  });

  it('タグ名の入力前はエラーを表示せず、入力後の空欄に必須エラーを表示する', () => {
    const wrapper = createWrapper();

    expect(wrapper.vm.nameError).to.equal('');
    wrapper.vm.v$.name.$touch();

    expect(wrapper.vm.nameError).to.equal('必須');
  });

  it('通常・管理モードとも削除状態の入力を表示しない', () => {
    const defaultManagement = createWrapper({ props: { managementMode: true } });
    expect(defaultManagement.find('#delete_flg').exists()).to.equal(false);
    expect(defaultManagement.findComponent(BaseEditDialogStub).props('confirmLabel')).to.equal('managementUi.save');

    const hiddenManagement = createWrapper({
      props: { managementMode: true },
    });
    expect(hiddenManagement.find('#delete_flg').exists()).to.equal(false);
    expect(hiddenManagement.findComponent(BaseEditDialogStub).props('confirmLabel')).to.equal('managementUi.save');

    const normal = createWrapper({ props: { managementMode: false } });
    expect(normal.find('#delete_flg').exists()).to.equal(false);
    expect(normal.findComponent(BaseEditDialogStub).props('confirmLabel')).to.equal('OK');
  });

  it('管理編集では一覧の対象名、明確なタイトル、隣接操作を表示する', () => {
    const wrapper = createWrapper({
      props: {
        managementMode: true,
        floorTag: { _id: 'tag-1', name: '保存済みタグ' },
        floorName: '翻訳済みフロア',
        tagName: '保存済みタグ',
      },
    });
    const dialog = wrapper.findComponent(BaseEditDialogStub);
    const contexts = wrapper.findAllComponents({ name: 'DialogTargetContext' });

    expect(dialog.props()).to.include({
      titleText: 'フロアタグを編集',
      descriptionIds: 'edit-floor-tag-floor-context edit-floor-tag-tag-context',
      actionsAdjacent: true,
      initialFocus: '#tag_order',
    });
    expect(contexts.map((context) => context.props())).to.deep.include.members([
      { contextId: 'edit-floor-tag-floor-context', label: '対象フロア', name: '翻訳済みフロア' },
      { contextId: 'edit-floor-tag-tag-context', label: '対象タグ', name: '保存済みタグ' },
    ]);
  });

  it('管理編集を変更後に閉じる場合だけ破棄確認し、取消と破棄を処理する', async () => {
    const wrapper = createWrapper({
      props: {
        managementMode: true,
        floorTag: { _id: 'tag-1', order: 1, name: '保存済みタグ', delete_flg: false },
      },
    });
    wrapper.vm.openedDialog();

    wrapper.vm.onPressCancelButton();
    expect(wrapper.vm.visible).to.equal(false);
    expect(wrapper.vm.discardConfirmVisible).to.equal(false);

    await wrapper.setData({ visible: true, name: '変更後' });
    wrapper.vm.onPressCancelButton();
    expect(wrapper.vm.visible).to.equal(true);
    expect(wrapper.vm.discardConfirmVisible).to.equal(true);

    wrapper.vm.cancelDiscardChanges();
    expect(wrapper.vm.visible).to.equal(true);
    expect(wrapper.vm.discardConfirmVisible).to.equal(false);

    wrapper.vm.onPressCancelButton();
    wrapper.vm.confirmDiscardChanges();
    expect(wrapper.vm.visible).to.equal(true);
    expect(wrapper.vm.discardClosePending).to.equal(true);
    wrapper.vm.handleDiscardConfirmationClosed();
    expect(wrapper.vm.visible).to.equal(false);
    expect(wrapper.vm.discardConfirmVisible).to.equal(false);
  });

  let originalCreate;
  let originalUpdate;

  beforeEach(() => {
    originalCreate = tagApi.floorTag.create;
    originalUpdate = tagApi.floorTag.update;
  });

  afterEach(() => {
    tagApi.floorTag.create = originalCreate;
    tagApi.floorTag.update = originalUpdate;
  });

  it('管理一覧では削除入力要素を隠し、編集項目だけを送って更新APIを呼ぶ', async () => {
    const apiCalls = [];
    tagApi.floorTag.update = (payload, options, config) => {
      apiCalls.push({ payload, options, config });
      return Promise.resolve({ data: {} });
    };

    const wrapper = createWrapper({
      props: {
        dialogVisible: true,
        floorTag: { _id: 'tag-1', lang: 'ja', delete_flg: true },
        managementMode: true,
      },
    });

    wrapper.vm.openedDialog();
    wrapper.setData({ name: 'tag', order: 5 });
    await wrapper.vm.$nextTick();

    expect(wrapper.find('#delete_flg').exists()).to.equal(false);

    wrapper.vm.onPressDoneButton();
    await flushPromises();

    expect(apiCalls).to.have.lengthOf(1);
    expect(apiCalls[0].payload).to.deep.equal({
      _id: 'tag-1',
      floor_id: 'floor-1',
      order: 5,
      name: 'tag',
      lang: 'ja',
    });
    expect(apiCalls[0].options).to.deep.equal({ management: true });
    expect(apiCalls[0].config).to.have.property('onUploadProgress').that.is.a('function');
  });

  it('管理モードで対象IDがなければ作成・更新・成功通知を行わない', async () => {
    tagApi.floorTag.create = vi.fn();
    tagApi.floorTag.update = vi.fn();
    const wrapper = createWrapper({
      props: { floorTag: {}, managementMode: true },
    });
    await wrapper.setData({ name: 'tag', order: 5 });

    expect(wrapper.vm.v$.$invalid).to.equal(false);
    wrapper.vm.onPressDoneButton();
    await flushPromises();

    expect(tagApi.floorTag.create).toHaveBeenCalledTimes(0);
    expect(tagApi.floorTag.update).toHaveBeenCalledTimes(0);
    expect(wrapper.emitted('success')).to.equal(undefined);
  });

  it('通常モードで対象がなければ通常作成を呼ぶ', async () => {
    const apiCalls = [];
    tagApi.floorTag.create = (payload, config) => {
      apiCalls.push({ payload, config });
      return Promise.resolve({ data: { _id: 'created-tag' } });
    };
    const wrapper = createWrapper({ props: { floorTag: null, managementMode: false } });
    await wrapper.setData({ name: 'tag', order: 5 });

    wrapper.vm.onPressDoneButton();
    await flushPromises();

    expect(apiCalls).to.have.lengthOf(1);
    expect(apiCalls[0].payload).to.deep.equal({ floor_id: 'floor-1', order: 5, name: 'tag', lang: 'ja' });
    expect(apiCalls[0].config).to.have.property('onUploadProgress').that.is.a('function');
    expect(wrapper.emitted().success[0]).to.deep.equal([{ _id: 'created-tag' }]);
  });

  it('表示順番が小数なら更新APIを呼ばずエラー表示する', async () => {
    let updateCalled = false;
    tagApi.floorTag.update = () => {
      updateCalled = true;
      return Promise.resolve({ data: {} });
    };
    const snackbarCalls = [];
    const wrapper = createWrapper({
      props: { dialogVisible: true, floorTag: { _id: 'tag-1' }, managementMode: true },
    });
    wrapper.vm.setSnackbar = (message, role) => {
      snackbarCalls.push({ message, role });
    };

    wrapper.setData({ name: 'tag', order: '1.5' });
    await wrapper.vm.$nextTick();

    wrapper.vm.onPressDoneButton();
    await flushPromises();

    expect(updateCalled).to.equal(false);
    expect(snackbarCalls).to.deep.equal([{ message: '表示順番は1以上、100以下の整数です', role: 'alert' }]);
  });

  it('表示順番が空なら100を補完して更新APIを呼ぶ', async () => {
    const apiCalls = [];
    tagApi.floorTag.update = (payload, options) => {
      apiCalls.push({ payload, options });
      return Promise.resolve({ data: {} });
    };

    const wrapper = createWrapper({
      props: { dialogVisible: true, floorTag: { _id: 'tag-2' }, managementMode: false },
    });

    wrapper.setData({ name: 'tag', order: '' });
    await wrapper.vm.$nextTick();

    wrapper.vm.onPressDoneButton();
    await flushPromises();

    expect(apiCalls).to.have.lengthOf(1);
    expect(apiCalls[0].payload).to.deep.include({
      _id: 'tag-2',
      floor_id: 'floor-1',
      order: 100,
      name: 'tag',
      lang: 'ja',
    });
    expect(apiCalls[0].options).to.deep.equal({ management: false });
  });

  it('更新で401応答を受けた場合はログアウトしてログイン画面へ移動する', async () => {
    tagApi.floorTag.update = () => Promise.reject({ response: { status: 401 } });
    const dispatchCalls = [];
    const wrapper = createWrapper({
      props: { dialogVisible: true, floorTag: { _id: 'tag-1' }, managementMode: true },
      mocks: {
        $store: createStoreMock({ dispatch: (type) => dispatchCalls.push(type) }),
      },
    });

    wrapper.setData({ name: 'tag', order: 5, delete_flg: false });
    await wrapper.vm.$nextTick();

    wrapper.vm.onPressDoneButton();
    await flushPromises();

    expect(dispatchCalls).to.include('doLogout');
  });
});
