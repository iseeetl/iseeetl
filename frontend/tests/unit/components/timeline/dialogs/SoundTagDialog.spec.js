import { expect } from 'vitest';
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
      ...(overrides.mocks || {}),
    },
  });

describe('音タグの選択', () => {
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

  it('ゲストの場合はゲスト用の保存処理を実行する', () => {
    const guestSoundTags = [];
    const dispatchCalls = [];
    const wrapper = createWrapper({
      store: {
        getters: {
          userIsLogin: false,
          roomId: 'room-1',
          guestSoundTags,
        },
        dispatch: (...args) => dispatchCalls.push(args),
      },
    });
    wrapper.setData({ tags: ['t1'] });

    wrapper.vm.onPressDoneButton();

    expect(dispatchCalls[0][0]).to.equal('doSetGuestSoundTags');
    expect(dispatchCalls[0][1]).to.deep.equal({ guestSoundTags: [{ roomId: 'room-1', soundTags: ['t1'] }] });
    expect(wrapper.emitted().success[0][0]).to.deep.equal({ _id: null, tags: ['t1'] });
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
