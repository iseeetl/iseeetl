import { expect } from 'vitest';
import { shallowMount } from '../../../helpers/testUtils';
import { createMemoryHistory, createRouter as createVueRouter } from 'vue-router';
import chatApi from '@/api/chat';
import DeleteReplyDialog from '@/components/timeline/dialogs/DeleteReplyDialog.vue';

import flushPromises from '../../../helpers/flushPromises';
const createRouter = () => {
  const router = createVueRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/login', name: 'Login' }],
  });
  router.push = () => Promise.resolve();
  return router;
};

const ConfirmDialogStub = {
  name: 'ConfirmDialog',
  props: ['dialogVisible', 'titleId', 'sending', 'confirmTone', 'confirmIcon', 'closeOnConfirm', 'actionsAdjacent'],
  template: '<div><slot/></div>',
};

const baseStubs = {
  ConfirmDialog: ConfirmDialogStub,
};

const createStoreMock = (overrides = {}) => ({
  getters: {
    floorId: 'floor-1',
    roomId: 'room-1',
    floorTitle: 'Floor',
    roomTitle: 'Room',
    userId: 'user-1',
    userName: 'User',
    ...overrides.getters,
  },
  dispatch: () => {},
});

const createWrapper = (overrides = {}) =>
  shallowMount(DeleteReplyDialog, {
    router: overrides.router || createRouter(),
    stubs: baseStubs,
    props: {
      dialogVisible: true,
      propsPostId: 'post-1',
      propsReplyValue: {
        _id: 'reply-1',
        animation: null,
        room_tags: ['tag-2'],
        content: '削除対象の返信',
        user: { username: 'User' },
      },
      ...(overrides.props || {}),
    },
    mocks: {
      $store: overrides.store || createStoreMock(),
      $t: (key, params = {}) => Object.entries(params).reduce((text, [name, value]) => text.replace(`{${name}}`, value), key),
      ...(overrides.mocks || {}),
    },
  });

describe('返信の削除', () => {
  let originalDeleteReply;

  beforeEach(() => {
    originalDeleteReply = chatApi.deleteReply;
  });

  afterEach(() => {
    chatApi.deleteReply = originalDeleteReply;
  });

  it('共通確認ダイアログへ削除操作と対象概要を渡す', () => {
    const wrapper = createWrapper();
    const dialog = wrapper.findComponent(ConfirmDialogStub);

    expect(dialog.props()).to.include({
      dialogVisible: true,
      titleId: 'delete_reply_dialog_title',
      sending: false,
      confirmTone: 'danger',
      confirmIcon: 'delete',
      closeOnConfirm: false,
      actionsAdjacent: true,
    });
    expect(wrapper.get('.delete-target-summary').text()).to.include('Userの返信');
    expect(wrapper.get('.delete-target-summary').text()).to.include('削除対象の返信');
  });

  it('キャンセル操作でダイアログが閉じる', () => {
    const wrapper = createWrapper();
    wrapper.setData({ visible: true });

    wrapper.vm.onPressCancelButton();

    expect(wrapper.vm.visible).to.equal(false);
    expect(wrapper.emitted()['content-deleted']).to.equal(undefined);
  });

  it('削除操作で削除処理を呼ぶ', () => {
    const wrapper = createWrapper();
    let called = 0;
    wrapper.vm.deleteReply = () => {
      called += 1;
    };

    wrapper.vm.onPressDoneButton();

    expect(called).to.equal(1);
  });

  it('削除処理はAPIに削除情報を送る', async () => {
    const calls = [];
    chatApi.deleteReply = (payload) => {
      calls.push(payload);
      return Promise.resolve();
    };

    const wrapper = createWrapper();
    wrapper.vm.deleteReply();
    await flushPromises();

    expect(calls).to.have.lengthOf(1);
    expect(calls[0]).to.deep.equal({
      room_id: 'room-1',
      post_id: 'post-1',
      _id: 'reply-1',
    });
    expect(wrapper.vm.visible).to.equal(false);
    expect(wrapper.emitted()['content-deleted']).to.deep.equal([
      [
        {
          contentType: 'reply',
          actionType: 'delete',
          presentationAnimation: null,
          previousTagIds: ['tag-2'],
        },
      ],
    ]);
  });

  it('削除で401エラー時はログアウトしてログイン画面へ遷移する', async () => {
    chatApi.deleteReply = () => Promise.reject({ response: { status: 401 } });
    const dispatchCalls = [];
    const wrapper = createWrapper({
      store: {
        ...createStoreMock(),
        dispatch: (type) => dispatchCalls.push(type),
      },
    });

    wrapper.vm.deleteReply();
    await flushPromises();

    expect(dispatchCalls).to.include('doLogout');
    expect(wrapper.emitted()['content-deleted']).to.equal(undefined);
  });
});
