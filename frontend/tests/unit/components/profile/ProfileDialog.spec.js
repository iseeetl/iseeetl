import { expect, vi } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import uploadApi from '@/api/upload';
import userApi from '@/api/user';
import ProfileDialog from '@/components/profile/ProfileDialog.vue';
import { cropAndCompressImage } from '@/utils/imageUtil';
import flushPromises from '../../helpers/flushPromises';

vi.mock('@/utils/imageUtil', () => ({ cropAndCompressImage: vi.fn() }));

const BaseEditDialogStub = {
  name: 'BaseEditDialog',
  inheritAttrs: false,
  emits: ['update:visible', 'opened', 'closed', 'cancel', 'confirm'],
  props: {
    visible: Boolean,
    sending: Boolean,
    titleId: String,
    titleText: String,
    cancelLabel: String,
    confirmLabel: String,
    progressAmount: Number,
    confirmDisabled: Boolean,
    initialFocus: String,
    actionsAdjacent: Boolean,
    cancelTestId: String,
    mobileCancelTestId: String,
    confirmTestId: String,
  },
  template: '<section v-show="visible" v-bind="$attrs"><slot /></section>',
};

const ConfirmDialogStub = {
  name: 'ConfirmDialog',
  emits: ['confirm', 'cancel', 'closed'],
  props: {
    dialogVisible: Boolean,
    title: String,
    message: String,
    confirmLabel: String,
    cancelLabel: String,
    actionsAdjacent: Boolean,
    closeOnEscape: Boolean,
    closeOnBackdrop: Boolean,
    confirmIcon: String,
  },
  template: '<aside v-show="dialogVisible" />',
};

const UiButtonStub = {
  name: 'UiButton',
  inheritAttrs: false,
  props: ['disabled', 'appearance', 'tone', 'density', 'iconOnly'],
  template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>',
  methods: { focus() { this.$el.focus(); } },
};

const UiFieldStub = {
  name: 'UiField',
  props: ['controlId', 'label', 'invalid', 'error'],
  template: `<div>
    <slot :control-attrs="{ id: controlId, 'aria-invalid': invalid ? 'true' : null }" />
  </div>`,
};

const LanguageSelectorStub = {
  name: 'LanguageSelector',
  emits: ['update:modelValue', 'change'],
  props: ['modelValue', 'controlId'],
  template: '<select :id="controlId" />',
};

const baseStubs = {
  BaseEditDialog: BaseEditDialogStub,
  ConfirmDialog: ConfirmDialogStub,
  LanguageSelector: LanguageSelectorStub,
  UiAvatar: { name: 'UiAvatar', template: '<span><slot /></span>' },
  UiButton: UiButtonStub,
  UiField: UiFieldStub,
  UiIcon: { name: 'UiIcon', props: ['name'], template: '<i :data-name="name" />' },
};

const profileResponse = (imageName = 'saved-a.jpg', overrides = {}) => ({
  username: 'Saved User',
  image_name: imageName,
  lang: 'ja',
  eye_friendly_mode: false,
  push_enabled: false,
  reply_push_enabled: true,
  replied_post_push_enabled: true,
  ...overrides,
});

const mountedWrappers = [];

const createStoreMock = (overrides = {}) => {
  const dispatch = overrides.dispatch || vi.fn(() => Promise.resolve());
  return {
    store: {
      getters: {
        userId: 'user-1',
        userRole: 'Author',
        lang: 'ja',
        oneSignalPushAvailable: false,
        ...(overrides.getters || {}),
      },
      dispatch,
    },
    dispatch,
  };
};

const createWrapper = (overrides = {}) => {
  const { store, dispatch } = createStoreMock(overrides.store || {});
  const router = overrides.router || { push: vi.fn(() => Promise.resolve()) };
  const i18n = overrides.i18n || { locale: 'ja' };
  const wrapper = shallowMount(ProfileDialog, {
    props: { dialogVisible: true, ...(overrides.props || {}) },
    router,
    stubs: { ...baseStubs, ...(overrides.stubs || {}) },
    mocks: {
      $store: store,
      $i18n: i18n,
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });
  mountedWrappers.push(wrapper);
  return { wrapper, store, dispatch, router, i18n };
};

const openDialog = async (wrapper) => {
  wrapper.findComponent(BaseEditDialogStub).vm.$emit('opened');
  await flushPromises();
};

const closeDialog = async (wrapper, payload = { focusRestored: true }) => {
  const dialog = wrapper.findComponent(BaseEditDialogStub);
  dialog.vm.$emit('update:visible', false);
  await wrapper.vm.$nextTick();
  dialog.vm.$emit('closed', payload);
  await wrapper.vm.$nextTick();
};

const selectImage = async (wrapper, fileOrName = 'replacement.png') => {
  const file =
    fileOrName instanceof File
      ? fileOrName
      : new File(['image'], fileOrName, { type: 'image/png' });
  const blob = new Blob(['compressed'], { type: 'image/jpeg' });
  cropAndCompressImage.mockResolvedValueOnce({
    base64: 'data:image/jpeg;base64,AA==',
    blob,
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
  await flushPromises();
  return { input, file, blob };
};

describe('プロフィールの編集', () => {
  let fetchDetailSpy;
  let updateProfileSpy;
  let uploadProfileImageSpy;
  let hadOneSignal;
  let originalOneSignal;
  let hadOneSignalDeferred;
  let originalOneSignalDeferred;

  beforeEach(() => {
    hadOneSignal = Object.prototype.hasOwnProperty.call(window, 'OneSignal');
    originalOneSignal = window.OneSignal;
    hadOneSignalDeferred = Object.prototype.hasOwnProperty.call(window, 'OneSignalDeferred');
    originalOneSignalDeferred = window.OneSignalDeferred;
    delete window.OneSignal;
    delete window.OneSignalDeferred;

    fetchDetailSpy = vi.spyOn(userApi, 'fetchDetail').mockResolvedValue({
      data: profileResponse(),
    });
    updateProfileSpy = vi.spyOn(userApi, 'updateProfile').mockImplementation((payload) =>
      Promise.resolve({
        data: profileResponse(payload.image_name, {
          username: payload.username,
          lang: payload.lang,
          eye_friendly_mode: payload.eye_friendly_mode,
          push_enabled: payload.push_enabled,
          reply_push_enabled: payload.reply_push_enabled,
          replied_post_push_enabled: payload.replied_post_push_enabled,
        }),
      })
    );
    uploadProfileImageSpy = vi.spyOn(uploadApi, 'uploadProfileImage').mockResolvedValue({
      data: { image_name: 'uploaded-b.jpg' },
    });
    cropAndCompressImage.mockReset();
  });

  afterEach(() => {
    while (mountedWrappers.length) mountedWrappers.pop().unmount();
    if (hadOneSignal) window.OneSignal = originalOneSignal;
    else delete window.OneSignal;
    if (hadOneSignalDeferred) window.OneSignalDeferred = originalOneSignalDeferred;
    else delete window.OneSignalDeferred;
    vi.restoreAllMocks();
  });

  it('共通編集ダイアログへ表示状態、操作、進捗、初期フォーカスを渡す', () => {
    const { wrapper } = createWrapper();
    const dialog = wrapper.findComponent(BaseEditDialogStub);

    expect(dialog.props()).to.include({
      visible: true,
      sending: false,
      titleText: 'プロフィール',
      cancelLabel: 'キャンセル',
      confirmLabel: 'managementUi.save',
      progressAmount: 0,
      confirmDisabled: true,
      initialFocus: '#username',
      actionsAdjacent: true,
      cancelTestId: 'dialog-profile-cancel-desktop',
      mobileCancelTestId: 'dialog-profile-cancel-mobile',
      confirmTestId: 'dialog-profile-confirm',
    });
    expect(dialog.props('titleId')).to.match(/^profile-dialog-.+-title$/);
    expect(dialog.attributes('data-testid')).to.equal('dialog-profile');
  });

  it('生成時には取得せず、openedごとに最新プロフィールを取得してフォームを作り直す', async () => {
    fetchDetailSpy
      .mockResolvedValueOnce({ data: profileResponse('first.jpg', { username: 'First' }) })
      .mockResolvedValueOnce({ data: profileResponse('second.jpg', { username: 'Second' }) });
    const { wrapper } = createWrapper();

    expect(fetchDetailSpy).not.toHaveBeenCalled();
    expect(wrapper.find('.profile-dialog__load-state').text()).to.contain('読み込み中です');

    await openDialog(wrapper);
    expect(fetchDetailSpy).toHaveBeenCalledTimes(1);
    expect(wrapper.vm.username).to.equal('First');
    expect(wrapper.vm.imageName).to.equal('first.jpg');

    await wrapper.setProps({ dialogVisible: false });
    await closeDialog(wrapper);
    await wrapper.setProps({ dialogVisible: true });
    await openDialog(wrapper);

    expect(fetchDetailSpy).toHaveBeenCalledTimes(2);
    expect(wrapper.vm.username).to.equal('Second');
    expect(wrapper.vm.imageName).to.equal('second.jpg');
  });

  it('取得失敗時はフォームを出さず再試行から取得し直せる', async () => {
    fetchDetailSpy
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValueOnce({ data: profileResponse(null, { username: 'Recovered' }) });
    const { wrapper } = createWrapper();

    await openDialog(wrapper);

    expect(wrapper.vm.fetchError).to.equal(true);
    expect(wrapper.find('.profile-dialog__content').exists()).to.equal(false);
    expect(wrapper.get('[data-testid="dialog-profile-retry"]').exists()).to.equal(true);

    await wrapper.get('[data-testid="dialog-profile-retry"]').trigger('click');
    await flushPromises();

    expect(fetchDetailSpy).toHaveBeenCalledTimes(2);
    expect(wrapper.vm.fetchError).to.equal(false);
    expect(wrapper.vm.username).to.equal('Recovered');
  });

  it('OneSignal無効時はSDK、Deferred queue、リスナーへ触れない', async () => {
    const addEventListener = vi.fn();
    window.OneSignal = {
      User: { PushSubscription: { optedIn: false, addEventListener } },
      Notifications: { addEventListener },
    };
    window.OneSignalDeferred = [];
    const { wrapper } = createWrapper({
      store: { getters: { oneSignalPushAvailable: false } },
    });

    await openDialog(wrapper);

    expect(wrapper.find('.push-settings').exists()).to.equal(false);
    expect(addEventListener).not.toHaveBeenCalled();
    expect(window.OneSignalDeferred).to.deep.equal([]);
    expect(wrapper.vm.loading).to.equal(false);
  });

  it('OneSignal未初期化時は購読変更を中断しプロフィール保存を呼ばない', async () => {
    window.OneSignalDeferred = [];
    const { wrapper, dispatch } = createWrapper({
      store: { getters: { oneSignalPushAvailable: true } },
    });
    await openDialog(wrapper);

    expect(window.OneSignalDeferred).to.have.lengthOf(1);
    expect(wrapper.vm.loading).to.equal(false);

    await wrapper.vm.togglePush();

    expect(updateProfileSpy).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith('doShowSnackbar', {
      message: 'Webプッシュ通知の初期化中です。時間をおいて再度お試しください',
      role: 'alert',
    });
  });

  it('openedでOneSignal リスナーを登録しclosedで同じリスナーを解除する', async () => {
    const addSubscriptionListener = vi.fn();
    const removeSubscriptionListener = vi.fn();
    const addPermissionListener = vi.fn();
    const removePermissionListener = vi.fn();
    window.OneSignal = {
      User: {
        PushSubscription: {
          optedIn: true,
          addEventListener: addSubscriptionListener,
          removeEventListener: removeSubscriptionListener,
        },
      },
      Notifications: {
        addEventListener: addPermissionListener,
        removeEventListener: removePermissionListener,
      },
    };
    const { wrapper } = createWrapper({
      store: { getters: { oneSignalPushAvailable: true } },
    });

    await openDialog(wrapper);
    const subscriptionHandler = addSubscriptionListener.mock.calls[0][1];
    const permissionHandler = addPermissionListener.mock.calls[0][1];

    expect(addSubscriptionListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(addPermissionListener).toHaveBeenCalledWith('permissionChange', expect.any(Function));
    expect(wrapper.vm.pushEnabled).to.equal(true);

    await wrapper.setProps({ dialogVisible: false });
    await closeDialog(wrapper);

    expect(removeSubscriptionListener).toHaveBeenCalledWith('change', subscriptionHandler);
    expect(removePermissionListener).toHaveBeenCalledWith('permissionChange', permissionHandler);
  });

  it('閉じた後にOneSignalの遅延処理が完了してもリスナーとフォームを更新しない', async () => {
    window.OneSignalDeferred = [];
    const { wrapper } = createWrapper({
      store: { getters: { oneSignalPushAvailable: true } },
    });
    await openDialog(wrapper);
    const deferredInit = window.OneSignalDeferred[0];

    await wrapper.setProps({ dialogVisible: false });
    await closeDialog(wrapper);

    const addSubscriptionListener = vi.fn();
    const addPermissionListener = vi.fn();
    deferredInit({
      User: {
        PushSubscription: {
          optedIn: true,
          addEventListener: addSubscriptionListener,
        },
      },
      Notifications: { addEventListener: addPermissionListener },
    });

    expect(addSubscriptionListener).not.toHaveBeenCalled();
    expect(addPermissionListener).not.toHaveBeenCalled();
    expect(wrapper.vm.committedProfile).to.equal(null);
    expect(wrapper.vm.pushEnabled).to.equal(false);
  });

  it('言語は即時反映し、変更を破棄するときだけ保存済みの言語へ戻す', async () => {
    const { wrapper, i18n } = createWrapper();
    await openDialog(wrapper);

    wrapper.vm.changeLang('en');
    expect(wrapper.vm.lang).to.equal('en');
    expect(i18n.locale).to.equal('en');

    wrapper.findComponent(BaseEditDialogStub).vm.$emit('cancel');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.discardConfirmVisible).to.equal(true);
    expect(wrapper.vm.visible).to.equal(true);
    expect(i18n.locale).to.equal('en');

    const confirm = wrapper.findComponent(ConfirmDialogStub);
    confirm.vm.$emit('cancel');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.discardConfirmVisible).to.equal(false);
    expect(wrapper.vm.visible).to.equal(true);
    expect(i18n.locale).to.equal('en');

    wrapper.findComponent(BaseEditDialogStub).vm.$emit('cancel');
    confirm.vm.$emit('confirm');
    confirm.vm.$emit('closed');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.visible).to.equal(false);
    expect(i18n.locale).to.equal('ja');
  });

  it('親都合でclosedになった場合も未保存言語を復元して値を破棄する', async () => {
    const { wrapper, i18n } = createWrapper();
    await openDialog(wrapper);
    wrapper.vm.changeLang('en');
    await wrapper.setData({ username: 'Unsaved' });

    await wrapper.setProps({ dialogVisible: false });
    await closeDialog(wrapper);

    expect(i18n.locale).to.equal('ja');
    expect(wrapper.vm.username).to.equal('');
    expect(wrapper.vm.committedProfile).to.equal(null);
  });

  it('変更済みのパスワード変更は破棄確認後にだけchange-passwordを通知する', async () => {
    const { wrapper } = createWrapper();
    await openDialog(wrapper);
    await wrapper.setData({ username: 'Changed' });

    wrapper.vm.onPressChangePasswordButton();
    expect(wrapper.vm.discardConfirmVisible).to.equal(true);
    expect(wrapper.emitted('change-password')).to.equal(undefined);

    wrapper.vm.confirmDiscardChanges();
    wrapper.vm.handleDiscardConfirmationClosed();

    expect(wrapper.emitted('change-password')).to.have.lengthOf(1);
  });

  it('有効な保存成功時はAPI応答をsuccessへ渡しVuexを更新する', async () => {
    const { wrapper, dispatch } = createWrapper();
    await openDialog(wrapper);
    await wrapper.setData({ username: 'Updated User', eyeFriendlyMode: true });

    wrapper.findComponent(BaseEditDialogStub).vm.$emit('confirm');
    await flushPromises();

    expect(updateProfileSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'Updated User',
        eye_friendly_mode: true,
      }),
      expect.objectContaining({ onUploadProgress: expect.any(Function) })
    );
    const responseData = updateProfileSpy.mock.results[0].value;
    expect(responseData).toBeInstanceOf(Promise);
    expect(wrapper.emitted('success')).to.have.lengthOf(1);
    expect(wrapper.emitted('success')[0][0]).to.deep.include({
      username: 'Updated User',
      eye_friendly_mode: true,
    });
    expect(dispatch).toHaveBeenCalledWith(
      'doUpdateProfile',
      expect.objectContaining({ name: 'Updated User', eyeFriendlyMode: true })
    );
    expect(dispatch).toHaveBeenCalledWith('doShowSnackbar', {
      message: 'プロフィールを更新しました',
      role: 'status',
    });
  });

  it('プッシュ通知の購読変更では未保存の入力を送らず、保存済みのプロフィールだけを使う', async () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const optIn = vi.fn(() => Promise.resolve());
    window.OneSignal = {
      User: {
        PushSubscription: {
          optedIn: false,
          optIn,
          optOut: vi.fn(() => Promise.resolve()),
          addEventListener,
          removeEventListener,
        },
      },
      Notifications: {
        permission: true,
        requestPermission: vi.fn(() => Promise.resolve(true)),
        addEventListener,
        removeEventListener,
      },
    };
    fetchDetailSpy.mockResolvedValueOnce({
      data: profileResponse('committed.jpg', {
        username: 'Committed User',
        lang: 'ja',
        eye_friendly_mode: false,
        reply_push_enabled: true,
        replied_post_push_enabled: false,
      }),
    });
    const { wrapper, dispatch } = createWrapper({
      store: { getters: { oneSignalPushAvailable: true } },
    });
    await openDialog(wrapper);
    await wrapper.setData({
      username: 'Unsaved User',
      imageName: null,
      lang: 'en',
      eyeFriendlyMode: true,
      replyPushEnabled: false,
      repliedPostPushEnabled: true,
    });

    await wrapper.vm.togglePush();

    expect(optIn).toHaveBeenCalledOnce();
    expect(updateProfileSpy).toHaveBeenCalledWith(
      {
        username: 'Committed User',
        image_name: 'committed.jpg',
        lang: 'ja',
        eye_friendly_mode: false,
        push_enabled: true,
        reply_push_enabled: true,
        replied_post_push_enabled: false,
      },
      expect.objectContaining({ onUploadProgress: expect.any(Function) })
    );
    expect(wrapper.vm.username).to.equal('Unsaved User');
    expect(wrapper.vm.lang).to.equal('en');
    expect(wrapper.vm.eyeFriendlyMode).to.equal(true);
    expect(wrapper.vm.replyPushEnabled).to.equal(false);
    expect(dispatch).toHaveBeenCalledWith(
      'doUpdateProfile',
      expect.objectContaining({
        name: 'Committed User',
        imageName: 'committed.jpg',
        lang: 'ja',
        eyeFriendlyMode: false,
        pushEnabled: true,
      })
    );
    expect(wrapper.emitted('success')).to.equal(undefined);
  });

  it('OneSignal購読変更に失敗した場合はプロフィールを保存しない', async () => {
    window.OneSignal = {
      User: {
        PushSubscription: {
          optedIn: false,
          optIn: vi.fn(() => Promise.reject(new Error('subscription failed'))),
          optOut: vi.fn(() => Promise.resolve()),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
      },
      Notifications: {
        permission: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    };
    const { wrapper, dispatch } = createWrapper({
      store: { getters: { oneSignalPushAvailable: true } },
    });
    await openDialog(wrapper);

    await wrapper.vm.togglePush();

    expect(updateProfileSpy).not.toHaveBeenCalled();
    const snackbar = dispatch.mock.calls.find(([type]) => type === 'doShowSnackbar');
    expect(snackbar[1].role).to.equal('alert');
    expect(snackbar[1].message).to.match(/^Webプッシュ通知の設定に失敗しました/);
  });

  it('画像アイコンからファイル選択を開き、送信中は操作を無効にする', async () => {
    const { wrapper } = createWrapper();
    await openDialog(wrapper);
    const input = wrapper.get('input[type="file"]');
    const click = vi.spyOn(input.element, 'click').mockImplementation(() => {});
    const button = wrapper.get('.select-icon button');
    expect(input.attributes('hidden')).toBeDefined();
    expect(button.attributes('aria-label')).toBe('アイコンにする画像');
    expect(button.get('[data-name="photo"]').exists()).toBe(true);
    await button.trigger('click');
    expect(click).toHaveBeenCalledOnce();
    await wrapper.setData({ sending: true });
    await button.trigger('click');
    expect(click).toHaveBeenCalledOnce();
  });

  it('新画像の選択取消は保存済みアイコンを維持し同じファイルを再選択できる', async () => {
    const { wrapper } = createWrapper();
    await openDialog(wrapper);
    const sameFile = new File(['image'], 'replacement.png', { type: 'image/png' });
    const { input } = await selectImage(wrapper, sameFile);

    expect(wrapper.vm.imageName).to.equal('saved-a.jpg');
    expect(wrapper.find('.avatar-preview-wrapper').exists()).to.equal(true);
    expect(wrapper.find('.avatar-uploaded-wrapper').exists()).to.equal(false);

    const focusSpy = vi.spyOn(wrapper.get('.select-icon button').element, 'focus');
    const cancelButton = wrapper.get('.avatar-preview-wrapper .avatar-remove-button');
    expect(cancelButton.attributes('aria-label')).to.equal('アイコンにする画像・キャンセル');
    await cancelButton.trigger('click');

    expect(input.element.value).to.equal('');
    expect(wrapper.vm.imageName).to.equal('saved-a.jpg');
    expect(wrapper.vm.imageData).to.equal(null);
    expect(wrapper.vm.imageFile).to.equal(null);
    expect(wrapper.find('.avatar-uploaded-wrapper').exists()).to.equal(true);
    expect(focusSpy).toHaveBeenCalledOnce();

    const cropCallsBeforeReselect = cropAndCompressImage.mock.calls.length;
    await selectImage(wrapper, sameFile);
    expect(cropAndCompressImage).toHaveBeenCalledTimes(cropCallsBeforeReselect + 1);
  });

  it('保存済みアイコンの明示削除だけをnullとして保存する', async () => {
    const { wrapper } = createWrapper();
    await openDialog(wrapper);
    const focusSpy = vi.spyOn(wrapper.get('.select-icon button').element, 'focus');

    await wrapper.get('.avatar-uploaded-wrapper .avatar-remove-button').trigger('click');
    expect(wrapper.vm.imageName).to.equal(null);
    expect(focusSpy).toHaveBeenCalledOnce();

    await wrapper.vm.editUser();
    expect(updateProfileSpy.mock.calls[0][0].image_name).to.equal(null);
  });

  it('画像アップロード失敗時も保存済みアイコンと選択中プレビューを維持する', async () => {
    uploadProfileImageSpy.mockRejectedValueOnce(new Error('upload failed'));
    const { wrapper, dispatch } = createWrapper();
    await openDialog(wrapper);
    const { blob } = await selectImage(wrapper);

    await wrapper.vm.imageUpload();

    expect(updateProfileSpy).not.toHaveBeenCalled();
    expect(wrapper.vm.imageName).to.equal('saved-a.jpg');
    expect(wrapper.vm.imageData).to.equal('data:image/jpeg;base64,AA==');
    expect(wrapper.vm.imageFile).to.equal(blob);
    const snackbar = dispatch.mock.calls.find(([type]) => type === 'doShowSnackbar');
    expect(snackbar[1].role).to.equal('alert');
    expect(snackbar[1].message).to.match(/^ファイルのアップロードに失敗しました/);
  });

  it('画像アップロード後のDB更新失敗でも元アイコンと選択中プレビューを維持する', async () => {
    updateProfileSpy.mockRejectedValueOnce(new Error('update failed'));
    const { wrapper, dispatch } = createWrapper();
    await openDialog(wrapper);
    const { blob } = await selectImage(wrapper);

    await wrapper.vm.imageUpload();

    expect(uploadProfileImageSpy).toHaveBeenCalledOnce();
    expect(updateProfileSpy.mock.calls[0][0].image_name).to.equal('uploaded-b.jpg');
    expect(wrapper.vm.imageName).to.equal('saved-a.jpg');
    expect(wrapper.vm.imageData).to.equal('data:image/jpeg;base64,AA==');
    expect(wrapper.vm.imageFile).to.equal(blob);
    const snackbar = dispatch.mock.calls.find(([type]) => type === 'doShowSnackbar');
    expect(snackbar[1].role).to.equal('alert');
    expect(snackbar[1].message).to.match(/^プロフィールの更新に失敗しました/);
  });

  it('ユーザ名の入力前はエラーを表示せず、確定後の空欄は送信しない', async () => {
    const { wrapper, dispatch } = createWrapper();
    await openDialog(wrapper);
    const field = wrapper.findComponent(UiFieldStub);

    expect(field.props('invalid')).to.equal(false);
    expect(field.props('error')).to.equal('');
    expect(wrapper.get('#username').attributes('aria-invalid')).to.equal(undefined);

    await wrapper.setData({ username: '' });
    wrapper.findComponent(BaseEditDialogStub).vm.$emit('confirm');
    await wrapper.vm.$nextTick();

    expect(updateProfileSpy).not.toHaveBeenCalled();
    expect(field.props('invalid')).to.equal(true);
    expect(field.props('error')).to.equal('ユーザ名の入力は必須です');
    expect(wrapper.get('#username').attributes('aria-invalid')).to.equal('true');
    expect(dispatch).toHaveBeenCalledWith('doShowSnackbar', {
      message: '入力を確認してください',
      role: 'alert',
    });
  });

  it.each([
    ['', 'ユーザ名の入力は必須です'],
    ['あ'.repeat(21), 'ユーザ名は20文字以内にしてください'],
  ])('username入力検証で不正値を送信しない: %s', async (username, expectedError) => {
    const { wrapper, dispatch } = createWrapper();
    await openDialog(wrapper);
    await wrapper.setData({ username });

    wrapper.findComponent(BaseEditDialogStub).vm.$emit('confirm');
    await wrapper.vm.$nextTick();

    expect(updateProfileSpy).not.toHaveBeenCalled();
    expect(wrapper.vm.v$.username.$invalid).to.equal(true);
    expect(wrapper.vm.validationErrorMessage('username')).to.equal(expectedError);
    expect(dispatch).toHaveBeenCalledWith('doShowSnackbar', {
      message: '入力を確認してください',
      role: 'alert',
    });
  });

  it('APIの401応答ではログアウトしてログイン画面へ移動する', () => {
    const { wrapper, dispatch, router } = createWrapper();

    wrapper.vm.handleApiError(
      { response: { status: 401 }, config: {} },
      'プロフィールの更新に失敗しました'
    );

    const snackbar = dispatch.mock.calls.find(([type]) => type === 'doShowSnackbar');
    expect(snackbar[1].role).to.equal('alert');
    expect(snackbar[1].message).to.match(/^プロフィールの更新に失敗しました/);
    expect(dispatch).toHaveBeenCalledWith('doLogout');
    expect(router.push).toHaveBeenCalledWith({ name: 'Login' });
  });
});
