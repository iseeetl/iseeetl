import { expect } from 'vitest';
import { nextTick, reactive } from 'vue';
import { shallowMount } from '../../../helpers/testUtils';
import { createMemoryHistory, createRouter as createVueRouter } from 'vue-router';
import tagApi from '@/api/tag';
import SoundTagDialog from '@/components/timeline/dialogs/SoundTagDialog.vue';

import flushPromises from '../../../helpers/flushPromises';
const createRouter = () => {
  const router = createVueRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/login', name: 'Login' }],
  });
  router.push = () => Promise.resolve();
  return router;
};

const BaseEditDialogStub = {
  name: 'BaseEditDialog',
  props: ['visible', 'sending', 'titleText', 'cancelLabel', 'confirmLabel', 'actionsAdjacent', 'progressAmount'],
  template: '<div><slot/></div>',
};

const baseStubs = {
  BaseEditDialog: BaseEditDialogStub,
  ConfirmDialog: true,
  UiButton: true,
  UiIcon: true,
};

const translatedRoomTags = [
  { _id: 't2', name: '注意', order: 2, translations: [{ lang: 'en', name: 'Alert' }] },
  { _id: 't1', name: 'お知らせ', order: 1, translations: [{ lang: 'en', name: 'News' }] },
];

const createWrapper = (overrides = {}) =>
  shallowMount(SoundTagDialog, {
    router: overrides.router || createRouter(),
    stubs: baseStubs,
    props: {
      dialogVisible: true,
      floorId: 'floor-1',
      roomId: 'room-1',
      roomTags: [
        { _id: 't1', name: 'tag1', order: 1 },
        { _id: 't2', name: 'tag2', order: 2 },
      ],
      soundTagId: null,
      soundTags: [],
      ...(overrides.props || {}),
    },
    mocks: {
      $store: overrides.store || {
        getters: {
          userIsLogin: false,
          roomId: 'room-1',
          guestSoundTags: [],
        },
        dispatch: () => {},
      },
      $t: (key) => key,
      $i18n: { locale: 'ja' },
      ...(overrides.mocks || {}),
    },
  });

describe('音を鳴らすタグの選択', () => {
  let originalCreate;
  let originalUpdate;

  beforeEach(() => {
    originalCreate = tagApi.soundTag.create;
    originalUpdate = tagApi.soundTag.update;
  });

  afterEach(() => {
    tagApi.soundTag.create = originalCreate;
    tagApi.soundTag.update = originalUpdate;
  });

  it('共通編集ダイアログへ操作と進捗状態を渡す', async () => {
    const wrapper = createWrapper();
    await wrapper.setData({ sending: true, progressAmount: 35 });
    const dialog = wrapper.findComponent(BaseEditDialogStub);

    expect(dialog.props()).to.include({
      visible: true,
      sending: true,
      titleText: '音を鳴らすタグ',
      cancelLabel: 'キャンセル',
      confirmLabel: '決定',
      actionsAdjacent: true,
      progressAmount: 35,
    });
  });

  it('タグチェックボックスの一意なIDをラベルから参照する', () => {
    const wrapper = createWrapper();
    const input = wrapper.find('[data-testid="sound-tag-checkbox-t1"]');
    const label = wrapper.find(`label[for="${input.attributes('id')}"]`);

    expect(input.attributes('id')).not.to.equal('tag_checkbox_id_t1');
    expect(label.exists()).to.equal(true);
    expect(label.attributes('id')).to.equal(undefined);
  });

  it.each([
    ['ログインユーザ', true],
    ['ゲスト', false],
  ])('%sの英語表示では翻訳したタグ名を表示順に並べる', (_label, userIsLogin) => {
    const wrapper = createWrapper({
      props: { roomTags: translatedRoomTags },
      store: { getters: { userIsLogin, roomId: 'room-1', guestSoundTags: [] }, dispatch: () => {} },
      mocks: { $i18n: { locale: 'en' } },
    });

    expect(wrapper.findAll('.tag-option span').map((label) => label.text())).to.deep.equal(['News', 'Alert']);
    expect(wrapper.findAll('.tag-option input').map((input) => input.element.value)).to.deep.equal(['t1', 't2']);
    expect(translatedRoomTags.map((tag) => tag.name)).to.deep.equal(['注意', 'お知らせ']);
  });

  it('表示言語の翻訳がない場合は英語訳ではなく作成時のタグ名を表示する', () => {
    const wrapper = createWrapper({
      props: {
        roomTags: [
          ...translatedRoomTags,
          { _id: 't3', name: '連絡', order: 3 },
          { _id: 't4', name: '案内', order: 4, translations: [] },
        ],
      },
      mocks: { $i18n: { locale: 'fr' } },
    });

    expect(wrapper.findAll('.tag-option span').map((label) => label.text())).to.deep.equal([
      'お知らせ', '注意', '連絡', '案内',
    ]);
  });

  it('表示言語を変更するとタグ名が切り替わり、選択中のタグを維持する', async () => {
    const i18n = reactive({ locale: 'en' });
    const wrapper = createWrapper({
      props: { roomTags: translatedRoomTags, soundTags: ['t2'] },
      mocks: { $i18n: i18n },
    });
    wrapper.findComponent(BaseEditDialogStub).vm.$emit('opened');
    await nextTick();
    expect(wrapper.findAll('.tag-option span').map((label) => label.text())).to.deep.equal(['News', 'Alert']);

    i18n.locale = 'ja';
    await nextTick();

    expect(wrapper.findAll('.tag-option span').map((label) => label.text())).to.deep.equal(['お知らせ', '注意']);
    expect(wrapper.get('[data-testid="sound-tag-checkbox-t2"]').element.checked).to.equal(true);
    expect(wrapper.get('[data-testid="sound-tag-checkbox-t1"]').element.checked).to.equal(false);
    expect(wrapper.vm.tags).to.deep.equal(['t2']);
    expect(wrapper.vm.hasUnsavedChanges()).to.equal(false);
  });

  it('ダイアログを開くと選択済みタグを反映する', () => {
    const soundTags = ['t2'];
    const wrapper = createWrapper({ props: { soundTags } });

    wrapper.vm.openedDialog();
    wrapper.vm.tags.push('t1');

    expect(wrapper.vm.tags).to.deep.equal(['t2', 't1']);
    expect(soundTags).to.deep.equal(['t2']);
  });

  it('一括選択と一括解除でタグを切り替える', () => {
    const wrapper = createWrapper();

    wrapper.vm.onPressAllButton();
    expect(wrapper.vm.tags).to.deep.equal(['t1', 't2']);

    wrapper.vm.onPressClearButton();
    expect(wrapper.vm.tags).to.deep.equal([]);
  });

  it('編集後のキャンセルでは破棄確認を経て閉じる', () => {
    const wrapper = createWrapper({ props: { soundTags: ['t1'] } });
    wrapper.vm.openedDialog();
    wrapper.vm.onPressClearButton();

    wrapper.vm.onPressCancelButton();
    expect(wrapper.vm.discardConfirmVisible).to.equal(true);
    expect(wrapper.vm.visible).to.equal(true);

    wrapper.vm.confirmDiscard();
    wrapper.vm.closedDiscardConfirm();
    expect(wrapper.vm.visible).to.equal(false);
  });

  it('ゲストは翻訳表示したタグをIDでブラウザへ保存する', async () => {
    const guestSoundTags = [];
    const dispatchCalls = [];
    const wrapper = createWrapper({
      props: { roomTags: translatedRoomTags },
      mocks: { $i18n: { locale: 'en' } },
      store: {
        getters: {
          userIsLogin: false,
          roomId: 'room-1',
          guestSoundTags,
        },
        dispatch: (...args) => dispatchCalls.push(args),
      },
    });
    await wrapper.get('[data-testid="sound-tag-checkbox-t1"]').setValue(true);

    wrapper.vm.onPressDoneButton();

    expect(dispatchCalls[0][0]).to.equal('doSetGuestSoundTags');
    expect(dispatchCalls[0][1]).to.deep.equal({ guestSoundTags: [{ roomId: 'room-1', soundTags: ['t1'] }] });
    expect(wrapper.emitted().success[0][0]).to.deep.equal({ _id: null, tags: ['t1'] });
  });

  it.each([
    ['新規保存', null, 'create'],
    ['更新', 'sound-1', 'update'],
  ])('ログインユーザは翻訳表示したタグをIDで%sする', async (_label, soundTagId, method) => {
    const calls = [];
    tagApi.soundTag[method] = (data) => {
      calls.push(data);
      return Promise.resolve({ data: { _id: 'sound-1', tags: data.tags } });
    };
    const wrapper = createWrapper({
      props: { soundTagId, roomTags: translatedRoomTags },
      store: { getters: { userIsLogin: true }, dispatch: () => {} },
      mocks: { $i18n: { locale: 'en' } },
    });
    await wrapper.get('[data-testid="sound-tag-checkbox-t1"]').setValue(true);

    wrapper.vm.onPressDoneButton();
    await flushPromises();

    expect(calls).to.deep.equal([{
      floor_id: 'floor-1',
      room_id: 'room-1',
      tags: ['t1'],
      ...(soundTagId === null ? {} : { _id: soundTagId }),
    }]);
    expect(wrapper.emitted().success[0][0]).to.deep.equal({ _id: 'sound-1', tags: ['t1'] });
  });

  it('送信中は決定操作を受け付けない', () => {
    const wrapper = createWrapper();
    wrapper.setData({ sending: true });

    wrapper.vm.onPressDoneButton();

    expect(wrapper.emitted().success).to.equal(undefined);
  });

  it('ログイン時の保存で401エラーならログアウトしてログイン画面へ遷移する', async () => {
    tagApi.soundTag.create = () => Promise.reject({ response: { status: 401 } });
    const dispatchCalls = [];
    const wrapper = createWrapper({
      props: { soundTagId: null },
      store: {
        getters: {
          userIsLogin: true,
          roomId: 'room-1',
          guestSoundTags: [],
        },
        dispatch: (type) => dispatchCalls.push(type),
      },
    });
    wrapper.setData({ tags: ['t1'] });

    wrapper.vm.onPressDoneButton();
    await flushPromises();

    expect(dispatchCalls).to.include('doLogout');
  });
});
