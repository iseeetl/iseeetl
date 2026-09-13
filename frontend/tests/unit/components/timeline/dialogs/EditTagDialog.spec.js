import { expect } from 'vitest';
import { shallowMount } from '../../../helpers/testUtils';
import { createMemoryHistory, createRouter as createVueRouter } from 'vue-router';
import chatApi from '@/api/chat';
import EditTagDialog from '@/components/timeline/dialogs/EditTagDialog.vue';

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
  UiProgress: true,
};

const createStoreMock = (overrides = {}) => ({
  getters: {
    floorId: 'floor-1',
    floorTitle: 'Floor',
    roomId: 'room-1',
    roomTitle: 'Room',
    userId: 'user-1',
    userName: 'User',
    tagClipboardList: [],
    openaiAnalysisAvailable: true,
    ...(overrides.getters || {}),
  },
  dispatch: overrides.dispatch || (() => {}),
});

const createWrapper = (props, overrides = {}) =>
  shallowMount(EditTagDialog, {
    router: overrides.router || createRouter(),
    stubs: baseStubs,
    props,
    mocks: {
      $store: overrides.store || createStoreMock(),
      $t: (key) => key,
      $i18n: { locale: 'ja' },
    },
  });

const originalTagPost = chatApi.tagPost;
const originalTagReply = chatApi.tagReply;

describe('投稿・返信のタグ編集', () => {
  afterEach(() => {
    chatApi.tagPost = originalTagPost;
    chatApi.tagReply = originalTagReply;
  });

  it('共通編集ダイアログへ操作と進捗状態を渡す', async () => {
    const wrapper = createWrapper({
      dialogVisible: true,
      propsRoomTags: [],
      propsPostId: 'post-1',
      propsReplyId: null,
      propsTags: [],
    });
    await wrapper.setData({ sending: true, progressAmount: 45 });
    const dialog = wrapper.findComponent(BaseEditDialogStub);

    expect(dialog.props()).to.include({
      visible: true,
      sending: true,
      titleText: 'タグ更新',
      cancelLabel: 'キャンセル',
      confirmLabel: '更新',
      actionsAdjacent: true,
      progressAmount: 45,
    });
  });

  it('タグチェックボックスの一意なIDをラベルから参照する', () => {
    const wrapper = createWrapper({
      dialogVisible: true,
      propsRoomTags: [{ _id: 't1', name: 'tag1', order: 1 }],
      propsPostId: 'post-1',
      propsReplyId: null,
      propsTags: [],
    });
    const input = wrapper.find('[data-testid="dialog-edit-tag-checkbox-t1"]');
    const label = wrapper.find(`label[for="${input.attributes('id')}"]`);

    expect(input.attributes('id')).not.to.equal('tag_checkbox_id_t1');
    expect(label.exists()).to.equal(true);
    expect(label.attributes('id')).to.equal(undefined);
  });

  it('ダイアログを開くと選択中タグを反映する', () => {
    const wrapper = createWrapper({
      dialogVisible: true,
      propsRoomTags: [],
      propsPostId: 'post-1',
      propsReplyId: null,
      propsTags: ['t1'],
    });

    wrapper.vm.openedDialog();

    expect(wrapper.vm.tags).to.deep.equal(['t1']);
  });

  it('タグ見出しの横に操作ボタンを置き、選択肢をラベルでまとめる', () => {
    const wrapper = createWrapper({
      dialogVisible: true,
      propsRoomTags: [{ _id: 't1', name: 'tag1', order: 1 }],
      propsPostId: 'post-1',
      propsReplyId: null,
      propsTags: ['t1'],
    });

    expect(wrapper.find('legend .tag-action-row').exists()).to.equal(true);
    expect(wrapper.find('.tag-options label input[type="checkbox"]').exists()).to.equal(true);
    expect(wrapper.find('[data-testid="dialog-edit-tag-clear"]').text()).to.equal('クリア');
    expect(wrapper.find('[data-testid="dialog-edit-tag-paste"]').text()).to.equal('貼り付け');
  });

  it('クリア操作で選択中タグを空にする', () => {
    const wrapper = createWrapper({
      dialogVisible: true,
      propsRoomTags: [],
      propsPostId: 'post-1',
      propsReplyId: null,
      propsTags: ['t1'],
    });

    wrapper.vm.tags = ['t1'];
    wrapper.vm.clearTags();

    expect(wrapper.vm.tags).to.deep.equal([]);
  });

  it('編集後のキャンセルでは破棄確認を経て閉じる', () => {
    const wrapper = createWrapper({
      dialogVisible: true,
      propsRoomTags: [],
      propsPostId: 'post-1',
      propsReplyId: null,
      propsTags: ['t1'],
    });
    wrapper.vm.openedDialog();
    wrapper.vm.clearTags();

    wrapper.vm.onPressCancelButton();
    expect(wrapper.vm.discardConfirmVisible).to.equal(true);
    expect(wrapper.vm.visible).to.equal(true);

    wrapper.vm.confirmDiscard();
    wrapper.vm.closedDiscardConfirm();
    expect(wrapper.vm.visible).to.equal(false);
  });

  it('外部サービス利用可否にかかわらず全ルームタグを選択・貼り付け・送信できる', () => {
    const wrapper = createWrapper(
      {
        dialogVisible: true,
        propsRoomTags: [
          { _id: 'normal', name: '通常', order: 1 },
          { _id: 'analysis', name: '動画解析', order: 2 },
          { _id: 'new-analysis', name: '音解析', order: 3 },
        ],
        propsPostId: 'post-1',
        propsReplyId: null,
        propsTags: ['analysis', 'normal'],
      },
      {
        store: createStoreMock({
          getters: { openaiAnalysisAvailable: false, tagClipboardList: ['normal', 'analysis'] },
        }),
      }
    );
    wrapper.vm.openedDialog();

    expect(wrapper.find('[data-testid="dialog-edit-tag-checkbox-analysis"]').exists()).to.equal(true);
    expect(wrapper.find('[data-testid="dialog-edit-tag-checkbox-new-analysis"]').exists()).to.equal(true);
    expect(wrapper.find('[data-testid="dialog-edit-tag-checkbox-normal"]').exists()).to.equal(true);

    wrapper.vm.clearTags();
    expect(wrapper.vm.tags).to.deep.equal([]);

    wrapper.vm.pasteCopiedTags();
    expect(wrapper.vm.tags).to.deep.equal(['normal', 'analysis']);

    wrapper.vm.tags = ['analysis', 'new-analysis', 'normal'];
    expect(wrapper.vm.submittableTagIds).to.deep.equal(['analysis', 'new-analysis', 'normal']);
  });

  it('コピー済みタグで選択中タグを置き換える', () => {
    const calls = [];
    const wrapper = createWrapper(
      {
        dialogVisible: true,
        propsRoomTags: [
          { _id: 't1', name: 'tag1', order: 1 },
          { _id: 't2', name: 'tag2', order: 2 },
        ],
        propsPostId: 'post-1',
        propsReplyId: null,
        propsTags: ['t1'],
      },
      {
        store: createStoreMock({
          getters: { tagClipboardList: ['t2', 'missing', 't2'] },
          dispatch: (action, payload) => calls.push({ action, payload }),
        }),
      }
    );

    wrapper.vm.tags = ['t1'];
    wrapper.vm.pasteCopiedTags();

    expect(wrapper.vm.tags).to.deep.equal(['t2']);
    expect(calls).to.deep.equal([
      { action: 'doShowSnackbar', payload: { message: 'タグを貼り付けました', role: 'status' } },
    ]);
  });

  it('投稿更新では投稿用APIを呼ぶ', async () => {
    const calls = [];
    const updatedPost = { _id: 'post-1', room_tags: ['t1'] };
    chatApi.tagPost = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: updatedPost });
    };

    const wrapper = createWrapper({
      dialogVisible: true,
      propsRoomTags: [],
      propsPostId: 'post-1',
      propsReplyId: null,
      propsTags: ['t1'],
    });

    wrapper.setData({ tags: ['t1'] });
    await wrapper.vm.$nextTick();

    wrapper.vm.editTag();
    await flushPromises();

    expect(calls).to.have.lengthOf(1);
    expect(calls[0]).to.include({
      _id: 'post-1',
      room_id: 'room-1',
    });
    expect(calls[0].room_tags).to.deep.equal(['t1']);
    expect(calls[0].target_langs).to.equal(undefined);
    expect(wrapper.emitted().success[0]).to.deep.equal([updatedPost]);
    expect(wrapper.vm.visible).to.equal(false);
  });

  it('返信更新では返信用APIを呼ぶ', async () => {
    const calls = [];
    const updatedPost = { _id: 'post-1', replies: [{ _id: 'reply-1', room_tags: ['t2'] }] };
    chatApi.tagReply = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: updatedPost });
    };

    const wrapper = createWrapper({
      dialogVisible: true,
      propsRoomTags: [],
      propsPostId: 'post-1',
      propsReplyId: 'reply-1',
      propsTags: ['t2'],
    });

    wrapper.setData({ tags: ['t2'] });
    await wrapper.vm.$nextTick();

    wrapper.vm.editTag();
    await flushPromises();

    expect(calls).to.have.lengthOf(1);
    expect(calls[0]).to.include({
      _id: 'reply-1',
      post_id: 'post-1',
      room_id: 'room-1',
    });
    expect(calls[0].room_tags).to.deep.equal(['t2']);
    expect(calls[0].target_langs).to.equal(undefined);
    expect(wrapper.emitted().success[0]).to.deep.equal([updatedPost]);
  });

  it('更新で401エラー時はログアウトしてログイン画面へ遷移する', async () => {
    const dispatchCalls = [];
    chatApi.tagPost = () => Promise.reject({ response: { status: 401 } });

    const wrapper = createWrapper(
      {
        dialogVisible: true,
        propsRoomTags: [],
        propsPostId: 'post-1',
        propsReplyId: null,
        propsTags: ['t1'],
      },
      {
        store: { ...createStoreMock(), dispatch: (type) => dispatchCalls.push(type) },
      }
    );

    wrapper.setData({ tags: ['t1'] });
    await wrapper.vm.$nextTick();
    wrapper.vm.editTag();
    await flushPromises();

    expect(dispatchCalls).to.include('doLogout');
  });
});
