import { expect } from 'vitest';
import { shallowMount } from '../../../helpers/testUtils';
import { createMemoryHistory, createRouter as createVueRouter } from 'vue-router';
import chatApi from '@/api/chat';
import DeleteSupplementDialog from '@/components/timeline/dialogs/DeleteSupplementDialog.vue';

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
  shallowMount(DeleteSupplementDialog, {
    router: overrides.router || createRouter(),
    stubs: baseStubs,
    props: {
      dialogVisible: true,
      propsPostId: 'post-1',
      propsReplyId: null,
      propsSupplement: {
        _id: 'supp-1',
        animation: null,
        content: '削除対象の付加情報',
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

describe('付加情報の削除', () => {
  let originalDeleteSupplement;
  let originalDeleteReplySupplement;

  beforeEach(() => {
    originalDeleteSupplement = chatApi.deleteSupplement;
    originalDeleteReplySupplement = chatApi.deleteReplySupplement;
  });

  afterEach(() => {
    chatApi.deleteSupplement = originalDeleteSupplement;
    chatApi.deleteReplySupplement = originalDeleteReplySupplement;
  });

  it('共通確認ダイアログへ削除操作と対象概要を渡す', () => {
    const wrapper = createWrapper();
    const dialog = wrapper.findComponent(ConfirmDialogStub);

    expect(dialog.props()).to.include({
      dialogVisible: true,
      titleId: 'delete_supplement_dialog_title',
      sending: false,
      confirmTone: 'danger',
      confirmIcon: 'delete',
      closeOnConfirm: false,
      actionsAdjacent: true,
    });
    expect(wrapper.get('.delete-target-summary').text()).to.include('Userの付加情報');
    expect(wrapper.get('.delete-target-summary').text()).to.include('削除対象の付加情報');
  });

  it('キャンセル操作でダイアログが閉じる', () => {
    const wrapper = createWrapper();
    wrapper.setData({ visible: true });

    wrapper.vm.onPressCancelButton();

    expect(wrapper.vm.visible).to.equal(false);
    expect(wrapper.emitted()['content-deleted']).to.equal(undefined);
  });

  it('投稿の付加情報削除は投稿用APIで行う', async () => {
    const calls = { delete: 0, reply: 0 };
    chatApi.deleteSupplement = () => {
      calls.delete += 1;
      return Promise.resolve();
    };
    chatApi.deleteReplySupplement = () => {
      calls.reply += 1;
      return Promise.resolve();
    };

    const wrapper = createWrapper();
    wrapper.vm.deleteSupplement();
    await flushPromises();

    expect(calls.delete).to.equal(1);
    expect(calls.reply).to.equal(0);
    expect(wrapper.vm.visible).to.equal(false);
    expect(wrapper.emitted()['content-deleted']).to.deep.equal([
      [
        {
          contentType: 'supplement',
          actionType: 'delete',
          presentationAnimation: null,
        },
      ],
    ]);
  });

  it('返信の付加情報削除は返信用APIで行う', async () => {
    const calls = { delete: 0, reply: 0 };
    chatApi.deleteSupplement = () => {
      calls.delete += 1;
      return Promise.resolve();
    };
    chatApi.deleteReplySupplement = () => {
      calls.reply += 1;
      return Promise.resolve();
    };

    const wrapper = createWrapper({ props: { propsReplyId: 'reply-1' } });
    wrapper.vm.deleteSupplement();
    await flushPromises();

    expect(calls.delete).to.equal(0);
    expect(calls.reply).to.equal(1);
  });

  it('削除で401エラー時はログアウトしてログイン画面へ遷移する', async () => {
    chatApi.deleteSupplement = () => Promise.reject({ response: { status: 401 } });
    const dispatchCalls = [];
    const wrapper = createWrapper({
      store: {
        ...createStoreMock(),
        dispatch: (type) => dispatchCalls.push(type),
      },
    });

    wrapper.vm.deleteSupplement();
    await flushPromises();

    expect(dispatchCalls).to.include('doLogout');
    expect(wrapper.emitted()['content-deleted']).to.equal(undefined);
  });
});
