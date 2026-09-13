import { expect, vi } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import roomApi from '@/api/room';
import uploadApi from '@/api/upload';
import EditRoomDialog from '@/components/room/EditRoomDialog.vue';
import loadImage from 'blueimp-load-image';

vi.mock('blueimp-load-image', () => ({ default: vi.fn() }));

import flushPromises from '../../helpers/flushPromises';

const imageSelectFocus = vi.fn();

const baseStubs = {
  BaseEditDialog: {
    name: 'BaseEditDialog',
    props: [
      'visible',
      'sending',
      'titleId',
      'titleText',
      'descriptionIds',
      'cancelLabel',
      'confirmLabel',
      'progressAmount',
    ],
    template: '<div><slot/></div>',
  },
  ConfirmDialog: {
    name: 'ConfirmDialog',
    props: ['dialogVisible', 'title', 'message', 'confirmLabel', 'cancelLabel', 'actionsAdjacent'],
    template: '<div />',
  },
  UiButton: {
    name: 'UiButton',
    inheritAttrs: false,
    methods: {
      focus() {
        imageSelectFocus();
      },
    },
    template: '<button v-bind="$attrs"><slot /></button>',
  },
  UiTooltip: { template: '<span><slot /></span>' },
};

const existingRoom = (overrides = {}) => ({
  _id: 'room-1',
  floor: 'floor-1',
  title: 'Room',
  description: 'Desc',
  lang: 'ja',
  image_name: 'saved-a.jpg',
  guest_reaction_only: false,
  member_only: false,
  notification: true,
  external_sns_button: false,
  room_display_hidden: false,
  delete_flg: false,
  ...overrides,
});

const createdRoom = (overrides = {}) => ({
  _id: 'created-room',
  floor: 'floor-1',
  title: 'Room',
  description: 'Desc',
  lang: 'ja',
  guest_reaction_only: false,
  member_only: false,
  room_display_hidden: false,
  notification: true,
  external_sns_button: false,
  ...overrides,
});

const selectImage = async (wrapper, fileOrName = 'replacement.png') => {
  const file = fileOrName instanceof File
    ? fileOrName
    : new File(['image'], fileOrName, { type: 'image/png' });
  loadImage.mockImplementationOnce((_file, callback) => {
    callback({ toDataURL: () => 'data:image/jpeg;base64,AA==' });
  });
  const input = wrapper.get('input[type="file"]');
  Object.defineProperty(input.element, 'files', {
    configurable: true,
    value: [file],
  });
  Object.defineProperty(input.element, 'value', {
    configurable: true,
    writable: true,
    value: `C:\\fakepath\\${file.name}`,
  });
  await input.trigger('change');
  await wrapper.vm.$nextTick();
  return input;
};

const createStoreMock = (overrides = {}) => ({
  getters: {
    lang: 'ja',
    floorId: 'floor-1',
    ...overrides.getters,
  },
  dispatch: overrides.dispatch || (() => {}),
});

const translate = (key, params) => {
  if (!params) return key;
  return key.replace(/\{(\w+)\}/gu, (match, name) => (name in params ? params[name] : match));
};

const createWrapper = (overrides = {}) =>
  shallowMount(EditRoomDialog, {
    stubs: { ...baseStubs, ...(overrides.stubs || {}) },
    props: {
      dialogVisible: true,
      room: null,
      managementMode: false,
      showLifecycleControl: true,
      ...(overrides.props || {}),
    },
    mocks: {
      $store: overrides.store || createStoreMock(),
      $router: overrides.router || { push: () => {} },
      $t: translate,
      $i18n: { locale: 'ja' },
      ...(overrides.mocks || {}),
    },
  });

describe('ルームの編集', () => {
  let originalCreate;
  let originalUpdate;
  let originalUpload;

  beforeEach(() => {
    originalCreate = roomApi.create;
    originalUpdate = roomApi.update;
    originalUpload = uploadApi.uploadRoomImage;
    loadImage.mockReset();
    imageSelectFocus.mockReset();
  });

  afterEach(() => {
    roomApi.create = originalCreate;
    roomApi.update = originalUpdate;
    uploadApi.uploadRoomImage = originalUpload;
  });

  it('タイトル入力に計測用の名称案内を表示しない', () => {
    const wrapper = createWrapper();

    expect(wrapper.findComponent({ name: 'AnalyticsResourceNotice' }).exists()).to.equal(false);
  });

  it('画像選択領域の重複見出しを視覚的に隠し、選択ボタンに用途を付与する', () => {
    const wrapper = createWrapper();
    const imageFieldset = wrapper.get('fieldset.image-input-fieldset');
    const legend = imageFieldset.get('legend');

    expect(legend.text()).to.equal('画像データを添付する');
    expect(legend.classes()).to.include('screen-reader-only');
    expect(imageFieldset.get('.media-button').attributes('aria-label')).to.equal('画像データを添付する');
    expect(imageFieldset.get('input[type="file"]').exists()).to.equal(true);
  });

  it('入力前はエラーを出さず、入力後に必須エラーを返す', () => {
    const wrapper = createWrapper();

    expect(wrapper.vm.titleError).to.equal('');
    expect(wrapper.vm.descriptionError).to.equal('');
    wrapper.vm.v$.title.$touch();

    expect(wrapper.vm.titleError).to.equal('必須');
  });

  it('管理モードも通常モードと同じ編集見出しを使い、作成と編集を分ける', () => {
    const managementWrapper = createWrapper({
      props: { room: existingRoom({ title: '管理Room' }), managementMode: true },
    });
    const missingIdWrapper = createWrapper({
      props: { room: existingRoom({ _id: null, title: '対象不明' }), managementMode: true },
    });
    const createWrapperNormal = createWrapper({ props: { room: null, managementMode: false } });
    const editWrapperNormal = createWrapper({
      props: { room: existingRoom(), managementMode: false, targetName: '翻訳済みRoom' },
    });

    expect(managementWrapper.findComponent({ name: 'BaseEditDialog' }).props('titleText')).to.equal('ルームを編集');
    expect(missingIdWrapper.findComponent({ name: 'BaseEditDialog' }).props('titleText')).to.equal('ルームを編集');
    expect(missingIdWrapper.findComponent({ name: 'BaseEditDialog' }).props('titleText')).to.not.include('作成');
    expect(createWrapperNormal.findComponent({ name: 'BaseEditDialog' }).props('titleText')).to.equal('ルームを作成');
    expect(editWrapperNormal.findComponent({ name: 'BaseEditDialog' }).props('titleText')).to.equal('ルームを編集');
  });

  it('作成は作成、編集と管理編集は保存ラベルを使い、指定時だけ論理削除入力要素を隠す', () => {
    const defaultWrapper = createWrapper({
      props: { room: existingRoom(), managementMode: true },
    });
    const hiddenWrapper = createWrapper({
      props: {
        room: existingRoom(),
        managementMode: true,
        showLifecycleControl: false,
      },
    });
    const createWrapperNormal = createWrapper();
    const editWrapperNormal = createWrapper({ props: { room: existingRoom() } });

    expect(defaultWrapper.findComponent({ name: 'BaseEditDialog' }).props('confirmLabel')).to.equal(
      'managementUi.save'
    );
    expect(defaultWrapper.find('#delete_flg').exists()).to.equal(true);
    expect(hiddenWrapper.find('#delete_flg').exists()).to.equal(false);
    expect(createWrapperNormal.findComponent({ name: 'BaseEditDialog' }).props('confirmLabel')).to.equal('作成');
    expect(editWrapperNormal.findComponent({ name: 'BaseEditDialog' }).props('confirmLabel')).to.equal(
      'managementUi.save'
    );
  });

  it('通常編集は翻訳済み対象名を説明として維持し、作成時は対象ルームを表示しない', async () => {
    const editWrapper = createWrapper({
      props: {
        room: existingRoom(),
        managementMode: false,
        targetName: '翻訳済みRoom',
      },
    });
    const createWrapperNormal = createWrapper();
    const targetContext = editWrapper.findComponent({ name: 'DialogTargetContext' });

    expect(editWrapper.findComponent({ name: 'BaseEditDialog' }).props('descriptionIds')).to.equal(
      'edit_room_dialog_context'
    );
    expect(targetContext.props()).to.include({
      contextId: 'edit_room_dialog_context',
      label: '対象ルーム',
      name: '翻訳済みRoom',
    });
    await editWrapper.setData({ title: '編集中の新しいタイトル' });
    expect(targetContext.props('name')).to.equal('翻訳済みRoom');
    expect(createWrapperNormal.findComponent({ name: 'DialogTargetContext' }).exists()).to.equal(false);
    expect(createWrapperNormal.findComponent({ name: 'BaseEditDialog' }).props('descriptionIds')).to.equal('');
  });

  it('通常モードと管理モードの入力項目を同じ4区分と対象表示に整理する', () => {
    const normalWrapper = createWrapper();
    const managementWrapper = createWrapper({
      props: { room: existingRoom(), managementMode: true },
    });

    expect(normalWrapper.findAll('.room-edit-section__title').map((heading) => heading.text())).to.deep.equal([
      '基本情報',
      '画像',
      '参加・投稿設定',
      '表示・通知',
    ]);
    expect(managementWrapper.findAll('.room-edit-section__title').map((heading) => heading.text())).to.deep.equal([
      '基本情報',
      '画像',
      '参加・投稿設定',
      '表示・通知',
    ]);
    expect(managementWrapper.findComponent({ name: 'DialogTargetContext' }).props()).to.include({
      contextId: 'edit_room_dialog_context',
      label: '対象ルーム',
      name: 'Room',
    });
    expect(normalWrapper.findComponent({ name: 'BaseEditDialog' }).classes()).to.include('room-edit-dialog');
    expect(managementWrapper.findComponent({ name: 'BaseEditDialog' }).classes()).to.include('room-edit-dialog');
  });

  it('未変更なら即時終了し、変更済みフォームだけ破棄確認を表示する', async () => {
    const cleanWrapper = createWrapper({ props: { room: existingRoom() } });
    cleanWrapper.vm.openedDialog();
    await cleanWrapper.setData({ visible: true });
    cleanWrapper.vm.onPressCancelButton();

    expect(cleanWrapper.vm.visible).to.equal(false);
    expect(cleanWrapper.vm.discardConfirmVisible).to.equal(false);

    const dirtyWrapper = createWrapper({ props: { room: existingRoom() } });
    dirtyWrapper.vm.openedDialog();
    await dirtyWrapper.setData({ visible: true, title: '変更後Room' });
    dirtyWrapper.vm.onPressCancelButton();
    await dirtyWrapper.vm.$nextTick();

    expect(dirtyWrapper.vm.visible).to.equal(true);
    expect(dirtyWrapper.vm.discardConfirmVisible).to.equal(true);
    expect(dirtyWrapper.findComponent({ name: 'ConfirmDialog' }).props()).to.include({
      dialogVisible: true,
      title: '破棄',
      message: '編集中のコンテンツは失われます',
      confirmLabel: '破棄',
      cancelLabel: 'キャンセル',
      actionsAdjacent: true,
    });

    dirtyWrapper.vm.cancelDiscard();
    expect(dirtyWrapper.vm.visible).to.equal(true);
    expect(dirtyWrapper.vm.discardConfirmVisible).to.equal(false);

    dirtyWrapper.vm.onPressCancelButton();
    dirtyWrapper.vm.confirmDiscard();
    expect(dirtyWrapper.vm.visible).to.equal(true);
    dirtyWrapper.vm.handleDiscardConfirmationClosed();
    expect(dirtyWrapper.vm.visible).to.equal(false);
    expect(dirtyWrapper.vm.discardConfirmVisible).to.equal(false);
  });

  it('入力を初期値へ戻した場合は閉じ、管理モードの変更には破棄確認を表示する', async () => {
    const revertedWrapper = createWrapper({ props: { room: existingRoom() } });
    revertedWrapper.vm.openedDialog();
    await revertedWrapper.setData({ visible: true, title: '一時変更' });
    await revertedWrapper.setData({ title: 'Room' });
    revertedWrapper.vm.onPressCancelButton();

    expect(revertedWrapper.vm.hasUnsavedChanges).to.equal(false);
    expect(revertedWrapper.vm.discardConfirmVisible).to.equal(false);
    expect(revertedWrapper.vm.visible).to.equal(false);

    const managementWrapper = createWrapper({
      props: { room: existingRoom(), managementMode: true },
    });
    managementWrapper.vm.openedDialog();
    await managementWrapper.setData({ visible: true, title: '管理変更' });
    managementWrapper.vm.onPressCancelButton();

    expect(managementWrapper.vm.hasUnsavedChanges).to.equal(true);
    expect(managementWrapper.vm.discardConfirmVisible).to.equal(true);
    expect(managementWrapper.vm.visible).to.equal(true);
    managementWrapper.vm.confirmDiscard();
    expect(managementWrapper.vm.discardConfirmVisible).to.equal(false);
    expect(managementWrapper.vm.visible).to.equal(true);
    managementWrapper.vm.handleDiscardConfirmationClosed();
    expect(managementWrapper.vm.visible).to.equal(false);
  });

  it('新規作成で入力値を開始時の空欄とチェックボックス状態へ戻した場合は破棄確認を表示しない', async () => {
    const wrapper = createWrapper({ props: { room: null } });
    wrapper.vm.openedDialog();
    await wrapper.setData({
      visible: true,
      title: '一時タイトル',
      description: '一時説明',
      memberOnly: true,
    });
    await wrapper.setData({
      title: '',
      description: '',
      memberOnly: false,
    });

    expect(wrapper.vm.hasUnsavedChanges).to.equal(false);
    wrapper.vm.onPressCancelButton();

    expect(wrapper.vm.discardConfirmVisible).to.equal(false);
    expect(wrapper.vm.visible).to.equal(false);
  });

  it('入力エラー時は最初の不正項目へスクロールしてフォーカスする', async () => {
    const wrapper = createWrapper();
    wrapper.vm.openedDialog();
    await wrapper.setData({ title: '', description: 'a'.repeat(201) });
    const titleInput = wrapper.vm.$refs.inputFieldTitle;
    titleInput.scrollIntoView = vi.fn();
    const focus = vi.spyOn(titleInput, 'focus');

    wrapper.vm.onPressDoneButton();
    await wrapper.vm.$nextTick();

    expect(titleInput.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(focus).toHaveBeenCalledOnce();
  });

  it('ルーム作成時に入力データを送信する', async () => {
    const apiCalls = [];
    roomApi.create = (payload, config) => {
      apiCalls.push({ payload, config });
      return Promise.resolve({ data: { _id: 'r1', floor: payload.floor_id } });
    };

    const wrapper = createWrapper();

    wrapper.setData({
      floorId: 'floor-1',
      title: 'Room',
      description: 'Desc',
      lang: 'ja',
      guestReactionOnly: false,
      memberOnly: false,
      roomDisplayHidden: false,
      notification: true,
      showExternalShareButton: false,
    });
    await wrapper.vm.$nextTick();

    wrapper.vm.onPressDoneButton();
    await flushPromises();

    expect(apiCalls).to.have.lengthOf(1);
    expect(apiCalls[0].payload).to.deep.equal({
      floor_id: 'floor-1',
      title: 'Room',
      description: 'Desc',
      lang: 'ja',
      guest_reaction_only: false,
      member_only: false,
      room_display_hidden: false,
      notification: true,
      external_sns_button: false,
    });
    expect(apiCalls[0].config).to.have.property('onUploadProgress').that.is.a('function');
  });

  for (const room of [null, existingRoom({ _id: null })]) {
    it(`管理モードで${room === null ? '対象なし' : '対象IDなし'}なら外部処理を呼ばない`, async () => {
      roomApi.create = vi.fn();
      roomApi.update = vi.fn();
      uploadApi.uploadRoomImage = vi.fn();
      const wrapper = createWrapper({ props: { room, managementMode: true } });
      await wrapper.setData({
        id: null,
        floorId: 'floor-1',
        title: 'Room',
        description: 'Desc',
        lang: 'ja',
        imageFile: new Blob(['image'], { type: 'image/jpeg' }),
      });

      expect(wrapper.vm.v$.$invalid).to.equal(false);
      wrapper.vm.onPressDoneButton();
      await flushPromises();

      expect(uploadApi.uploadRoomImage).toHaveBeenCalledTimes(0);
      expect(roomApi.create).toHaveBeenCalledTimes(0);
      expect(roomApi.update).toHaveBeenCalledTimes(0);
      expect(wrapper.emitted('success')).to.equal(undefined);
    });
  }

  it('更新は削除フラグを含むデータを送信する', async () => {
    const apiCalls = [];
    roomApi.update = (payload, options, config) => {
      apiCalls.push({ payload, options, config });
      return Promise.resolve({ data: payload });
    };

    const wrapper = createWrapper({
      props: { dialogVisible: true, room: { _id: 'r1' }, managementMode: true },
    });

    wrapper.setData({
      id: 'r1',
      title: 'Room',
      description: 'Desc',
      lang: 'ja',
      imageName: null,
      guestReactionOnly: false,
      memberOnly: false,
      roomDisplayHidden: false,
      notification: true,
      showExternalShareButton: false,
      deleteFlg: true,
    });
    await wrapper.vm.$nextTick();

    wrapper.vm.onPressDoneButton();
    await flushPromises();

    expect(apiCalls).to.have.lengthOf(1);
    expect(apiCalls[0].payload).to.deep.equal({
      _id: 'r1',
      title: 'Room',
      description: 'Desc',
      lang: 'ja',
      image_name: null,
      guest_reaction_only: false,
      member_only: false,
      room_display_hidden: false,
      notification: true,
      external_sns_button: false,
      delete_flg: true,
    });
    expect(apiCalls[0].options).to.deep.equal({ management: true });
    expect(apiCalls[0].config).to.have.property('onUploadProgress').that.is.a('function');
  });

  it('論理削除入力要素を隠しても既存の削除状態を更新データへ保持する', async () => {
    let updatePayload;
    roomApi.update = (payload) => {
      updatePayload = payload;
      return Promise.resolve({ data: payload });
    };
    const wrapper = createWrapper({
      props: {
        room: existingRoom({ delete_flg: true }),
        managementMode: true,
        showLifecycleControl: false,
      },
    });
    wrapper.vm.openedDialog();

    await wrapper.vm.update();

    expect(wrapper.find('#delete_flg').exists()).to.equal(false);
    expect(updatePayload.delete_flg).to.equal(true);
  });

  it('タイトルが空なら作成を呼ばない', async () => {
    const wrapper = createWrapper({
      props: { dialogVisible: true, room: null, managementMode: false },
    });

    let createCount = 0;
    wrapper.vm.create = () => {
      createCount += 1;
    };

    wrapper.setData({ title: '' });
    await wrapper.vm.$nextTick();
    wrapper.vm.onPressDoneButton();

    expect(createCount).to.equal(0);

    wrapper.setData({ title: 'Room title' });
    await wrapper.vm.$nextTick();
    wrapper.vm.onPressDoneButton();

    expect(createCount).to.equal(1);
  });

  for (const managementMode of [false, true]) {
    it(`${managementMode ? '管理' : '通常'}モードで保存済み画像を直接差し替え選択し、取消後は元画像で保存する`, async () => {
      const apiCalls = [];
      roomApi.update = (payload, options) => {
        apiCalls.push({ payload, options });
        return Promise.resolve({ data: payload });
      };
      const wrapper = createWrapper({
        props: { room: existingRoom(), managementMode },
      });
      wrapper.vm.openedDialog();
      await wrapper.vm.$nextTick();

      expect(wrapper.find('.media-button').exists()).to.equal(true);
      expect(wrapper.find('.image-uploaded-wrapper').exists()).to.equal(true);

      const sameFile = new File(['image'], 'replacement.png', { type: 'image/png' });
      const input = await selectImage(wrapper, sameFile);
      expect(wrapper.vm.imageName).to.equal('saved-a.jpg');
      expect(wrapper.find('.media-button').exists()).to.equal(false);
      expect(wrapper.find('.image-preview-wrapper').exists()).to.equal(true);
      expect(wrapper.find('.image-uploaded-wrapper').exists()).to.equal(false);

      const cancelButton = wrapper.get('.image-preview-wrapper .image-remove-button');
      expect(cancelButton.attributes('aria-label')).to.equal('imageAttachment.cancelReplacement');
      expect(cancelButton.text()).to.contain('imageAttachment.cancelReplacement');
      expect(cancelButton.attributes('aria-label')).to.not.equal('削除');
      expect(cancelButton.attributes('aria-label')).to.not.equal('キャンセル');
      await cancelButton.trigger('click');
      await wrapper.vm.$nextTick();

      expect(input.element.value).to.equal('');
      expect(wrapper.vm.imageName).to.equal('saved-a.jpg');
      expect(wrapper.vm.imageBase64).to.equal(null);
      expect(wrapper.vm.imageFile).to.equal(null);
      expect(wrapper.find('.image-uploaded-wrapper').exists()).to.equal(true);
      expect(wrapper.find('.media-button').exists()).to.equal(true);
      expect(imageSelectFocus).toHaveBeenCalledOnce();

      const loadCallsBeforeReselect = loadImage.mock.calls.length;
      await selectImage(wrapper, sameFile);
      expect(loadImage.mock.calls).to.have.lengthOf(loadCallsBeforeReselect + 1);
      await wrapper.vm.removeImageFile();
      await wrapper.vm.update();

      expect(apiCalls).to.have.lengthOf(1);
      expect(apiCalls[0].payload.image_name).to.equal('saved-a.jpg');
      expect(apiCalls[0].options).to.deep.equal({ management: managementMode });
    });

    it(`${managementMode ? '管理' : '通常'}モードで保存済み画像の明示削除だけをnullとして保存する`, async () => {
      let updateCall = null;
      roomApi.update = (payload, options) => {
        updateCall = { payload, options };
        return Promise.resolve({ data: payload });
      };
      const wrapper = createWrapper({
        props: { room: existingRoom(), managementMode },
      });
      wrapper.vm.openedDialog();
      await wrapper.vm.$nextTick();
      const deleteButton = wrapper.get('.image-uploaded-wrapper .image-remove-button');
      expect(deleteButton.attributes('aria-label')).to.equal('imageAttachment.delete');

      await deleteButton.trigger('click');
      expect(wrapper.vm.imageName).to.equal(null);
      expect(imageSelectFocus).toHaveBeenCalledOnce();

      await selectImage(wrapper);
      await wrapper.vm.removeImageFile();
      expect(wrapper.vm.imageName).to.equal(null);

      await wrapper.vm.update();
      expect(updateCall.payload.image_name).to.equal(null);
      expect(updateCall.options).to.deep.equal({ management: managementMode });
    });

    it(`${managementMode ? '管理' : '通常'}モードでDB更新成功後だけアップロード済み画像名を確定する`, async () => {
      let resolveUpdate;
      let updateCall = null;
      uploadApi.uploadRoomImage = () => Promise.resolve({ data: { image_name: 'uploaded-b.jpg' } });
      roomApi.update = (payload, options) => {
        updateCall = { payload, options };
        return new Promise((resolve) => {
          resolveUpdate = resolve;
        });
      };
      const wrapper = createWrapper({
        props: { room: existingRoom(), managementMode },
      });
      wrapper.vm.openedDialog();
      const input = await selectImage(wrapper);
      const selectedBlob = wrapper.vm.imageFile;

      const updatePromise = wrapper.vm.update();
      await flushPromises();

      expect(updateCall.payload.image_name).to.equal('uploaded-b.jpg');
      expect(updateCall.options).to.deep.equal({ management: managementMode });
      expect(wrapper.vm.imageName).to.equal('saved-a.jpg');
      expect(wrapper.vm.imageBase64).to.equal('data:image/jpeg;base64,AA==');
      expect(wrapper.vm.imageFile).to.equal(selectedBlob);

      resolveUpdate({ data: updateCall.payload });
      await updatePromise;

      expect(wrapper.vm.imageName).to.equal('uploaded-b.jpg');
      expect(wrapper.vm.imageBase64).to.equal(null);
      expect(wrapper.vm.imageFile).to.equal(null);
      expect(input.element.value).to.equal('');
    });

    it(`${managementMode ? '管理' : '通常'}モードで画像アップロード失敗時も元画像と選択中プレビューを維持する`, async () => {
      let updateCalled = false;
      uploadApi.uploadRoomImage = () => Promise.reject(new Error('upload failed'));
      roomApi.update = () => {
        updateCalled = true;
        return Promise.resolve({});
      };
      const wrapper = createWrapper({
        props: { room: existingRoom(), managementMode },
      });
      wrapper.vm.openedDialog();
      await selectImage(wrapper);
      const selectedBlob = wrapper.vm.imageFile;

      await wrapper.vm.update();

      expect(updateCalled).to.equal(false);
      expect(wrapper.vm.imageName).to.equal('saved-a.jpg');
      expect(wrapper.vm.imageBase64).to.equal('data:image/jpeg;base64,AA==');
      expect(wrapper.vm.imageFile).to.equal(selectedBlob);
    });

    it(`${managementMode ? '管理' : '通常'}モードでアップロード後のDB更新失敗時も元画像と選択中プレビューを維持する`, async () => {
      const updateCalls = [];
      uploadApi.uploadRoomImage = () => Promise.resolve({ data: { image_name: 'uploaded-b.jpg' } });
      roomApi.update = (payload, options) => {
        updateCalls.push({ payload, options });
        if (updateCalls.length === 1) return Promise.reject(new Error('update failed'));
        return Promise.resolve({ data: payload });
      };
      const wrapper = createWrapper({
        props: { room: existingRoom(), managementMode },
      });
      wrapper.vm.openedDialog();
      await selectImage(wrapper);
      const selectedBlob = wrapper.vm.imageFile;

      await wrapper.vm.update();

      expect(updateCalls[0].payload.image_name).to.equal('uploaded-b.jpg');
      expect(updateCalls[0].options).to.deep.equal({ management: managementMode });
      expect(wrapper.vm.imageName).to.equal('saved-a.jpg');
      expect(wrapper.vm.imageBase64).to.equal('data:image/jpeg;base64,AA==');
      expect(wrapper.vm.imageFile).to.equal(selectedBlob);

      await wrapper.vm.removeImageFile();
      expect(wrapper.find('.image-uploaded-wrapper').exists()).to.equal(true);
      await wrapper.vm.update();
      expect(updateCalls[1].payload.image_name).to.equal('saved-a.jpg');
      expect(updateCalls[1].options).to.deep.equal({ management: managementMode });
    });

    it(`${managementMode ? '管理' : '通常'}モードでclose後も同じファイルを再選択できる`, async () => {
      const wrapper = createWrapper({
        props: { room: existingRoom(), managementMode },
      });
      wrapper.vm.openedDialog();
      const sameFile = new File(['image'], 'same-file.png', { type: 'image/png' });
      const input = await selectImage(wrapper, sameFile);

      wrapper.vm.closedDialog();
      wrapper.vm.openedDialog();

      expect(input.element.value).to.equal('');
      expect(wrapper.vm.imageFile).to.equal(null);
      expect(wrapper.vm.imageBase64).to.equal(null);
      expect(wrapper.vm.imageName).to.equal('saved-a.jpg');

      const loadCallsBeforeReselect = loadImage.mock.calls.length;
      await selectImage(wrapper, sameFile);
      expect(loadImage.mock.calls).to.have.lengthOf(loadCallsBeforeReselect + 1);
      expect(wrapper.vm.imageBase64).to.equal('data:image/jpeg;base64,AA==');
    });
  }

  it('画像変換の遅延中は変更ありとし、破棄後の遅いコールバックは再表示後の状態を書き換えない', async () => {
    let finishImageLoad;
    const toDataURL = vi.fn(() => 'data:image/jpeg;base64,AA==');
    loadImage.mockImplementationOnce((_file, callback) => {
      finishImageLoad = () => callback({ toDataURL });
    });
    const wrapper = createWrapper({ props: { room: null } });
    wrapper.vm.openedDialog();
    await wrapper.setData({ visible: true });
    const input = wrapper.get('input[type="file"]');
    const file = new File(['image'], 'delayed.png', { type: 'image/png' });
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [file],
    });
    Object.defineProperty(input.element, 'value', {
      configurable: true,
      writable: true,
      value: 'C:\\fakepath\\delayed.png',
    });

    await input.trigger('change');

    expect(wrapper.vm.imageProcessing).to.equal(true);
    expect(wrapper.vm.hasUnsavedChanges).to.equal(true);
    wrapper.vm.onPressCancelButton();
    expect(wrapper.vm.discardConfirmVisible).to.equal(true);

    wrapper.vm.confirmDiscard();
    wrapper.vm.closedDialog();
    finishImageLoad();
    await wrapper.vm.$nextTick();
    wrapper.vm.openedDialog();
    await wrapper.setData({ visible: true });

    expect(toDataURL).not.toHaveBeenCalled();
    expect(wrapper.vm.imageProcessing).to.equal(false);
    expect(wrapper.vm.imageName).to.equal(null);
    expect(wrapper.vm.imageBase64).to.equal(null);
    expect(wrapper.vm.imageFile).to.equal(null);
    expect(wrapper.vm.hasUnsavedChanges).to.equal(false);
  });

  it('新規作成中に画像選択を取り消すと画像なしに戻り、ファイル選択画面の取消では状態を変えない', async () => {
    const wrapper = createWrapper({ props: { room: null } });
    wrapper.vm.openedDialog();
    const input = await selectImage(wrapper);

    await wrapper.vm.removeImageFile();
    expect(wrapper.vm.imageName).to.equal(null);
    expect(wrapper.vm.imageBase64).to.equal(null);
    expect(wrapper.vm.imageFile).to.equal(null);
    expect(input.element.value).to.equal('');

    await selectImage(wrapper, 'picker-current.png');
    const selectedBlob = wrapper.vm.imageFile;
    const selectedPreview = wrapper.vm.imageBase64;
    const selectedInputValue = input.element.value;
    Object.defineProperty(input.element, 'files', { configurable: true, value: [] });
    await input.trigger('change');

    expect(wrapper.vm.imageName).to.equal(null);
    expect(wrapper.vm.imageBase64).to.equal(selectedPreview);
    expect(wrapper.vm.imageFile).to.equal(selectedBlob);
    expect(input.element.value).to.equal(selectedInputValue);
  });

  it('画像ありの新規作成はDB更新成功後だけ画像名を確定する', async () => {
    let resolveUpdate;
    let updatePayload = null;
    roomApi.create = () => Promise.resolve({ data: createdRoom() });
    uploadApi.uploadRoomImage = () => Promise.resolve({ data: { image_name: 'uploaded-b.jpg' } });
    roomApi.update = (payload) => {
      updatePayload = payload;
      return new Promise((resolve) => {
        resolveUpdate = resolve;
      });
    };
    const wrapper = createWrapper({ props: { room: null } });
    wrapper.vm.openedDialog();
    await wrapper.setData({ title: 'Room', description: 'Desc' });
    const input = await selectImage(wrapper);
    const selectedBlob = wrapper.vm.imageFile;

    const createPromise = wrapper.vm.create();
    await flushPromises();

    expect(updatePayload.image_name).to.equal('uploaded-b.jpg');
    expect(wrapper.vm.imageName).to.equal(null);
    expect(wrapper.vm.imageBase64).to.equal('data:image/jpeg;base64,AA==');
    expect(wrapper.vm.imageFile).to.equal(selectedBlob);

    resolveUpdate({ data: updatePayload });
    await createPromise;
    expect(wrapper.vm.imageName).to.equal('uploaded-b.jpg');
    expect(wrapper.vm.imageBase64).to.equal(null);
    expect(wrapper.vm.imageFile).to.equal(null);
    expect(input.element.value).to.equal('');
  });

  it('画像ありの新規作成でDB更新が失敗しても選択中プレビューを維持する', async () => {
    roomApi.create = () => Promise.resolve({ data: createdRoom() });
    uploadApi.uploadRoomImage = () => Promise.resolve({ data: { image_name: 'uploaded-b.jpg' } });
    roomApi.update = () => Promise.reject(new Error('update failed'));
    const wrapper = createWrapper({ props: { room: null } });
    wrapper.vm.openedDialog();
    await wrapper.setData({ title: 'Room', description: 'Desc' });
    await selectImage(wrapper);
    const selectedBlob = wrapper.vm.imageFile;

    await wrapper.vm.create();

    expect(wrapper.vm.imageName).to.equal(null);
    expect(wrapper.vm.imageBase64).to.equal('data:image/jpeg;base64,AA==');
    expect(wrapper.vm.imageFile).to.equal(selectedBlob);
  });

  it('更新で401エラー時はログアウトしてログイン画面へ遷移する', async () => {
    roomApi.update = () => Promise.reject({ response: { status: 401 } });
    const dispatchCalls = [];
    const wrapper = createWrapper({
      props: { dialogVisible: true, room: { _id: 'r1' }, managementMode: true },
      store: createStoreMock({ dispatch: (type) => dispatchCalls.push(type) }),
    });
    wrapper.setData({
      id: 'r1',
      title: 'Room',
      description: 'Desc',
      lang: 'ja',
      imageName: null,
      guestReactionOnly: false,
      memberOnly: false,
      roomDisplayHidden: false,
      notification: true,
      showExternalShareButton: false,
      deleteFlg: false,
    });
    await wrapper.vm.$nextTick();

    wrapper.vm.onPressDoneButton();
    await flushPromises();

    expect(dispatchCalls).to.include('doLogout');
  });
});
