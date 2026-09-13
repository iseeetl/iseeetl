import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import { createI18n as createVueI18n } from 'vue-i18n';
import GuestProfileDialog from '@/components/app/GuestProfileDialog.vue';

const TEST_MESSAGES = {
  ゲスト: 'ゲスト',
  キャンセル: 'キャンセル',
  managementUi: {
    save: '保存',
  },
  ユーザ名: 'ユーザ名',
  必須: '必須',
  '20文字まで': '20文字まで',
  ユーザ名の入力は必須です: 'ユーザ名の入力は必須です',
  ユーザ名は20文字以内にしてください: 'ユーザ名は20文字以内にしてください',
  ゲストプロフィール設定: 'ゲストプロフィール設定',
  ゲストで使用するユーザ名と言語の設定: 'ゲストで使用するユーザ名と言語の設定',
  ログインページへ: 'ログインページへ',
  '画像データ、動画データ、音データ、字幕データのアップロードにはログインが必要です':
    '画像データ、動画データ、音データ、字幕データのアップロードにはログインが必要です',
};

const createTestI18n = () =>
  createVueI18n({
    legacy: true,
    locale: 'ja',
    messages: {
      ja: TEST_MESSAGES,
      en: TEST_MESSAGES,
    },
  });

const BaseEditDialogStub = {
  name: 'BaseEditDialog',
  inheritAttrs: false,
  props: {
    visible: Boolean,
    titleId: String,
    titleText: String,
    descriptionIds: String,
    cancelLabel: String,
    confirmLabel: String,
    cancelTestId: String,
    mobileCancelTestId: String,
    confirmTestId: String,
    initialFocus: String,
    actionsAdjacent: Boolean,
    sending: Boolean,
  },
  template: '<section><h2 :id="titleId">{{ titleText }}</h2><main><slot /></main></section>',
};

const UiFieldStub = {
  name: 'UiField',
  props: ['controlId', 'label', 'invalid', 'error'],
  template: "<div><slot :control-attrs=\"{ id: controlId, 'aria-invalid': invalid ? 'true' : null }\" /></div>",
};

const globalStubs = {
  BaseEditDialog: BaseEditDialogStub,
  UiField: UiFieldStub,
  'router-link': { template: '<a><slot /></a>' },
  LanguageSelector: { name: 'LanguageSelector', props: ['controlId'], template: '<div />' },
};

const makeStoreMock = (overrides = {}) => {
  const calls = [];
  const store = {
    getters: {
      guestName: null,
      guestId: 'gid-123',
      lang: null,
      ...(overrides.getters || {}),
    },
    dispatch(type, payload) {
      calls.push({ type, payload });
    },
  };
  return { store, calls };
};

const factory = (options = {}) => {
  const { store, calls } = makeStoreMock(options.store || {});
  const route = (options.mocks && options.mocks.$route) || { params: {} };
  const i18n = createTestI18n();
  const wrapper = shallowMount(GuestProfileDialog, {
    stubs: globalStubs,
    props: { dialogVisible: false, ...(options.props || {}) },
    mocks: { $store: store, $route: route, ...(options.mocks || {}) },
    global: {
      plugins: [i18n],
    },
  });
  return { wrapper, store, calls };
};

describe('ゲストプロフィールの編集', () => {
  it('dialogVisibleの変更をBaseEditDialogのvisibleへ反映する', async () => {
    const { wrapper } = factory();
    const dialog = wrapper.findComponent(BaseEditDialogStub);

    expect(dialog.props('visible')).to.equal(false);
    await wrapper.setProps({ dialogVisible: true });

    expect(wrapper.vm.visible).to.equal(true);
    expect(dialog.props('visible')).to.equal(true);
  });

  it('編集ダイアログのタイトル、操作、初期フォーカスを共通契約へ渡す', () => {
    const { wrapper } = factory();
    const dialog = wrapper.findComponent(BaseEditDialogStub);

    expect(dialog.props()).to.include({
      titleId: 'guest_profile_dialog_title',
      titleText: 'ゲストプロフィール設定',
      descriptionIds: 'guest_profile_dialog_description',
      cancelLabel: 'キャンセル',
      confirmLabel: '保存',
      cancelTestId: 'dialog-guest-profile-cancel-desktop',
      mobileCancelTestId: 'dialog-guest-profile-cancel-mobile',
      confirmTestId: 'dialog-guest-profile-confirm',
      initialFocus: '#guest_name',
      actionsAdjacent: true,
    });
    expect(wrapper.find('h2#guest_profile_dialog_title').exists()).to.equal(true);
    expect(wrapper.find('legend#guest_profile_dialog_description').exists()).to.equal(true);
  });

  it('言語選択へゲストプロフィール固有のcontrolIdを渡す', () => {
    const { wrapper } = factory();
    const languageSelector = wrapper.findComponent({ name: 'LanguageSelector' });

    expect(languageSelector.props('controlId')).to.equal('guest_profile_lang');
  });

  it('openedDialog()はストア未設定時のゲスト名と言語を初期化する', () => {
    const { wrapper } = factory({
      store: { getters: { guestName: null, lang: null } },
    });
    wrapper.vm.$i18n.locale = 'ja';

    wrapper.vm.openedDialog();

    expect(wrapper.vm.guestName).to.equal('ゲスト');
    expect(wrapper.vm.lang).to.equal('ja');
  });

  it('openedDialog()はストアにあるゲスト名と言語を反映する', () => {
    const { wrapper } = factory({
      store: { getters: { guestName: '既存名', lang: 'en' } },
    });

    wrapper.vm.openedDialog();

    expect(wrapper.vm.guestName).to.equal('既存名');
    expect(wrapper.vm.lang).to.equal('en');
  });

  it('changeLang()はストアとi18nへ言語を反映する', () => {
    const { wrapper, calls } = factory();

    wrapper.vm.changeLang('en');

    expect(wrapper.vm.lang).to.equal('en');
    expect(calls.find((call) => call.type === 'doSetLang').payload).to.deep.equal({ lang: 'en' });
    expect(wrapper.vm.$i18n.locale).to.equal('en');
  });

  it('ゲスト名の入力に触れていない間はエラーを表示しない', () => {
    const { wrapper } = factory();

    expect(wrapper.vm.guestNameInvalid).to.equal(false);
    expect(wrapper.vm.guestNameError).to.equal('');
  });

  it('入力欄からフォーカスが外れた後、未入力なら必須エラーを表示する', async () => {
    const { wrapper } = factory();
    await wrapper.setData({ guestName: '' });
    wrapper.vm.v$.guestName.$touch();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.guestNameInvalid).to.equal(true);
    expect(wrapper.vm.guestNameError).to.equal('ユーザ名の入力は必須です');
  });

  it('20文字超は文字数エラーにする', async () => {
    const { wrapper } = factory();
    await wrapper.setData({ guestName: 'あ'.repeat(21) });
    wrapper.vm.v$.guestName.$touch();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.guestNameInvalid).to.equal(true);
    expect(wrapper.vm.guestNameError).to.equal('ユーザ名は20文字以内にしてください');
  });

  it('onPressDoneButton()は未入力の場合successを通知しない', async () => {
    const { wrapper } = factory();
    await wrapper.setData({ guestName: '' });

    wrapper.vm.onPressDoneButton();

    expect(wrapper.vm.v$.$invalid).to.equal(true);
    expect(wrapper.emitted().success).to.equal(undefined);
  });

  it('onPressDoneButton()は有効な値をストアへ反映してsuccessを通知する', async () => {
    const { wrapper, calls } = factory({
      store: { getters: { guestId: 'gid-xyz' } },
    });
    await wrapper.setData({ guestName: '太郎', lang: 'ja' });

    wrapper.vm.onPressDoneButton();

    expect(calls.find((call) => call.type === 'doUpdateGuestUser').payload).to.deep.equal({
      guest_id: 'gid-xyz',
      guest_name: '太郎',
      lang: 'ja',
    });
    expect(wrapper.emitted().success).to.have.lengthOf(1);
  });

  it('共通編集ダイアログのcancelで表示状態をfalseにする', () => {
    const { wrapper } = factory({ props: { dialogVisible: true } });
    const dialog = wrapper.findComponent(BaseEditDialogStub);

    dialog.vm.$emit('cancel');

    expect(wrapper.vm.visible).to.equal(false);
  });

  it('閉じる処理で入力値を消去し、共通ダイアログのデータをcloseイベントへ渡す', async () => {
    const { wrapper } = factory();
    const payload = { focusRestored: true };
    await wrapper.setData({ guestName: '花子', lang: 'en' });

    wrapper.vm.closedDialog(payload);

    expect(wrapper.vm.guestName).to.equal('');
    expect(wrapper.vm.lang).to.equal(null);
    expect(wrapper.emitted().close[0]).to.deep.equal([payload]);
  });

  it('roomContextQueryはルートパラメータを文字列で返す', () => {
    const { wrapper } = factory({
      mocks: { $route: { params: { floor_id: 1, room_id: 'room-1' } } },
    });

    expect(wrapper.vm.roomContextQuery).to.deep.equal({ floor_id: '1', room_id: 'room-1' });
  });
});
