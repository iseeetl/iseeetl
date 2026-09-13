import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import roomMemberApi from '@/api/roomMember';
import RoomMemberDialog from '@/components/room-member/RoomMemberDialog.vue';

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
  const wrapper = shallowMount(RoomMemberDialog, {
    stubs: {
      BaseMemberDialog: BaseMemberDialogStub,
      DialogTargetContext: DialogTargetContextStub,
    },
    props: {
      dialogVisible: true,
      canDeleteMembers: false,
      roomId: 'room-1',
      roomTitle: 'Room title',
      ...(overrides.props || {}),
    },
    mocks: {
      $store: { getters: { roomId: 'room-1' }, dispatch: () => {} },
      $router: { push: () => {} },
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });
  const router = (overrides.mocks && overrides.mocks.$router) || { push: () => {} };
  Object.defineProperty(wrapper.vm, '$router', { value: router, configurable: true });
  return wrapper;
};

describe('ルームメンバーの一覧', () => {
  let original = {};

  beforeEach(() => {
    original.listApi = roomMemberApi.list;
  });

  afterEach(() => {
    roomMemberApi.list = original.listApi;
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
    expect(dialog.props('visible')).to.equal(true);
    expect(wrapper.vm).not.to.have.property('visible');
  });

  it('sending中は閉鎖要求を親へ通知しない', async () => {
    const wrapper = createWrapper();
    const dialog = wrapper.findComponent(BaseMemberDialogStub);
    await wrapper.setData({ sending: true });

    dialog.vm.$emit('request-close');
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted()['request-close']).to.equal(undefined);
  });

  it('指定されたルームの一覧を取得してUIを初期化する', async () => {
    const apiCalls = [];
    roomMemberApi.list = (payload) => {
      apiCalls.push(payload);
      return Promise.resolve({ data: [{ _id: 'm1' }] });
    };

    const wrapper = createWrapper({
      props: { roomId: 'target-room' },
      mocks: {
        $store: { getters: { roomId: 'stale-room' }, dispatch: () => {} },
      },
    });
    wrapper.vm.openedDialog();
    await flushPromises();

    expect(apiCalls).to.deep.equal([{ room_id: 'target-room' }]);
    expect(wrapper.vm.roomMembers).to.deep.equal([{ _id: 'm1' }]);
    expect(wrapper.vm.loadState).to.equal('ready');
    expect(wrapper.vm.sending).to.equal(false);
  });

  it('対象ルームIDがなければAPIを呼ばずエラー状態にする', async () => {
    let called = false;
    roomMemberApi.list = () => {
      called = true;
      return Promise.resolve({ data: [] });
    };
    const wrapper = createWrapper({ props: { roomId: '' } });

    await wrapper.vm.fetchRoomMember();

    expect(called).to.equal(false);
    expect(wrapper.vm.loadState).to.equal('error');
    expect(wrapper.vm.loading).to.equal(false);
  });

  it('loading中のfetchRoomMemberはAPIを重複して呼ばない', () => {
    const apiCalls = [];
    roomMemberApi.list = (payload) => {
      apiCalls.push(payload);
      return Promise.resolve({ data: [] });
    };

    const wrapper = createWrapper();
    wrapper.setData({ loading: true });

    wrapper.vm.fetchRoomMember();

    expect(apiCalls).to.deep.equal([]);
  });

  it('Baseのclosed後に値をクリアしてcloseを通知する', async () => {
    const wrapper = createWrapper();
    await wrapper.setData({ sending: false, roomMembers: [{ _id: 'm1' }] });

    wrapper.findComponent(BaseMemberDialogStub).vm.$emit('closed');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.roomMembers).to.deep.equal([]);
    expect(wrapper.vm.loadState).to.equal('loading');
    expect(wrapper.emitted().close).to.have.lengthOf(1);
  });

  it('翻訳済みの対象ルーム・件数・取得状態・削除操作の読み上げ用の名前を共通ダイアログへ渡す', () => {
    const wrapper = createWrapper({
      mocks: {
        $t: (key, params) =>
          key === 'roomMemberDialogs.deleteMemberAria'
            ? `${params.username}をルームメンバーから削除`
            : key,
      },
    });
    const dialog = wrapper.findComponent(BaseMemberDialogStub);
    const context = wrapper.findComponent(DialogTargetContextStub);

    expect(context.props()).to.include({
      contextId: 'room_member_dialog_context',
      label: '対象ルーム',
      name: 'Room title',
    });
    expect(dialog.props()).to.include({
      descriptionIds: 'room_member_dialog_context',
      loadState: 'loading',
      loadingText: '読み込み中です',
      emptyText: 'roomMemberDialogs.empty',
      errorText: 'ルームメンバーの取得に失敗しました',
      retryLabel: '再試行',
      summaryText: '',
    });
    expect(dialog.props('guidanceScope')).to.equal('room');
    expect(dialog.props('deleteAriaLabel')({ user: { username: 'Member' } })).to.equal(
      'Memberをルームメンバーから削除'
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
      roomMembers: [{ _id: 'm1', user: { username: 'Member' } }],
    });
    expect(dialog.props('summaryText')).to.equal('全{total}件');
    await wrapper.setData({ loadState: 'error' });
    expect(dialog.props('summaryText')).to.equal('');
  });

  it('0件と取得失敗を別状態にし、再試行で再取得する', async () => {
    let callCount = 0;
    roomMemberApi.list = () => {
      callCount += 1;
      return callCount === 1 ? Promise.resolve({ data: [] }) : Promise.reject(new Error('failed'));
    };
    const wrapper = createWrapper();
    wrapper.vm.setSnackbar = () => {};
    wrapper.vm.handleAuthError = () => false;

    await wrapper.vm.fetchRoomMember();
    expect(wrapper.vm.loadState).to.equal('empty');

    wrapper.findComponent(BaseMemberDialogStub).vm.$emit('retry');
    await flushPromises();
    expect(callCount).to.equal(2);
    expect(wrapper.vm.loadState).to.equal('error');
  });

  it('GET中も閉鎖要求を通知し、閉鎖後に到着した古い応答を無視する', async () => {
    let resolveRequest;
    roomMemberApi.list = () =>
      new Promise((resolve) => {
        resolveRequest = resolve;
      });
    const wrapper = createWrapper();

    wrapper.vm.fetchRoomMember();
    expect(wrapper.vm.loading).to.equal(true);
    wrapper.vm.onPressCancelButton();
    expect(wrapper.emitted()['request-close']).to.deep.equal([[]]);

    wrapper.vm.closedDialog();
    resolveRequest({ data: [{ _id: 'late-member' }] });
    await flushPromises();

    expect(wrapper.vm.roomMembers).to.deep.equal([]);
    expect(wrapper.vm.loadState).to.equal('loading');
  });

  it('対象ルームが変わると新しい一覧を取得し、先行ルームの遅い応答を無視する', async () => {
    const pending = new Map();
    roomMemberApi.list = ({ room_id: roomId }) =>
      new Promise((resolve) => {
        pending.set(roomId, resolve);
      });
    const wrapper = createWrapper();

    wrapper.vm.fetchRoomMember();
    await wrapper.setProps({ roomId: 'room-2' });
    await wrapper.vm.$nextTick();

    pending.get('room-1')({ data: [{ _id: 'stale-member' }] });
    pending.get('room-2')({ data: [{ _id: 'current-member' }] });
    await flushPromises();

    expect(wrapper.vm.roomMembers).to.deep.equal([{ _id: 'current-member' }]);
    expect(wrapper.vm.loadState).to.equal('ready');
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
      roomMembers: [
        { _id: 'm1', user: { username: 'One' } },
        { _id: 'm2', user: { username: 'Two' } },
        { _id: 'm3', user: { username: 'Three' } },
      ],
    });

    expect(wrapper.vm.applyDeletedMember('m2')).to.equal(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.roomMembers.map((member) => member._id)).to.deep.equal(['m1', 'm3']);
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

  it('sending中はcloseを通知しない', () => {
    const wrapper = createWrapper();
    wrapper.setData({ sending: true });

    wrapper.vm.closedDialog();

    expect(wrapper.emitted().close).to.equal(undefined);
  });

  it('onPressDeleteButtonはdeleteを通知する', () => {
    const wrapper = createWrapper();
    const member = { _id: 'm1' };

    wrapper.vm.onPressDeleteButton(member);

    expect(wrapper.emitted().delete[0][0]).to.deep.equal(member);
  });

  it('canDeleteMemberは親画面で判定した削除可否を返す', async () => {
    const wrapper = createWrapper();

    expect(wrapper.vm.canDeleteMember()).to.equal(false);

    await wrapper.setProps({ canDeleteMembers: true });
    expect(wrapper.vm.canDeleteMember()).to.equal(true);
  });

  it('401エラー時はログアウトしてログイン画面へ移動する', () => {
    const dispatchCalls = [];
    const pushCalls = [];
    const wrapper = createWrapper({
      mocks: {
        $store: { getters: { roomId: 'room-1' }, dispatch: (type) => dispatchCalls.push(type) },
        $router: { push: (payload) => pushCalls.push(payload) },
        $t: (key) => key,
      },
    });

    const result = wrapper.vm.handleAuthError({ response: { status: 401 } });

    expect(result).to.equal(true);
    expect(dispatchCalls).to.include('doLogout');
    expect(pushCalls).to.deep.equal([{ name: 'Login' }]);
  });
});
