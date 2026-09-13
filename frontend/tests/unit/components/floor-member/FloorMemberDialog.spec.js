import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import floorMemberApi from '@/api/floorMember';
import FloorMemberDialog from '@/components/floor-member/FloorMemberDialog.vue';

import flushPromises from '../../helpers/flushPromises';

const BaseMemberDialogStub = {
  name: 'BaseMemberDialog',
  props: {
    visible: Boolean,
    sending: Boolean,
    titleId: String,
    titleText: String,
    descriptionIds: String,
    guidanceScope: String,
    closeLabel: String,
    deleteLabel: String,
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
  const wrapper = shallowMount(FloorMemberDialog, {
    stubs: {
      BaseMemberDialog: BaseMemberDialogStub,
      DialogTargetContext: DialogTargetContextStub,
    },
    props: {
      dialogVisible: true,
      propsRole: { isAdmin: false, isFloorEditor: false },
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

describe('フロアメンバーの一覧', () => {
  let originalList;

  beforeEach(() => {
    originalList = floorMemberApi.list;
  });

  afterEach(() => {
    floorMemberApi.list = originalList;
  });

  it('dialogVisibleをBaseへ直接渡し、閉鎖要求を親へ通知する', async () => {
    const wrapper = createWrapper({ props: { dialogVisible: false } });
    const dialog = wrapper.findComponent(BaseMemberDialogStub);
    expect(dialog.props('visible')).to.equal(false);

    await wrapper.setProps({ dialogVisible: true });
    expect(dialog.props('visible')).to.equal(true);

    dialog.vm.$emit('request-close');
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted()['request-close']).to.deep.equal([[]]);
    expect(wrapper.emitted().close).to.equal(undefined);
  });

  it('指定されたフロアの一覧を取得してreadyにする', async () => {
    const calls = [];
    floorMemberApi.list = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: [{ _id: 'm1', user: { username: 'Member' } }] });
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
    expect(wrapper.vm.floorMembers).to.have.lengthOf(1);
    expect(wrapper.vm.loadState).to.equal('ready');
  });

  it('対象フロア・取得状態・一覧・削除操作の読み上げ名を共通ダイアログへ渡す', () => {
    const wrapper = createWrapper({
      mocks: {
        $t: (key, params) =>
          key === 'floorMemberDialogs.deleteMemberAria'
            ? `${params.username}をフロアメンバーから削除`
            : key,
      },
    });
    const dialog = wrapper.findComponent(BaseMemberDialogStub);
    const context = wrapper.findComponent(DialogTargetContextStub);

    expect(context.props()).to.include({
      contextId: 'floor_member_dialog_context',
      label: '対象フロア',
      name: 'Floor title',
    });
    expect(dialog.props()).to.include({
      descriptionIds: 'floor_member_dialog_context',
      loadState: 'loading',
      loadingText: '読み込み中です',
      emptyText: 'floorMemberDialogs.empty',
      errorText: 'フロアメンバーの取得に失敗しました',
      retryLabel: '再試行',
      summaryText: '',
    });
    expect(dialog.props('guidanceScope')).to.equal('floor');
    expect(dialog.props('deleteAriaLabel')({ user: { username: 'Member' } })).to.equal(
      'Memberをフロアメンバーから削除'
    );
  });

  it('件数は取得成功後だけ表示する', async () => {
    const wrapper = createWrapper();
    const dialog = wrapper.findComponent(BaseMemberDialogStub);

    expect(dialog.props('summaryText')).to.equal('');
    await wrapper.setData({ loadState: 'empty' });
    expect(dialog.props('summaryText')).to.equal('全{total}件');
    await wrapper.setData({
      loadState: 'ready',
      floorMembers: [{ _id: 'm1', user: { username: 'Member' } }],
    });
    expect(dialog.props('summaryText')).to.equal('全{total}件');
    await wrapper.setData({ loadState: 'error' });
    expect(dialog.props('summaryText')).to.equal('');
  });

  it('0件と取得失敗を別状態にし、再試行で再取得する', async () => {
    let callCount = 0;
    floorMemberApi.list = () => {
      callCount += 1;
      return callCount === 1 ? Promise.resolve({ data: [] }) : Promise.reject(new Error('failed'));
    };
    const wrapper = createWrapper();
    wrapper.vm.setSnackbar = () => {};
    wrapper.vm.handleAuthError = () => false;

    await wrapper.vm.fetchFloorMember();
    expect(wrapper.vm.loadState).to.equal('empty');

    wrapper.findComponent(BaseMemberDialogStub).vm.$emit('retry');
    await flushPromises();
    expect(callCount).to.equal(2);
    expect(wrapper.vm.loadState).to.equal('error');
  });

  it('GET中も閉じられ、閉鎖後に到着した古い応答を無視する', async () => {
    let resolveRequest;
    floorMemberApi.list = () =>
      new Promise((resolve) => {
        resolveRequest = resolve;
      });
    const wrapper = createWrapper();

    wrapper.vm.fetchFloorMember();
    expect(wrapper.vm.loading).to.equal(true);
    wrapper.vm.onPressCancelButton();
    expect(wrapper.emitted()['request-close']).to.deep.equal([[]]);

    wrapper.vm.closedDialog();
    resolveRequest({ data: [{ _id: 'late-member' }] });
    await flushPromises();

    expect(wrapper.vm.floorMembers).to.deep.equal([]);
    expect(wrapper.vm.loadState).to.equal('loading');
  });

  it('対象フロア変更後は先行フロアの遅い応答を無視する', async () => {
    const pending = new Map();
    floorMemberApi.list = ({ floor_id: floorId }) =>
      new Promise((resolve) => {
        pending.set(floorId, resolve);
      });
    const wrapper = createWrapper();

    wrapper.vm.fetchFloorMember();
    await wrapper.setProps({ floorId: 'floor-2' });
    await wrapper.vm.$nextTick();

    pending.get('floor-1')({ data: [{ _id: 'stale-member' }] });
    pending.get('floor-2')({ data: [{ _id: 'current-member' }] });
    await flushPromises();

    expect(wrapper.vm.floorMembers).to.deep.equal([{ _id: 'current-member' }]);
  });

  it('削除済みメンバーを一覧から除き、次・前・見出しの順でフォーカスを復帰する', async () => {
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
      floorMembers: [
        { _id: 'm1', user: { username: 'One' } },
        { _id: 'm2', user: { username: 'Two' } },
        { _id: 'm3', user: { username: 'Three' } },
      ],
    });

    expect(wrapper.vm.applyDeletedMember('m2')).to.equal(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.floorMembers.map((member) => member._id)).to.deep.equal(['m1', 'm3']);
    expect(focusedIds).to.deep.equal(['m3']);

    expect(wrapper.vm.applyDeletedMember('m3')).to.equal(true);
    await wrapper.vm.$nextTick();
    expect(focusedIds).to.deep.equal(['m3', 'm1']);

    dialog.vm.focusDeleteButton = () => false;
    expect(wrapper.vm.applyDeletedMember('m1')).to.equal(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.loadState).to.equal('empty');
    expect(headingFocusCount).to.equal(1);
  });

  it('deleteは対象を維持したまま親へ通知する', () => {
    const wrapper = createWrapper();
    const member = { _id: 'm1' };
    wrapper.vm.onPressDeleteButton(member);

    expect(wrapper.emitted().delete[0][0]).to.deep.equal(member);
    expect(wrapper.vm.floorMembers).to.deep.equal([]);
  });

  it('削除可否は管理者またはフロア作成者の権限で判定する', async () => {
    const wrapper = createWrapper();
    await wrapper.setData({ role: { isAdmin: true } });
    expect(wrapper.vm.canDeleteMember()).to.equal(true);
    await wrapper.setData({ role: { isFloorEditor: true } });
    expect(wrapper.vm.canDeleteMember()).to.equal(true);
    await wrapper.setData({ role: { isAdmin: false, isFloorEditor: false } });
    expect(wrapper.vm.canDeleteMember()).to.equal(false);
  });

  it('401エラー時はログアウトしてログイン画面へ移動する', () => {
    const dispatchCalls = [];
    const pushCalls = [];
    const wrapper = createWrapper({
      mocks: {
        $store: { getters: { floorId: 'floor-1' }, dispatch: (type) => dispatchCalls.push(type) },
        $router: { push: (payload) => pushCalls.push(payload) },
        $t: (key) => key,
      },
    });

    expect(wrapper.vm.handleAuthError({ response: { status: 401 } })).to.equal(true);
    expect(dispatchCalls).to.include('doLogout');
    expect(pushCalls).to.deep.equal([{ name: 'Login' }]);
  });
});
