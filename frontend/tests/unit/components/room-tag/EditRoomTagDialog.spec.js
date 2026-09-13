import { expect, vi } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import tagApi from '@/api/tag';
import EditRoomTagDialog from '@/components/room-tag/EditRoomTagDialog.vue';


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
  getters: { lang: 'ja', ...(overrides.getters || {}) },
  dispatch: overrides.dispatch || (() => {}),
});

const createWrapper = (overrides = {}) =>
  shallowMount(EditRoomTagDialog, {
    stubs: { ...baseStubs, ...(overrides.stubs || {}) },
    props: {
      dialogVisible: true,
      roomId: 'room-1',
      roomTag: null,
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

describe('ルームタグの編集', () => {
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

  it('管理モードでは論理削除欄を表示し、管理一覧からの編集では隠して保存操作にする', () => {
    const defaultManagement = createWrapper({
      props: { managementMode: true, roomTag: { _id: 'tag-1' } },
    });
    expect(defaultManagement.find('#delete_flg').exists()).to.equal(true);
    expect(defaultManagement.findComponent(BaseEditDialogStub).props('confirmLabel')).to.equal('managementUi.save');

    const hiddenManagement = createWrapper({
      props: { managementMode: true, roomTag: { _id: 'tag-1' }, showLifecycleControl: false },
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
        roomTag: { _id: 'tag-1', name: '保存済みタグ' },
        floorName: '翻訳済みフロア',
        roomName: '翻訳済みルーム',
        tagName: '保存済みタグ',
      },
    });
    const dialog = wrapper.findComponent(BaseEditDialogStub);
    const contexts = wrapper.findAllComponents({ name: 'DialogTargetContext' });

    expect(dialog.props()).to.include({
      titleText: 'ルームタグを編集',
      descriptionIds:
        'edit-room-tag-floor-context edit-room-tag-room-context edit-room-tag-tag-context',
      actionsAdjacent: true,
      initialFocus: '#room_tag_order',
    });
    expect(contexts.map((context) => context.props())).to.deep.include.members([
      { contextId: 'edit-room-tag-floor-context', label: '対象フロア', name: '翻訳済みフロア' },
      { contextId: 'edit-room-tag-room-context', label: '対象ルーム', name: '翻訳済みルーム' },
      { contextId: 'edit-room-tag-tag-context', label: '対象タグ', name: '保存済みタグ' },
    ]);
  });

  it('管理編集を変更後に閉じる場合だけ破棄確認し、取消と破棄を処理する', async () => {
    const wrapper = createWrapper({
      props: {
        managementMode: true,
        roomTag: { _id: 'tag-1', order: 1, name: '保存済みタグ', delete_flg: false },
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
    originalCreate = tagApi.roomTag.create;
    originalUpdate = tagApi.roomTag.update;
  });

  afterEach(() => {
    tagApi.roomTag.create = originalCreate;
    tagApi.roomTag.update = originalUpdate;
  });

  for (const roomTag of [null, {}]) {
    it(`管理モードで${roomTag === null ? '対象なし' : '対象IDなし'}なら作成・更新・成功通知を行わない`, async () => {
      tagApi.roomTag.create = vi.fn();
      tagApi.roomTag.update = vi.fn();
      const wrapper = createWrapper({ props: { roomTag, managementMode: true, roomId: 'room-1' } });
      await wrapper.setData({ name: 'tag', order: '1' });

      expect(wrapper.vm.v$.$invalid).to.equal(false);
      wrapper.vm.onPressDoneButton();
      await flushPromises();

      expect(tagApi.roomTag.create).toHaveBeenCalledTimes(0);
      expect(tagApi.roomTag.update).toHaveBeenCalledTimes(0);
      expect(wrapper.emitted('success')).to.equal(undefined);
    });
  }

  it('管理一覧では削除入力要素を隠し、元のdelete_flgを保持して更新結果をsuccess イベントへ渡す', async () => {
    const apiCalls = [];
    const updatedTag = { _id: 'tag-1', name: 'updated', order: 5, delete_flg: false };
    tagApi.roomTag.update = (payload, options, config) => {
      apiCalls.push({ payload, options, config });
      return Promise.resolve({ data: updatedTag });
    };

    const wrapper = createWrapper({
      props: {
        dialogVisible: true,
        roomTag: { _id: 'tag-1', lang: 'ja', delete_flg: true },
        managementMode: true,
        showLifecycleControl: false,
      },
    });

    wrapper.vm.openedDialog();
    wrapper.setData({ name: 'updated', order: 5 });
    await wrapper.vm.$nextTick();

    expect(wrapper.find('#delete_flg').exists()).to.equal(false);

    wrapper.vm.onPressDoneButton();
    await flushPromises();

    expect(apiCalls).to.have.lengthOf(1);
    expect(apiCalls[0].payload).to.deep.equal({
      _id: 'tag-1',
      order: 5,
      name: 'updated',
      lang: 'ja',
      delete_flg: true,
    });
    expect(apiCalls[0].options).to.deep.equal({ management: true });
    expect(apiCalls[0].config).to.have.property('onUploadProgress').that.is.a('function');
    expect(wrapper.emitted().success[0]).to.deep.equal([updatedTag]);
  });

  it('通常モードで対象があれば通常更新を呼ぶ', async () => {
    const apiCalls = [];
    tagApi.roomTag.update = (payload, options, config) => {
      apiCalls.push({ payload, options, config });
      return Promise.resolve({ data: payload });
    };
    const wrapper = createWrapper({
      props: { roomTag: { _id: 'tag-1', lang: 'ja' }, managementMode: false },
    });
    await wrapper.setData({ name: 'updated', order: 5, delete_flg: true });

    wrapper.vm.onPressDoneButton();
    await flushPromises();

    expect(apiCalls).to.have.lengthOf(1);
    expect(apiCalls[0].payload).to.deep.equal({ _id: 'tag-1', order: 5, name: 'updated', lang: 'ja' });
    expect(apiCalls[0].options).to.deep.equal({ management: false });
    expect(apiCalls[0].config).to.have.property('onUploadProgress').that.is.a('function');
  });

  it('表示順番が小数なら作成APIを呼ばずエラー表示する', async () => {
    let createCalled = false;
    tagApi.roomTag.create = () => {
      createCalled = true;
      return Promise.resolve({ data: {} });
    };

    const snackbarCalls = [];
    const wrapper = createWrapper({
      props: { dialogVisible: true, roomTag: null, managementMode: true, roomId: 'room-1' },
    });
    wrapper.vm.setSnackbar = (message, role) => {
      snackbarCalls.push({ message, role });
    };

    wrapper.setData({ name: 'tag', order: '1.5' });
    await wrapper.vm.$nextTick();

    wrapper.vm.onPressDoneButton();
    await flushPromises();

    expect(createCalled).to.equal(false);
    expect(snackbarCalls).to.have.lengthOf(1);
    expect(snackbarCalls[0]).to.deep.equal({
      message: '表示順番は1以上、100以下の整数です',
      role: 'alert',
    });
  });

  it('表示順番が空なら100を補完して作成APIを呼ぶ', async () => {
    const apiCalls = [];
    tagApi.roomTag.create = (payload, config) => {
      apiCalls.push({ payload, config });
      return Promise.resolve({ data: {} });
    };

    const wrapper = createWrapper({
      props: { dialogVisible: true, roomTag: null, managementMode: false, roomId: 'room-2' },
    });

    wrapper.setData({ name: 'tag', order: '' });
    await wrapper.vm.$nextTick();

    wrapper.vm.onPressDoneButton();
    await flushPromises();

    expect(apiCalls).to.have.lengthOf(1);
    expect(apiCalls[0].payload).to.deep.include({
      room_id: 'room-2',
      order: 100,
      name: 'tag',
      lang: 'ja',
    });
    expect(apiCalls[0].config).to.have.property('onUploadProgress').that.is.a('function');
  });

  it('管理更新で401エラー時はログアウトしてログイン画面へ遷移する', async () => {
    tagApi.roomTag.update = () => Promise.reject({ response: { status: 401 } });
    const dispatchCalls = [];
    const wrapper = createWrapper({
      props: {
        dialogVisible: true,
        roomTag: { _id: 'tag-1', lang: 'ja' },
        managementMode: true,
        roomId: 'room-1',
      },
      mocks: {
        $store: createStoreMock({ dispatch: (type) => dispatchCalls.push(type) }),
      },
    });
    wrapper.setData({ name: 'tag', order: '1' });
    await wrapper.vm.$nextTick();

    wrapper.vm.onPressDoneButton();
    await flushPromises();

    expect(dispatchCalls).to.include('doLogout');
  });
});
