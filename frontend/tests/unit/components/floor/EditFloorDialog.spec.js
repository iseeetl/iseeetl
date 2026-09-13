import { expect, vi } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import floorApi from '@/api/floor';
import uploadApi from '@/api/upload';
import EditFloorDialog from '@/components/floor/EditFloorDialog.vue';
import loadImage from 'blueimp-load-image';

vi.mock('blueimp-load-image', () => ({ default: vi.fn() }));

import flushPromises from '../../helpers/flushPromises';

const baseStubs = {
  BaseEditDialog: {
    name: 'BaseEditDialog',
    props: ['confirmLabel', 'descriptionIds', 'titleText'],
    template: '<div><slot/></div>',
  },
  UiButton: {
    name: 'UiButton',
    inheritAttrs: false,
    methods: {
      focus() {},
    },
    template: '<button v-bind="$attrs"><slot /></button>',
  },
  UiTooltip: { template: '<span><slot /></span>' },
};

const existingFloor = (overrides = {}) => ({
  _id: 'floor-1',
  title: 'Floor',
  description: 'Desc',
  lang: 'ja',
  target_langs: ['en'],
  translations: [],
  image_name: 'saved-a.jpg',
  floor_display_hidden: false,
  delete_flg: false,
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
    googleTranslateAvailable: true,
    ...overrides.getters,
  },
  dispatch: overrides.dispatch || (() => {}),
});

const createWrapper = (overrides = {}) => {
  const wrapper = shallowMount(EditFloorDialog, {
    stubs: { ...baseStubs, ...(overrides.stubs || {}) },
    props: {
      dialogVisible: true,
      propsFloor: null,
      managementMode: false,
      showLifecycleControl: true,
      ...(overrides.props || {}),
    },
    mocks: {
      $store: overrides.store || createStoreMock(),
      $router: overrides.router || { push: () => {} },
      $t: (key) => key,
      $i18n: { locale: 'ja' },
      ...(overrides.mocks || {}),
    },
  });
  const router = (overrides.mocks && overrides.mocks.$router) || overrides.router || { push: () => {} };
  Object.defineProperty(wrapper.vm, '$router', { value: router, configurable: true });
  return wrapper;
};

describe('フロアの編集', () => {
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

  it('入力前はエラーを表示せず、入力後の空欄に必須エラーを表示する', async () => {
    const wrapper = createWrapper();

    expect(wrapper.vm.titleError).to.equal('');
    expect(wrapper.vm.descriptionError).to.equal('');
    wrapper.vm.v$.title.$touch();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.titleError).to.equal('必須');
  });

  it('管理編集は保存ラベルを使い、指定時だけ論理削除入力要素を隠す', () => {
    const defaultWrapper = createWrapper({
      props: { propsFloor: existingFloor(), managementMode: true },
    });
    const hiddenWrapper = createWrapper({
      props: {
        propsFloor: existingFloor(),
        managementMode: true,
        showLifecycleControl: false,
      },
    });
    const normalWrapper = createWrapper();

    expect(defaultWrapper.findComponent({ name: 'BaseEditDialog' }).props('confirmLabel')).to.equal(
      'managementUi.save'
    );
    expect(defaultWrapper.find('#delete_flg').exists()).to.equal(true);
    expect(hiddenWrapper.find('#delete_flg').exists()).to.equal(false);
    expect(normalWrapper.findComponent({ name: 'BaseEditDialog' }).props('confirmLabel')).to.equal('作成');
  });

  it('作成・編集のタイトルと操作を区別し、編集時は対象フロアを表示する', () => {
    const createWrapperInstance = createWrapper();
    const editWrapperInstance = createWrapper({
      props: { propsFloor: existingFloor(), targetName: '翻訳済みフロア名' },
    });
    const createDialog = createWrapperInstance.findComponent({ name: 'BaseEditDialog' });
    const editDialog = editWrapperInstance.findComponent({ name: 'BaseEditDialog' });
    const targetContext = editWrapperInstance.findComponent({ name: 'DialogTargetContext' });

    expect(createDialog.props('titleText')).to.equal('フロアを作成');
    expect(createDialog.props('confirmLabel')).to.equal('作成');
    expect(createDialog.props('descriptionIds')).to.equal('');
    expect(createWrapperInstance.findComponent({ name: 'DialogTargetContext' }).exists()).to.equal(false);
    expect(editDialog.props('titleText')).to.equal('フロアを編集');
    expect(editDialog.props('confirmLabel')).to.equal('managementUi.save');
    expect(editDialog.props('descriptionIds')).to.equal('edit_floor_dialog_context');
    expect(targetContext.props('label')).to.equal('対象フロア');
    expect(targetContext.props('name')).to.equal('翻訳済みフロア名');
    expect(editWrapperInstance.findAll('.floor-edit-section')).to.have.lengthOf(3);
  });

  it('管理編集も通常編集と同じタイトル、対象表示、区分、操作配置を使用する', () => {
    const wrapper = createWrapper({
      props: { propsFloor: existingFloor(), managementMode: true },
    });
    const dialog = wrapper.findComponent({ name: 'BaseEditDialog' });
    const targetContext = wrapper.findComponent({ name: 'DialogTargetContext' });

    expect(dialog.props('titleText')).to.equal('フロアを編集');
    expect(dialog.props('descriptionIds')).to.equal('edit_floor_dialog_context');
    expect(dialog.classes()).to.include('floor-edit-dialog');
    expect(targetContext.props()).to.include({
      contextId: 'edit_floor_dialog_context',
      label: '対象フロア',
      name: 'Floor',
    });
    expect(wrapper.findAll('.floor-edit-section__title').map((heading) => heading.text())).to.deep.equal([
      '基本情報',
      '画像',
      '表示・通知',
    ]);
  });

  it('フロア作成時に入力データを送信する', async () => {
    const originalCreate = floorApi.create;
    const apiCalls = [];
    floorApi.create = (payload, config) => {
      apiCalls.push({ payload, config });
      return Promise.resolve({ data: { _id: 'f1', title: payload.title, description: payload.description } });
    };

    try {
      const wrapper = createWrapper();

      wrapper.setData({
        title: 'Floor',
        description: 'Desc',
        target_langs: ['ja'],
        floorDisplayHidden: false,
      });
      await wrapper.vm.$nextTick();

      wrapper.vm.onPressDoneButton();
      await flushPromises();

      expect(apiCalls).to.have.lengthOf(1);
      expect(apiCalls[0].payload).to.deep.equal({
        title: 'Floor',
        description: 'Desc',
        lang: 'ja',
        target_langs: ['ja'],
        floor_display_hidden: false,
      });
      expect(apiCalls[0].config).to.have.property('onUploadProgress').that.is.a('function');
    } finally {
      floorApi.create = originalCreate;
    }
  });

  it('管理モードで対象IDがなければ画像アップロード・作成・更新・成功通知を行わない', async () => {
    const originalCreate = floorApi.create;
    const originalUpdate = floorApi.update;
    const originalUpload = uploadApi.uploadFloorImage;
    floorApi.create = vi.fn();
    floorApi.update = vi.fn();
    uploadApi.uploadFloorImage = vi.fn();

    try {
      const wrapper = createWrapper({
        props: { propsFloor: existingFloor({ _id: null }), managementMode: true },
      });
      await wrapper.setData({
        id: null,
        title: 'Floor',
        description: 'Desc',
        target_langs: ['ja'],
        imageFile: new Blob(['image'], { type: 'image/jpeg' }),
      });

      expect(wrapper.vm.v$.$invalid).to.equal(false);
      wrapper.vm.onPressDoneButton();
      await flushPromises();

      expect(uploadApi.uploadFloorImage).toHaveBeenCalledTimes(0);
      expect(floorApi.create).toHaveBeenCalledTimes(0);
      expect(floorApi.update).toHaveBeenCalledTimes(0);
      expect(wrapper.emitted('success')).to.equal(undefined);
    } finally {
      floorApi.create = originalCreate;
      floorApi.update = originalUpdate;
      uploadApi.uploadFloorImage = originalUpload;
    }
  });

  it('翻訳無効時は自動翻訳UIを隠し新規フロアの翻訳先を空にする', async () => {
    const originalCreate = floorApi.create;
    let payload = null;
    floorApi.create = (data) => {
      payload = data;
      return Promise.resolve({ data: { _id: 'f1', ...data } });
    };

    try {
      const wrapper = createWrapper({
        store: createStoreMock({ getters: { googleTranslateAvailable: false } }),
      });
      await wrapper.setData({ title: 'Floor', target_langs: ['ja', 'en'] });

      wrapper.vm.onPressDoneButton();
      await flushPromises();

      expect(wrapper.text()).to.not.include('自動翻訳');
      expect(payload.target_langs).to.deep.equal([]);
    } finally {
      floorApi.create = originalCreate;
    }
  });

  it('翻訳無効時も既存フロアの翻訳先を更新データで維持する', async () => {
    const originalUpdate = floorApi.update;
    let payload = null;
    floorApi.update = (data) => {
      payload = data;
      return Promise.resolve({ data });
    };

    try {
      const wrapper = createWrapper({
        props: { propsFloor: { _id: 'f1' } },
        store: createStoreMock({ getters: { googleTranslateAvailable: false } }),
      });
      await wrapper.setData({
        id: 'f1',
        title: 'Floor',
        lang: 'ja',
        target_langs: ['en'],
        floorDisplayHidden: false,
      });

      wrapper.vm.onPressDoneButton();
      await flushPromises();

      expect(payload.target_langs).to.deep.equal(['en']);
    } finally {
      floorApi.update = originalUpdate;
    }
  });

  it('更新は削除フラグを含むデータを送信する', async () => {
    const originalUpdate = floorApi.update;
    const apiCalls = [];
    floorApi.update = (payload, options, config) => {
      apiCalls.push({ payload, options, config });
      return Promise.resolve({ data: payload });
    };

    try {
      const wrapper = createWrapper({
        props: { dialogVisible: true, propsFloor: { _id: 'f1' }, managementMode: true },
      });

      wrapper.setData({
        id: 'f1',
        title: 'Floor',
        description: 'Desc',
        lang: 'en',
        target_langs: ['ja'],
        imageName: null,
        floorDisplayHidden: false,
        deleteFlg: true,
      });
      await wrapper.vm.$nextTick();

      wrapper.vm.onPressDoneButton();
      await flushPromises();

      expect(apiCalls).to.have.lengthOf(1);
      expect(apiCalls[0].payload).to.deep.equal({
        _id: 'f1',
        title: 'Floor',
        description: 'Desc',
        lang: 'en',
        target_langs: ['ja'],
        image_name: null,
        floor_display_hidden: false,
        delete_flg: true,
      });
      expect(apiCalls[0].options).to.deep.equal({ management: true });
    } finally {
      floorApi.update = originalUpdate;
    }
  });

  it('論理削除入力要素を隠しても既存の削除状態を更新データへ保持する', async () => {
    const originalUpdate = floorApi.update;
    let updatePayload;
    floorApi.update = (payload) => {
      updatePayload = payload;
      return Promise.resolve({ data: payload });
    };

    try {
      const wrapper = createWrapper({
        props: {
          propsFloor: existingFloor({ delete_flg: true }),
          managementMode: true,
          showLifecycleControl: false,
        },
      });
      wrapper.vm.openedDialog();
      await wrapper.vm.update();

      expect(wrapper.find('#delete_flg').exists()).to.equal(false);
      expect(updatePayload.delete_flg).to.equal(true);
    } finally {
      floorApi.update = originalUpdate;
    }
  });

  it('dialogVisibleの変更でvisibleが同期される', async () => {
    const wrapper = createWrapper({ props: { dialogVisible: false } });
    expect(wrapper.vm.visible).to.equal(false);
    await wrapper.setProps({ dialogVisible: true });
    expect(wrapper.vm.visible).to.equal(true);
  });

  it('openedDialogでpropsFloorの値が反映される', () => {
    const propsFloor = {
      _id: 'floor-1',
      title: 'Floor',
      description: 'Desc',
      lang: 'en',
      target_langs: ['ja'],
      translations: [{ lang: 'ja', title: 't', description: 'd' }],
      image_name: 'image.jpg',
      floor_display_hidden: true,
      delete_flg: true,
    };
    const wrapper = createWrapper({ props: { propsFloor } });

    wrapper.vm.openedDialog();

    expect(wrapper.vm.id).to.equal('floor-1');
    expect(wrapper.vm.title).to.equal('Floor');
    expect(wrapper.vm.description).to.equal('Desc');
    expect(wrapper.vm.lang).to.equal('en');
    expect(wrapper.vm.target_langs).to.deep.equal(['ja']);
    expect(wrapper.vm.translations).to.deep.equal([{ lang: 'ja', title: 't', description: 'd' }]);
    expect(wrapper.vm.imageName).to.equal('image.jpg');
    expect(wrapper.vm.floorDisplayHidden).to.equal(true);
    expect(wrapper.vm.deleteFlg).to.equal(true);
  });

  it('openedDialogで新規作成時はlangがストアから設定される', () => {
    const wrapper = createWrapper({
      props: { propsFloor: null },
      store: createStoreMock({ getters: { lang: 'vi' } }),
    });

    wrapper.vm.openedDialog();

    expect(wrapper.vm.lang).to.equal('vi');
  });

  it('送信中はキャンセル操作を無視する', () => {
    const wrapper = createWrapper();
    wrapper.setData({ sending: true, visible: true });

    wrapper.vm.onPressCancelButton();

    expect(wrapper.vm.visible).to.equal(true);
  });

  it('未変更または開始状態へ戻した作成内容は破棄確認なしで閉じる', async () => {
    const unchanged = createWrapper();
    unchanged.vm.openedDialog();
    unchanged.vm.onPressCancelButton();

    expect(unchanged.vm.visible).to.equal(false);
    expect(unchanged.vm.discardConfirmVisible).to.equal(false);

    const reverted = createWrapper();
    reverted.vm.openedDialog();
    await reverted.setData({ title: '一時入力', description: '一時説明', floorDisplayHidden: true });
    await reverted.setData({ title: null, description: '', floorDisplayHidden: false });
    reverted.vm.onPressCancelButton();

    expect(reverted.vm.visible).to.equal(false);
    expect(reverted.vm.discardConfirmVisible).to.equal(false);
  });

  it('通常編集の変更時だけ破棄確認を表示し、取消と確定を処理する', async () => {
    const wrapper = createWrapper({ props: { propsFloor: existingFloor() } });
    wrapper.vm.openedDialog();
    await wrapper.setData({ visible: true, title: '変更後' });

    wrapper.vm.onPressCancelButton();
    expect(wrapper.vm.visible).to.equal(true);
    expect(wrapper.vm.discardConfirmVisible).to.equal(true);

    wrapper.vm.cancelDiscard();
    expect(wrapper.vm.discardConfirmVisible).to.equal(false);
    expect(wrapper.vm.visible).to.equal(true);

    wrapper.vm.onPressCancelButton();
    wrapper.vm.confirmDiscard();
    expect(wrapper.vm.discardConfirmVisible).to.equal(false);
    expect(wrapper.vm.visible).to.equal(true);
    wrapper.vm.handleDiscardConfirmationClosed();
    expect(wrapper.vm.visible).to.equal(false);
  });

  it('翻訳先の並び替えだけでは変更扱いにせず、管理編集の変更には破棄確認を出す', async () => {
    const normalWrapper = createWrapper({
      props: { propsFloor: existingFloor({ target_langs: ['ja', 'en'] }) },
    });
    normalWrapper.vm.openedDialog();
    await normalWrapper.setData({ target_langs: ['en', 'ja'] });
    normalWrapper.vm.onPressCancelButton();

    expect(normalWrapper.vm.discardConfirmVisible).to.equal(false);
    expect(normalWrapper.vm.visible).to.equal(false);

    const managementWrapper = createWrapper({
      props: { propsFloor: existingFloor(), managementMode: true },
    });
    managementWrapper.vm.openedDialog();
    await managementWrapper.setData({ title: '変更後', visible: true });
    managementWrapper.vm.onPressCancelButton();

    expect(managementWrapper.vm.discardConfirmVisible).to.equal(true);
    expect(managementWrapper.vm.visible).to.equal(true);
    managementWrapper.vm.confirmDiscard();
    expect(managementWrapper.vm.discardConfirmVisible).to.equal(false);
    expect(managementWrapper.vm.visible).to.equal(true);
    managementWrapper.vm.handleDiscardConfirmationClosed();
    expect(managementWrapper.vm.visible).to.equal(false);
  });

  it('入力が不正な場合は作成を呼ばない', async () => {
    const wrapper = createWrapper({ props: { propsFloor: null } });
    let createCalls = 0;
    wrapper.vm.create = () => {
      createCalls += 1;
    };

    wrapper.setData({ title: '' });
    await wrapper.vm.$nextTick();
    const titleInput = wrapper.vm.$refs.inputFieldTitle;
    titleInput.scrollIntoView = vi.fn();
    const focus = vi.spyOn(titleInput, 'focus');

    wrapper.vm.onPressDoneButton();
    await wrapper.vm.$nextTick();

    expect(createCalls).to.equal(0);
    expect(titleInput.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(focus).toHaveBeenCalledOnce();
  });

  it('説明だけが不正な場合は説明欄へフォーカスする', async () => {
    const wrapper = createWrapper({ props: { propsFloor: null } });
    await wrapper.setData({ title: 'Floor', description: 'a'.repeat(201) });
    const descriptionInput = wrapper.vm.$refs.inputFieldDescription;
    descriptionInput.scrollIntoView = vi.fn();
    const focus = vi.spyOn(descriptionInput, 'focus');

    wrapper.vm.onPressDoneButton();
    await wrapper.vm.$nextTick();

    expect(descriptionInput.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(focus).toHaveBeenCalledOnce();
  });

  it('入力が正しい場合は作成を呼ぶ', async () => {
    const wrapper = createWrapper({ props: { propsFloor: null } });
    let createCalls = 0;
    wrapper.vm.create = () => {
      createCalls += 1;
    };

    wrapper.setData({ title: 'Floor' });
    await wrapper.vm.$nextTick();

    wrapper.vm.onPressDoneButton();

    expect(createCalls).to.equal(1);
  });

  it('既存フロアの場合は更新を呼ぶ', async () => {
    const wrapper = createWrapper({ props: { propsFloor: { _id: 'floor-1' } } });
    let updateCalls = 0;
    wrapper.vm.update = () => {
      updateCalls += 1;
    };

    wrapper.setData({ title: 'Floor' });
    await wrapper.vm.$nextTick();

    wrapper.vm.onPressDoneButton();

    expect(updateCalls).to.equal(1);
  });

  it('closedDialogでcloseを通知する', () => {
    const wrapper = createWrapper();
    wrapper.setData({
      sending: false,
      title: 'temp',
      description: 'desc',
      target_langs: ['ja'],
      floorDisplayHidden: true,
    });

    wrapper.vm.closedDialog();

    expect(wrapper.vm.title).to.equal(null);
    expect(wrapper.vm.description).to.equal(null);
    expect(wrapper.vm.target_langs).to.deep.equal(['ja', 'en']);
    expect(wrapper.vm.floorDisplayHidden).to.equal(false);
    expect(wrapper.emitted().close).to.have.lengthOf(1);
  });

  for (const managementMode of [false, true]) {
    it(`${managementMode ? '管理' : '通常'}モードで新画像の選択取消後も保存済み画像と更新データを維持する`, async () => {
      const originalUpdate = floorApi.update;
      const apiCalls = [];
      floorApi.update = (payload, options) => {
        apiCalls.push({ payload, options });
        return Promise.resolve({ data: payload });
      };

      try {
        const wrapper = createWrapper({
          props: { propsFloor: existingFloor(), managementMode },
        });
        wrapper.vm.openedDialog();
        const sameFile = new File(['image'], 'replacement.png', { type: 'image/png' });
        await selectImage(wrapper, sameFile);

        expect(wrapper.vm.imageName).to.equal('saved-a.jpg');
        expect(wrapper.find('.image-preview-wrapper').exists()).to.equal(true);
        expect(wrapper.find('.image-uploaded-wrapper').exists()).to.equal(false);

        const focusSpy = vi.spyOn(wrapper.vm.$refs.imageSelectButton, 'focus');
        const cancelButton = wrapper.get('.image-preview-wrapper .image-remove-button');
        expect(cancelButton.attributes('aria-label')).to.equal('imageAttachment.cancelReplacement');
        expect(cancelButton.text()).to.contain('imageAttachment.cancelReplacement');
        expect(cancelButton.attributes('aria-label')).to.not.equal('削除');
        expect(cancelButton.attributes('aria-label')).to.not.equal('キャンセル');
        await cancelButton.trigger('click');
        await wrapper.vm.$nextTick();

        expect(wrapper.vm.imageName).to.equal('saved-a.jpg');
        expect(wrapper.vm.imageBase64).to.equal(null);
        expect(wrapper.vm.imageFile).to.equal(null);
        expect(wrapper.get('input[type="file"]').element.value).to.equal('');
        expect(wrapper.find('.image-uploaded-wrapper').exists()).to.equal(true);
        expect(focusSpy).toHaveBeenCalledOnce();

        const loadCallsBeforeReselect = loadImage.mock.calls.length;
        await selectImage(wrapper, sameFile);
        expect(loadImage.mock.calls).to.have.lengthOf(loadCallsBeforeReselect + 1);
        expect(wrapper.find('.image-preview-wrapper').exists()).to.equal(true);
        await wrapper.vm.removeImageFile();

        wrapper.vm.onPressDoneButton();
        await flushPromises();

        expect(apiCalls).to.have.lengthOf(1);
        expect(apiCalls[0].payload.image_name).to.equal('saved-a.jpg');
        expect(apiCalls[0].options).to.deep.equal({ management: managementMode });
      } finally {
        floorApi.update = originalUpdate;
      }
    });
  }

  for (const managementMode of [false, true]) {
    it(`${managementMode ? '管理' : '通常'}モードで保存済み画像の明示削除と選択取消を別状態として扱う`, async () => {
      const originalUpdate = floorApi.update;
      let updateCall = null;
      floorApi.update = (payload, options) => {
        updateCall = { payload, options };
        return Promise.resolve({ data: payload });
      };

      try {
        const wrapper = createWrapper({ props: { propsFloor: existingFloor(), managementMode } });
        wrapper.vm.openedDialog();
        await wrapper.vm.$nextTick();
        const focusSpy = vi.spyOn(wrapper.vm.$refs.imageSelectButton, 'focus');
        const deleteButton = wrapper.get('.image-uploaded-wrapper .image-remove-button');
        expect(deleteButton.attributes('aria-label')).to.equal('imageAttachment.delete');

        await deleteButton.trigger('click');
        await wrapper.vm.$nextTick();
        expect(wrapper.vm.imageName).to.equal(null);
        expect(focusSpy).toHaveBeenCalledOnce();

        await selectImage(wrapper);
        await wrapper.get('.image-preview-wrapper .image-remove-button').trigger('click');
        await wrapper.vm.$nextTick();
        expect(wrapper.vm.imageName).to.equal(null);

        wrapper.vm.onPressDoneButton();
        await flushPromises();
        expect(updateCall.payload.image_name).to.equal(null);
        expect(updateCall.options).to.deep.equal({ management: managementMode });
      } finally {
        floorApi.update = originalUpdate;
      }
    });
  }

  it('新規作成中に画像選択を取り消すと画像なしに戻り、ファイル選択画面の取消では状態を変えない', async () => {
    const wrapper = createWrapper({ props: { propsFloor: null } });
    await selectImage(wrapper);
    await wrapper.vm.removeImageFile();

    expect(wrapper.vm.imageName).to.equal(null);
    expect(wrapper.vm.imageBase64).to.equal(null);
    expect(wrapper.vm.imageFile).to.equal(null);

    await wrapper.setData({ imageBase64: 'data:image/jpeg;base64,AA==', imageFile: new Blob(['selected']) });
    const selectedBlob = wrapper.vm.imageFile;
    wrapper.vm.changeImageFile({ preventDefault: vi.fn(), target: { files: [] } });

    expect(wrapper.vm.imageBase64).to.equal('data:image/jpeg;base64,AA==');
    expect(wrapper.vm.imageFile).to.equal(selectedBlob);
    expect(wrapper.vm.imageName).to.equal(null);
  });

  it('画像変換の遅延中は変更ありとし、破棄後の遅いコールバックは再表示後の状態を書き換えない', async () => {
    let finishImageLoad;
    const toDataURL = vi.fn(() => 'data:image/jpeg;base64,AA==');
    loadImage.mockImplementationOnce((_file, callback) => {
      finishImageLoad = () => callback({ toDataURL });
    });
    const wrapper = createWrapper({ props: { propsFloor: null } });
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

  it('画像ありの新規作成はDB更新成功後だけ新しい画像名を確定する', async () => {
    const originalCreate = floorApi.create;
    const originalUpload = uploadApi.uploadFloorImage;
    const originalUpdate = floorApi.update;
    let resolveUpdate;
    let updatePayload = null;
    floorApi.create = () => Promise.resolve({
      data: {
        _id: 'created-floor',
        title: 'Floor',
        description: 'Desc',
        floor_display_hidden: false,
      },
    });
    uploadApi.uploadFloorImage = () => Promise.resolve({ data: { image_name: 'uploaded-b.jpg' } });
    floorApi.update = (payload) => {
      updatePayload = payload;
      return new Promise((resolve) => {
        resolveUpdate = resolve;
      });
    };

    try {
      const wrapper = createWrapper({ props: { propsFloor: null } });
      wrapper.vm.openedDialog();
      await wrapper.setData({ title: 'Floor', description: 'Desc' });
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
    } finally {
      floorApi.create = originalCreate;
      uploadApi.uploadFloorImage = originalUpload;
      floorApi.update = originalUpdate;
    }
  });

  it('画像ありの新規作成でDB更新が失敗しても選択中プレビューを維持する', async () => {
    const originalCreate = floorApi.create;
    const originalUpload = uploadApi.uploadFloorImage;
    const originalUpdate = floorApi.update;
    floorApi.create = () => Promise.resolve({
      data: {
        _id: 'created-floor',
        title: 'Floor',
        description: 'Desc',
        floor_display_hidden: false,
      },
    });
    uploadApi.uploadFloorImage = () => Promise.resolve({ data: { image_name: 'uploaded-b.jpg' } });
    floorApi.update = () => Promise.reject(new Error('update failed'));

    try {
      const wrapper = createWrapper({ props: { propsFloor: null } });
      wrapper.vm.openedDialog();
      await wrapper.setData({ title: 'Floor', description: 'Desc' });
      await selectImage(wrapper);
      const selectedBlob = wrapper.vm.imageFile;

      await wrapper.vm.create();

      expect(wrapper.vm.imageName).to.equal(null);
      expect(wrapper.vm.imageBase64).to.equal('data:image/jpeg;base64,AA==');
      expect(wrapper.vm.imageFile).to.equal(selectedBlob);
    } finally {
      floorApi.create = originalCreate;
      uploadApi.uploadFloorImage = originalUpload;
      floorApi.update = originalUpdate;
    }
  });

  for (const managementMode of [false, true]) {
    it(`${managementMode ? '管理' : '通常'}モードで画像アップロードとDB更新が成功した後だけ新しい画像名を確定する`, async () => {
      const originalUpload = uploadApi.uploadFloorImage;
      const originalUpdate = floorApi.update;
      let updateCall = null;
      uploadApi.uploadFloorImage = () => Promise.resolve({ data: { image_name: 'uploaded-b.jpg' } });
      floorApi.update = (payload, options) => {
        updateCall = { payload, options };
        return Promise.resolve({ data: payload });
      };

      try {
        const wrapper = createWrapper({ props: { propsFloor: existingFloor(), managementMode } });
        wrapper.vm.openedDialog();
        const input = await selectImage(wrapper);

        await wrapper.vm.update();

        expect(updateCall.payload.image_name).to.equal('uploaded-b.jpg');
        expect(updateCall.options).to.deep.equal({ management: managementMode });
        expect(wrapper.vm.imageName).to.equal('uploaded-b.jpg');
        expect(wrapper.vm.imageBase64).to.equal(null);
        expect(wrapper.vm.imageFile).to.equal(null);
        expect(input.element.value).to.equal('');
      } finally {
        uploadApi.uploadFloorImage = originalUpload;
        floorApi.update = originalUpdate;
      }
    });

    it(`${managementMode ? '管理' : '通常'}モードで画像アップロード後のDB更新失敗時も保存済み画像と選択中プレビューを維持する`, async () => {
      const originalUpload = uploadApi.uploadFloorImage;
      const originalUpdate = floorApi.update;
      const updateCalls = [];
      uploadApi.uploadFloorImage = () => Promise.resolve({ data: { image_name: 'uploaded-b.jpg' } });
      floorApi.update = (payload, options) => {
        updateCalls.push({ payload, options });
        if (updateCalls.length === 1) return Promise.reject(new Error('update failed'));
        return Promise.resolve({ data: payload });
      };

      try {
        const wrapper = createWrapper({ props: { propsFloor: existingFloor(), managementMode } });
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
      } finally {
        uploadApi.uploadFloorImage = originalUpload;
        floorApi.update = originalUpdate;
      }
    });

    it(`${managementMode ? '管理' : '通常'}モードで画像アップロード失敗時も保存済み画像と選択中プレビューを維持する`, async () => {
      const originalUpload = uploadApi.uploadFloorImage;
      const originalUpdate = floorApi.update;
      let updateCalled = false;
      uploadApi.uploadFloorImage = () => Promise.reject(new Error('upload failed'));
      floorApi.update = () => {
        updateCalled = true;
        return Promise.resolve({});
      };

      try {
        const wrapper = createWrapper({ props: { propsFloor: existingFloor(), managementMode } });
        wrapper.vm.openedDialog();
        await selectImage(wrapper);
        const selectedBlob = wrapper.vm.imageFile;

        await wrapper.vm.update();

        expect(updateCalled).to.equal(false);
        expect(wrapper.vm.imageName).to.equal('saved-a.jpg');
        expect(wrapper.vm.imageBase64).to.equal('data:image/jpeg;base64,AA==');
        expect(wrapper.vm.imageFile).to.equal(selectedBlob);
      } finally {
        uploadApi.uploadFloorImage = originalUpload;
        floorApi.update = originalUpdate;
      }
    });
  }

  for (const managementMode of [false, true]) {
    it(`${managementMode ? '管理' : '通常'}モードでダイアログを閉じるとファイル入力を空にする`, async () => {
      const wrapper = createWrapper({ props: { propsFloor: existingFloor(), managementMode } });
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

  it('401エラー時はログアウトしてログイン画面へ移動する', () => {
    const dispatchCalls = [];
    const pushCalls = [];
    const wrapper = createWrapper({
      mocks: {
        $store: {
          getters: { lang: 'ja' },
          dispatch: (type) => dispatchCalls.push(type),
        },
        $router: { push: (payload) => pushCalls.push(payload) },
        $t: (key) => key,
        $i18n: { locale: 'ja' },
      },
    });

    const result = wrapper.vm.handleAuthError({ response: { status: 401 } });

    expect(result).to.equal(true);
    expect(dispatchCalls).to.include('doLogout');
    expect(pushCalls).to.deep.equal([{ name: 'Login' }]);
  });
});
