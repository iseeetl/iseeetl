import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import kickedUserApi from '@/api/kickedUser';
import KickedUserDialog from '@/components/kicked-user/KickedUserDialog.vue';

import flushPromises from '../../helpers/flushPromises';

const BaseMemberDialogStub = {
  name: 'BaseMemberDialog',
  props: {
    visible: Boolean,
    sending: Boolean,
    titleId: String,
    titleText: String,
    descriptionIds: String,
    closeLabel: String,
    deleteLabel: String,
    actionTone: String,
    actionIcon: String,
    testIdPrefix: String,
    members: Array,
    loadState: String,
    loadingText: String,
    emptyText: String,
    errorText: String,
    retryLabel: String,
    summaryText: String,
    listAriaLabel: String,
    canDelete: Function,
    deleteAriaLabel: Function,
    progressAmount: Number,
  },
  emits: ['opened', 'closed', 'request-close', 'delete', 'retry'],
  template: '<div><slot name="context" /></div>',
  methods: {
    focusDeleteButton() {
      return false;
    },
    focusHeading() {
      return true;
    },
  },
};

const DialogTargetContextStub = {
  name: 'DialogTargetContext',
  props: ['contextId', 'label', 'name'],
  template: '<div />',
};

const createWrapper = (overrides = {}) => {
  const wrapper = shallowMount(KickedUserDialog, {
    stubs: {
      BaseMemberDialog: BaseMemberDialogStub,
      DialogTargetContext: DialogTargetContextStub,
    },
    props: {
      dialogVisible: true,
      floorId: 'floor-1',
      floorTitle: 'Floor title',
      ...(overrides.props || {}),
    },
    mocks: {
      $store: { getters: { floorId: 'floor-1', floorTitle: 'Floor title' }, dispatch: () => {} },
      $router: { push: () => {} },
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });
  const router = (overrides.mocks && overrides.mocks.$router) || { push: () => {} };
  Object.defineProperty(wrapper.vm, '$router', { value: router, configurable: true });
  return wrapper;
};

describe('キック済みユーザの一覧', () => {
  let originalList;

  beforeEach(() => {
    originalList = kickedUserApi.list;
  });

  afterEach(() => {
    kickedUserApi.list = originalList;
  });

  it('指定されたフロアのキック済みユーザを取得する', async () => {
    const calls = [];
    const users = [{ _id: 'k1', user: { _id: 'u1', username: 'User' } }];
    kickedUserApi.list = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: users });
    };
    const wrapper = createWrapper({
      props: { floorId: 'target-floor' },
      mocks: {
        $store: { getters: { floorId: 'stale-floor' }, dispatch: () => {} },
      },
    });

    wrapper.vm.openedDialog();
    await flushPromises();

    expect(calls).to.deep.equal([{ floor_id: 'target-floor' }]);
    expect(wrapper.vm.kickedUsers).to.deep.equal(users);
    expect(wrapper.vm.loadState).to.equal('ready');
  });

  it('対象フロア・取得状態・一覧・解除操作を共通ダイアログへ渡す', () => {
    const wrapper = createWrapper({
      mocks: {
        $t: (key, params) =>
          key === 'kickedUserDialogs.releaseUserAria' ? `${params.username}のキックを解除` : key,
      },
    });
    const dialog = wrapper.findComponent(BaseMemberDialogStub);
    const context = wrapper.findComponent(DialogTargetContextStub);

    expect(context.props()).to.include({
      contextId: 'kicked_user_dialog_context',
      label: '対象フロア',
      name: 'Floor title',
    });
    expect(dialog.props()).to.include({
      descriptionIds: 'kicked_user_dialog_context',
      deleteLabel: '解除',
      actionTone: 'primary',
      actionIcon: 'lock_open',
      loadState: 'loading',
      emptyText: 'kickedUserDialogs.empty',
      errorText: 'キック済みユーザの取得に失敗しました',
    });
    expect(dialog.props('deleteAriaLabel')({ user: { username: 'User' } })).to.equal('Userのキックを解除');
  });

  it('0件と取得失敗を別状態にし、再試行で再取得する', async () => {
    let callCount = 0;
    kickedUserApi.list = () => {
      callCount += 1;
      return callCount === 1 ? Promise.resolve({ data: [] }) : Promise.reject(new Error('failed'));
    };
    const wrapper = createWrapper();
    wrapper.vm.setSnackbar = () => {};
    wrapper.vm.handleAuthError = () => false;

    await wrapper.vm.fetchKickedUser();
    expect(wrapper.vm.loadState).to.equal('empty');

    wrapper.findComponent(BaseMemberDialogStub).vm.$emit('retry');
    await flushPromises();
    expect(wrapper.vm.loadState).to.equal('error');
    expect(callCount).to.equal(2);
  });

  it('件数は取得成功後だけ表示する', async () => {
    const wrapper = createWrapper();
    const dialog = wrapper.findComponent(BaseMemberDialogStub);
    expect(dialog.props('summaryText')).to.equal('');

    await wrapper.setData({ loadState: 'empty' });
    expect(dialog.props('summaryText')).to.equal('全{total}件');
    await wrapper.setData({ loadState: 'error' });
    expect(dialog.props('summaryText')).to.equal('');
  });

  it('GET中も閉じられ、閉鎖後に到着した古い応答を無視する', async () => {
    let resolveRequest;
    kickedUserApi.list = () =>
      new Promise((resolve) => {
        resolveRequest = resolve;
      });
    const wrapper = createWrapper();

    wrapper.vm.fetchKickedUser();
    wrapper.vm.onPressCancelButton();
    expect(wrapper.emitted()['request-close']).to.deep.equal([[]]);

    wrapper.vm.closedDialog();
    resolveRequest({ data: [{ _id: 'late-user' }] });
    await flushPromises();

    expect(wrapper.vm.kickedUsers).to.deep.equal([]);
    expect(wrapper.vm.loadState).to.equal('loading');
  });

  it('対象フロア変更後は先行フロアの遅い応答を無視する', async () => {
    const pending = new Map();
    kickedUserApi.list = ({ floor_id: floorId }) =>
      new Promise((resolve) => {
        pending.set(floorId, resolve);
      });
    const wrapper = createWrapper();

    wrapper.vm.fetchKickedUser();
    await wrapper.setProps({ floorId: 'floor-2' });
    await wrapper.vm.$nextTick();

    pending.get('floor-1')({ data: [{ _id: 'stale-user' }] });
    pending.get('floor-2')({ data: [{ _id: 'current-user' }] });
    await flushPromises();

    expect(wrapper.vm.kickedUsers).to.deep.equal([{ _id: 'current-user' }]);
  });

  it('解除対象を親へ渡し、親一覧は維持する', () => {
    const wrapper = createWrapper();
    const kickedUser = { _id: 'k1', user: { _id: 'u1', username: 'User' } };
    wrapper.setData({ kickedUsers: [kickedUser] });

    wrapper.vm.onPressReleaseButton(kickedUser);

    expect(wrapper.emitted().release[0][0]).to.deep.equal(kickedUser);
    expect(wrapper.vm.kickedUsers).to.deep.equal([kickedUser]);
  });

  it('解除済みユーザを一覧から除き、次の行・前の行・見出しの順でフォーカスを戻す', async () => {
    const wrapper = createWrapper();
    const dialog = wrapper.findComponent(BaseMemberDialogStub);
    const focusedIds = [];
    let headingFocusCount = 0;
    dialog.vm.focusDeleteButton = (id) => {
      focusedIds.push(id);
      return true;
    };
    dialog.vm.focusHeading = () => {
      headingFocusCount += 1;
      return true;
    };
    await wrapper.setData({
      loadState: 'ready',
      kickedUsers: [
        { _id: 'k1', user: { _id: 'u1', username: 'One' } },
        { _id: 'k2', user: { _id: 'u2', username: 'Two' } },
        { _id: 'k3', user: { _id: 'u3', username: 'Three' } },
      ],
    });

    expect(wrapper.vm.applyReleasedUser('u2')).to.equal(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.kickedUsers.map((user) => user._id)).to.deep.equal(['k1', 'k3']);
    expect(focusedIds).to.deep.equal(['k3']);

    expect(wrapper.vm.applyReleasedUser({ _id: 'k3', user: { _id: 'u3' } })).to.equal(true);
    await wrapper.vm.$nextTick();
    expect(focusedIds).to.deep.equal(['k3', 'k1']);

    dialog.vm.focusDeleteButton = () => false;
    expect(wrapper.vm.applyReleasedUser('u1')).to.equal(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.loadState).to.equal('empty');
    expect(headingFocusCount).to.equal(1);
  });

  it('401エラー時はログアウトしてログイン画面へ移動する', () => {
    const dispatchCalls = [];
    const pushCalls = [];
    const wrapper = createWrapper({
      mocks: {
        $store: { getters: { floorId: 'floor-1' }, dispatch: (type) => dispatchCalls.push(type) },
        $router: { push: (payload) => pushCalls.push(payload) },
      },
    });

    expect(wrapper.vm.handleAuthError({ response: { status: 401 } })).to.equal(true);
    expect(dispatchCalls).to.include('doLogout');
    expect(pushCalls).to.deep.equal([{ name: 'Login' }]);
  });
});
