import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import QuickTextManagement from '@/views/management/QuickTextManagement.vue';
import quickTextAPI from '@/api/quickText';
import { createMountOptions, createStoreMock, buildViewWithoutLifecycle } from './helpers';

import flushPromises from '../../helpers/flushPromises';

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const UiButtonStub = {
  name: 'UiButton',
  inheritAttrs: false,
  props: ['disabled', 'appearance', 'tone', 'density', 'iconOnly'],
  template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>',
};

const UiIconStub = {
  name: 'UiIcon',
  props: ['name'],
  template: '<i :data-name="name" />',
};

const DraggableStub = {
  name: 'Draggable',
  inheritAttrs: false,
  props: ['list', 'group', 'disabled'],
  emits: ['end'],
  template:
    '<ul v-bind="$attrs"><slot name="item" v-for="element in list" :key="element._id" :element="element" /></ul>',
};

const quickTextTranslate = (key, params = {}) => {
  const messages = {
    'managementUi.createQuickTextItemAria': 'Create a word in group "{group}"',
    'managementUi.editQuickTextGroupAria': 'Edit word group "{group}"',
    'managementUi.deleteQuickTextGroupAria': 'Delete word group "{group}"',
    'managementUi.editQuickTextItemAria': 'Edit word "{item}" in group "{group}"',
    'managementUi.deleteQuickTextItemAria': 'Delete word "{item}" in group "{group}"',
    'managementUi.retry': 'Retry',
    'managementUi.empty': 'No data',
  };
  const message = messages[key] || key;
  return message.replace(/\{(\w+)\}/gu, (match, name) => (name in params ? params[name] : match));
};

const createRenderedWrapper = (store = createStoreMock()) => {
  const View = buildViewWithoutLifecycle(QuickTextManagement);
  return shallowMount(
    View,
    createMountOptions({
      store,
      stubs: {
        draggable: DraggableStub,
        UiButton: UiButtonStub,
        UiIcon: UiIconStub,
      },
      mocks: { $t: quickTextTranslate },
    })
  );
};

describe('単語の管理画面', () => {
  let originalGetGroupsAll;
  let originalUpdateGroup;
  let originalUpdateItem;
  let originalDeleteGroup;
  let originalDeleteItem;
  let originalGetItems;

  beforeEach(() => {
    originalGetGroupsAll = quickTextAPI.getGroupsAll;
    originalUpdateGroup = quickTextAPI.updateGroup;
    originalUpdateItem = quickTextAPI.updateItem;
    originalDeleteGroup = quickTextAPI.deleteGroup;
    originalDeleteItem = quickTextAPI.deleteItem;
    originalGetItems = quickTextAPI.getItems;
  });

  afterEach(() => {
    quickTextAPI.getGroupsAll = originalGetGroupsAll;
    quickTextAPI.updateGroup = originalUpdateGroup;
    quickTextAPI.updateItem = originalUpdateItem;
    quickTextAPI.deleteGroup = originalDeleteGroup;
    quickTextAPI.deleteItem = originalDeleteItem;
    quickTextAPI.getItems = originalGetItems;
  });

  it('created は管理者の場合に fetchGroupsAll を呼ぶ', () => {
    let calls = 0;
    QuickTextManagement.created.call({
      userRole: 'Administrator',
      fetchGroupsAll: () => {
        calls += 1;
      },
    });

    expect(calls).to.equal(1);
  });

  it('created は管理者以外では fetchGroupsAll を呼ばない', () => {
    let calls = 0;
    QuickTextManagement.created.call({
      userRole: 'User',
      fetchGroupsAll: () => {
        calls += 1;
      },
    });

    expect(calls).to.equal(0);
  });

  it('管理用グループ取得でAPIを呼ぶ', async () => {
    const calls = [];
    quickTextAPI.getGroupsAll = (token, options) => {
      calls.push({ token, options });
      return Promise.resolve({ data: [] });
    };

    const View = buildViewWithoutLifecycle(QuickTextManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({
        store: createStoreMock({
          state: { user: { role: 'Administrator', isLogin: true, token: 'token-1' } },
        }),
      })
    );

    await wrapper.vm.fetchGroupsAll();

    expect(calls[0]).to.deep.equal({ token: 'token-1', options: { resource: 'management' } });
    expect(wrapper.vm.groups).to.deep.equal([]);
  });

  it('初期読込中を表示し、0件取得後は空状態を表示する', async () => {
    let resolveGroups;
    quickTextAPI.getGroupsAll = () =>
      new Promise((resolve) => {
        resolveGroups = resolve;
      });
    const wrapper = createRenderedWrapper();

    const fetchPromise = wrapper.vm.fetchGroupsAll();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[role="status"]').text()).to.equal('読み込み中です');
    expect(wrapper.vm.sending).to.equal(true);

    resolveGroups({ data: [] });
    await fetchPromise;
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[role="status"]').exists()).to.equal(false);
    expect(wrapper.text()).to.contain('No data');
    expect(wrapper.vm.groupsLoaded).to.equal(true);
  });

  it('グループ取得失敗を空状態と区別し、再試行できる', async () => {
    quickTextAPI.getGroupsAll = () => Promise.reject(new Error('network'));
    const wrapper = createRenderedWrapper();

    await wrapper.vm.fetchGroupsAll();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[role="alert"]').text()).to.contain('単語グループの取得に失敗しました');
    expect(wrapper.text()).not.to.contain('No data');
    expect(wrapper.find('[data-testid="quicktext-groups-retry"]').exists()).to.equal(true);

    quickTextAPI.getGroupsAll = () => Promise.resolve({ data: [] });
    await wrapper.find('[data-testid="quicktext-groups-retry"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[role="alert"]').exists()).to.equal(false);
    expect(wrapper.text()).to.contain('No data');
  });

  it('単語取得失敗を空状態と区別し、当該グループだけ再試行できる', async () => {
    quickTextAPI.getItems = () => Promise.reject(new Error('network'));
    const wrapper = createRenderedWrapper();
    await wrapper.setData({
      groups: [{ _id: 'g1', title: 'Group 1', order: 1, lang: 'ja' }],
      groupsLoaded: true,
      itemsByGroupId: { g1: [] },
    });

    await wrapper.vm.fetchItemsForGroup('g1');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[role="alert"]').text()).to.contain('単語の取得に失敗しました');
    expect(wrapper.find('.empty-state-caption').exists()).to.equal(false);
    expect(wrapper.find('[data-testid="quicktext-items-retry"]').exists()).to.equal(true);

    quickTextAPI.getItems = () => Promise.resolve({ data: [] });
    await wrapper.find('[data-testid="quicktext-items-retry"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[role="alert"]').exists()).to.equal(false);
    expect(wrapper.find('.empty-state-caption').text()).to.equal('単語がありません');
  });

  it('単語保存後の更新を優先し、先行していた取得の古い応答を反映しない', async () => {
    const firstRequest = createDeferred();
    const savedRefresh = createDeferred();
    let getItemsCalls = 0;
    quickTextAPI.getItems = () => {
      getItemsCalls += 1;
      return getItemsCalls === 1 ? firstRequest.promise : savedRefresh.promise;
    };
    const wrapper = createRenderedWrapper();
    await wrapper.setData({
      groups: [{ _id: 'g1', title: 'Group 1', order: 1, lang: 'ja' }],
      groupsLoaded: true,
      itemsByGroupId: { g1: [{ _id: 'before', label: 'Before', order: 1 }] },
      itemDialogGroup: { _id: 'g1', title: 'Group 1' },
      itemDialogVisible: true,
    });

    const initialLoad = wrapper.vm.fetchItemsForGroup('g1');
    await wrapper.vm.$nextTick();
    const afterSave = wrapper.vm.onItemSaved();
    await wrapper.vm.$nextTick();

    expect(getItemsCalls).to.equal(2);
    expect(wrapper.vm.isItemsLoading('g1')).to.equal(true);

    savedRefresh.resolve({ data: [{ _id: 'saved', label: 'Saved', order: 1 }] });
    await afterSave;
    firstRequest.resolve({ data: [{ _id: 'stale', label: 'Stale', order: 1 }] });
    await initialLoad;

    expect(wrapper.vm.itemsByGroupId.g1.map((item) => item._id)).to.deep.equal(['saved']);
    expect(wrapper.vm.isItemsLoading('g1')).to.equal(false);
    expect(wrapper.vm.itemDialogVisible).to.equal(false);
  });

  it('単語更新中は当該グループの作成・編集・削除・ドラッグ並び替えを防ぐ', async () => {
    const updateCalls = [];
    quickTextAPI.updateItem = (...args) => {
      updateCalls.push(args);
      return Promise.resolve();
    };
    const wrapper = createRenderedWrapper();
    const group = { _id: 'g1', title: 'Group 1', order: 1, lang: 'ja' };
    const firstItem = { _id: 'i1', label: 'Item 1', order: 1, lang: 'ja' };
    await wrapper.setData({
      groups: [group],
      groupsLoaded: true,
      itemsByGroupId: {
        g1: [firstItem, { _id: 'i2', label: 'Item 2', order: 2, lang: 'ja' }],
      },
      itemsLoadingByGroupId: { g1: true },
    });

    ['quicktext-item-create', 'quicktext-item-edit', 'quicktext-item-delete'].forEach((testId) => {
      expect(wrapper.find(`[data-testid="${testId}"]`).attributes('disabled')).not.to.equal(undefined);
    });

    await wrapper.vm.onItemsDragEnd('g1', { newIndex: 1, oldIndex: 0 });
    wrapper.vm.openItemDialog(firstItem, group);
    wrapper.vm.confirmDeleteItem(firstItem, group);

    expect(updateCalls).to.deep.equal([]);
    expect(wrapper.vm.itemsByGroupId.g1.map((item) => item._id)).to.deep.equal(['i1', 'i2']);
    expect(wrapper.vm.itemDialogVisible).to.equal(false);
    expect(wrapper.vm.confirmVisible).to.equal(false);
  });

  it('管理者以外は管理用グループ取得を行わない', async () => {
    const calls = [];
    quickTextAPI.getGroupsAll = (...args) => {
      calls.push(args);
      return Promise.resolve({ data: [] });
    };

    const View = buildViewWithoutLifecycle(QuickTextManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({
        store: createStoreMock({
          state: { user: { role: 'User', isLogin: true, token: 'token-2' } },
        }),
      })
    );

    await wrapper.vm.fetchGroupsAll();

    expect(calls).to.deep.equal([]);
  });

  it('移動ボタンを表示せず、ドラッグハンドルを非ボタン要素として維持する', async () => {
    const wrapper = createRenderedWrapper();
    await wrapper.setData({
      groups: [{ _id: 'g1', title: 'Group 1', order: 1, lang: 'ja' }],
      groupsLoaded: true,
      itemsByGroupId: { g1: [{ _id: 'i1', label: 'Item 1', order: 1, lang: 'ja' }] },
    });

    expect(wrapper.find('[data-testid*="-move-"]').exists()).to.equal(false);
    expect(wrapper.find('.group-handle').element.tagName).to.equal('SPAN');
    expect(wrapper.find('.item-handle').element.tagName).to.equal('SPAN');
    expect(wrapper.find('.group-handle').attributes('aria-hidden')).to.equal('true');
    expect(wrapper.find('.item-handle').attributes('aria-hidden')).to.equal('true');
  });

  it('単語作成を行操作と分け、グループと単語の行操作を削除、編集の順で表示する', async () => {
    const wrapper = createRenderedWrapper();
    await wrapper.setData({
      groups: [{ _id: 'g1', title: 'Group 1', order: 1, lang: 'ja' }],
      groupsLoaded: true,
      itemsByGroupId: {
        g1: [{ _id: 'i1', label: 'Item 1', order: 1, lang: 'ja' }],
      },
    });

    expect(
      wrapper.find('.group-item-create-actions [data-testid="quicktext-item-create"]').exists()
    ).to.equal(true);
    expect(wrapper.find('.group-row-actions [data-testid="quicktext-item-create"]').exists()).to.equal(false);
    expect(wrapper.find('.group-row-actions').findAll('button').map((button) => button.text())).to.deep.equal([
      '削除',
      '編集',
    ]);
    expect(wrapper.find('.item-actions-row').findAll('button').map((button) => button.text())).to.deep.equal([
      '削除',
      '編集',
    ]);
  });

  it('反復する作成・編集・削除操作の読み上げ用の名前に対象名と所属グループを含める', async () => {
    const wrapper = createRenderedWrapper();
    await wrapper.setData({
      groups: [{ _id: 'g1', title: 'Group 1', order: 1, lang: 'ja' }],
      groupsLoaded: true,
      itemsByGroupId: { g1: [{ _id: 'i1', label: 'Item 1', order: 1, lang: 'ja' }] },
    });

    expect(wrapper.find('[data-testid="quicktext-item-create"]').attributes('aria-label')).to.equal(
      'Create a word in group "Group 1"'
    );
    expect(wrapper.find('[data-testid="quicktext-group-delete"]').attributes('aria-label')).to.equal(
      'Delete word group "Group 1"'
    );
    expect(wrapper.find('[data-testid="quicktext-group-edit"]').attributes('aria-label')).to.equal(
      'Edit word group "Group 1"'
    );
    expect(wrapper.find('[data-testid="quicktext-item-delete"]').attributes('aria-label')).to.equal(
      'Delete word "Item 1" in group "Group 1"'
    );
    expect(wrapper.find('[data-testid="quicktext-item-edit"]').attributes('aria-label')).to.equal(
      'Edit word "Item 1" in group "Group 1"'
    );
  });

  it('並び替え更新中の重複操作を防ぐ', async () => {
    let resolveUpdate;
    const updatePromise = new Promise((resolve) => {
      resolveUpdate = resolve;
    });
    const calls = [];
    quickTextAPI.updateGroup = (token, payload) => {
      calls.push({ token, payload });
      return updatePromise;
    };
    const wrapper = createRenderedWrapper();
    await wrapper.setData({
      groups: [
        { _id: 'g1', title: 'Group 1', order: 1, lang: 'ja' },
        { _id: 'g2', title: 'Group 2', order: 2, lang: 'ja' },
      ],
      groupsLoaded: true,
      itemsByGroupId: { g1: [], g2: [] },
    });

    await wrapper.setData({ groups: [wrapper.vm.groups[1], wrapper.vm.groups[0]] });
    const firstMove = wrapper.vm.onGroupsDragEnd({ newIndex: 1, oldIndex: 0 });
    await wrapper.vm.$nextTick();
    await wrapper.vm.onGroupsDragEnd({ newIndex: 0, oldIndex: 1 });

    expect(wrapper.vm.sending).to.equal(true);
    expect(calls).to.have.lengthOf(2);
    wrapper
      .findAll('[data-testid^="quicktext-"]')
      .forEach((button) => expect(button.attributes('disabled')).not.to.equal(undefined));

    resolveUpdate();
    await firstMove;
    expect(wrapper.vm.sending).to.equal(false);
    expect(calls).to.have.lengthOf(2);
  });

  it('onGroupsDragEndで401発生時はログアウトし再取得を行う', async () => {
    quickTextAPI.updateGroup = () => Promise.reject({ response: { status: 401 } });

    const dispatchCalls = [];
    const pushCalls = [];
    const View = buildViewWithoutLifecycle(QuickTextManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({
        store: createStoreMock({
          dispatch: (type, payload) => dispatchCalls.push({ type, payload }),
          state: { user: { role: 'Administrator', isLogin: true, token: 'token-3' } },
        }),
      })
    );
    wrapper.vm.$router.push = (payload) => pushCalls.push(payload);

    let refetchCalls = 0;
    wrapper.vm.fetchGroupsAll = () => {
      refetchCalls += 1;
      return Promise.resolve();
    };

    wrapper.setData({
      groups: [
        { _id: 'g1', order: 1 },
        { _id: 'g2', order: 2 },
      ],
    });

    await wrapper.vm.onGroupsDragEnd({ newIndex: 1, oldIndex: 0 });

    expect(dispatchCalls.some((c) => c.type === 'doLogout')).to.equal(true);
    expect(pushCalls).to.deep.equal([{ name: 'Login' }]);
    expect(refetchCalls).to.equal(1);
  });

  it('onGroupsDragEndが401以外で失敗した場合は並び順を巻き戻す', async () => {
    quickTextAPI.updateGroup = () => Promise.reject(new Error('network'));

    const dispatchCalls = [];
    const View = buildViewWithoutLifecycle(QuickTextManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({
        store: createStoreMock({
          dispatch: (type, payload) => dispatchCalls.push({ type, payload }),
          state: { user: { role: 'Administrator', isLogin: true, token: 'token-3' } },
        }),
      })
    );
    wrapper.setData({
      groups: [
        { _id: 'g2', order: 1 },
        { _id: 'g1', order: 2 },
      ],
    });

    await wrapper.vm.onGroupsDragEnd({ newIndex: 1, oldIndex: 0 });
    await flushPromises();

    expect(wrapper.vm.groups.map((g) => g._id)).to.deep.equal(['g1', 'g2']);
    expect(dispatchCalls.some((c) => c.type === 'doLogout')).to.equal(false);
  });

  it('onItemsDragEndは並び替え順でupdateItemを呼ぶ', async () => {
    const calls = [];
    quickTextAPI.updateItem = (token, payload) => {
      calls.push({ token, payload });
      return Promise.resolve();
    };

    const View = buildViewWithoutLifecycle(QuickTextManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({
        store: createStoreMock({
          state: { user: { role: 'Administrator', isLogin: true, token: 'token-1' } },
        }),
      })
    );
    wrapper.setData({
      itemsByGroupId: {
        g1: [
          { _id: 'i1', order: 10 },
          { _id: 'i2', order: 20 },
        ],
      },
    });
    await wrapper.vm.$nextTick();

    await wrapper.vm.onItemsDragEnd('g1');

    expect(calls).to.deep.equal([
      { token: 'token-1', payload: { resource: 'management', id: 'i1', order: 1 } },
      { token: 'token-1', payload: { resource: 'management', id: 'i2', order: 2 } },
    ]);
    expect(wrapper.vm.itemsByGroupId.g1[0].order).to.equal(1);
    expect(wrapper.vm.itemsByGroupId.g1[1].order).to.equal(2);
  });

  it('onItemsDragEndで401発生時はログアウトし当該グループを再取得する', async () => {
    quickTextAPI.updateItem = () => Promise.reject({ response: { status: 401 } });

    const dispatchCalls = [];
    const pushCalls = [];
    const View = buildViewWithoutLifecycle(QuickTextManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({
        store: createStoreMock({
          dispatch: (type, payload) => dispatchCalls.push({ type, payload }),
          state: { user: { role: 'Administrator', isLogin: true, token: 'token-3' } },
        }),
      })
    );
    wrapper.vm.$router.push = (payload) => pushCalls.push(payload);
    let refetchCalls = 0;
    wrapper.vm.fetchItemsForGroup = () => {
      refetchCalls += 1;
      return Promise.resolve();
    };
    wrapper.setData({
      itemsByGroupId: {
        g1: [{ _id: 'i1', order: 1 }],
      },
    });
    await wrapper.vm.$nextTick();

    await wrapper.vm.onItemsDragEnd('g1');

    expect(dispatchCalls.some((c) => c.type === 'doLogout')).to.equal(true);
    expect(pushCalls).to.deep.equal([{ name: 'Login' }]);
    expect(refetchCalls).to.equal(1);
  });

  it('onItemsDragEndが401以外で失敗した場合は並び順を巻き戻す', async () => {
    quickTextAPI.updateItem = () => Promise.reject(new Error('network'));

    const dispatchCalls = [];
    const View = buildViewWithoutLifecycle(QuickTextManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({
        store: createStoreMock({
          dispatch: (type, payload) => dispatchCalls.push({ type, payload }),
          state: { user: { role: 'Administrator', isLogin: true, token: 'token-3' } },
        }),
      })
    );
    wrapper.setData({
      itemsByGroupId: {
        g1: [
          { _id: 'i2', order: 1 },
          { _id: 'i1', order: 2 },
        ],
      },
    });
    await wrapper.vm.$nextTick();

    await wrapper.vm.onItemsDragEnd('g1', { newIndex: 1, oldIndex: 0 });
    await flushPromises();

    expect(wrapper.vm.itemsByGroupId.g1.map((it) => it._id)).to.deep.equal(['i1', 'i2']);
    expect(dispatchCalls.some((c) => c.type === 'doLogout')).to.equal(false);
  });

  it('単語の削除確認で所属グループと対象を分けて保持する', () => {
    const wrapper = createRenderedWrapper();
    const group = { _id: 'g1', title: 'Group 1' };
    const item = { _id: 'i1', label: 'Item 1' };

    wrapper.vm.confirmDeleteItem(item, group);

    expect(wrapper.vm.confirmVisible).to.equal(true);
    expect(wrapper.vm.confirmTitle).to.equal('単語を削除');
    expect(wrapper.vm.confirmMessage).to.equal('この単語を削除しますか？');
    expect(wrapper.vm.confirmTarget).to.deep.equal(item);
    expect(wrapper.vm.confirmGroup).to.deep.equal(group);
  });

  it('削除失敗時は確認ダイアログと対象を維持して再操作できる', async () => {
    quickTextAPI.deleteItem = () => Promise.reject(new Error('network'));
    const wrapper = createRenderedWrapper();
    const group = { _id: 'g1', title: 'Group 1' };
    const item = { _id: 'i1', label: 'Item 1' };
    await wrapper.setData({ itemsByGroupId: { g1: [item] } });
    wrapper.vm.confirmDeleteItem(item, group);

    await wrapper.vm.onConfirmDelete();

    expect(wrapper.vm.confirmVisible).to.equal(true);
    expect(wrapper.vm.confirmTarget).to.deep.equal(item);
    expect(wrapper.vm.confirmGroup).to.deep.equal(group);
    expect(wrapper.vm.confirmSending).to.equal(false);
    expect(wrapper.vm.sending).to.equal(false);
  });

  it('削除成功時はダイアログを閉じ、closed後に対象をクリアする', async () => {
    quickTextAPI.deleteGroup = () => Promise.resolve();
    const wrapper = createRenderedWrapper();
    const group = { _id: 'g1', title: 'Group 1' };
    await wrapper.setData({ groups: [group], itemsByGroupId: { g1: [] } });
    wrapper.vm.confirmDeleteGroup(group);

    await wrapper.vm.onConfirmDelete();

    expect(wrapper.vm.confirmVisible).to.equal(false);
    expect(wrapper.vm.confirmTarget).to.deep.equal(group);
    expect(wrapper.vm.confirmKind).to.equal('group');

    wrapper.vm.handleConfirmDialogClosed();

    expect(wrapper.vm.confirmTarget).to.equal(null);
    expect(wrapper.vm.confirmKind).to.equal(null);
    expect(wrapper.vm.confirmSending).to.equal(false);
  });

  it('グループ削除で操作起点が消えた場合は次の削除操作へフォーカスを移す', async () => {
    quickTextAPI.deleteGroup = () => Promise.resolve();
    const wrapper = createRenderedWrapper();
    document.body.appendChild(wrapper.element);
    const firstGroup = { _id: 'g1', title: 'Group 1', order: 1, lang: 'ja' };
    const secondGroup = { _id: 'g2', title: 'Group 2', order: 2, lang: 'ja' };
    await wrapper.setData({
      groups: [firstGroup, secondGroup],
      groupsLoaded: true,
      itemsByGroupId: { g1: [], g2: [] },
    });

    await wrapper.findAll('[data-testid="quicktext-group-delete"]')[0].trigger('click');
    await wrapper.vm.onConfirmDelete();
    wrapper.vm.handleConfirmDialogClosed();
    await flushPromises();

    expect(document.activeElement).to.equal(
      wrapper.find('[data-testid="quicktext-group-delete"]').element
    );
    wrapper.unmount();
  });

  it('末尾のグループを削除した場合は前の削除操作へフォーカスを移す', async () => {
    quickTextAPI.deleteGroup = () => Promise.resolve();
    const wrapper = createRenderedWrapper();
    document.body.appendChild(wrapper.element);
    const firstGroup = { _id: 'g1', title: 'Group 1', order: 1, lang: 'ja' };
    const secondGroup = { _id: 'g2', title: 'Group 2', order: 2, lang: 'ja' };
    await wrapper.setData({
      groups: [firstGroup, secondGroup],
      groupsLoaded: true,
      itemsByGroupId: { g1: [], g2: [] },
    });

    await wrapper.findAll('[data-testid="quicktext-group-delete"]')[1].trigger('click');
    await wrapper.vm.onConfirmDelete();
    wrapper.vm.handleConfirmDialogClosed();
    await flushPromises();

    expect(document.activeElement).to.equal(
      wrapper.find('[data-testid="quicktext-group-delete"]').element
    );
    wrapper.unmount();
  });

  it('削除をキャンセルした場合は元の削除操作へフォーカスを戻す', async () => {
    const wrapper = createRenderedWrapper();
    document.body.appendChild(wrapper.element);
    const group = { _id: 'g1', title: 'Group 1', order: 1, lang: 'ja' };
    await wrapper.setData({ groups: [group], groupsLoaded: true, itemsByGroupId: { g1: [] } });
    const deleteButton = wrapper.find('[data-testid="quicktext-group-delete"]');

    await deleteButton.trigger('click');
    wrapper.vm.onCancelDelete();
    wrapper.vm.handleConfirmDialogClosed();
    await flushPromises();

    expect(document.activeElement).to.equal(deleteButton.element);
    wrapper.unmount();
  });

  it('最後のグループを削除した場合は一覧見出しへフォーカスを移す', async () => {
    quickTextAPI.deleteGroup = () => Promise.resolve();
    const wrapper = createRenderedWrapper();
    document.body.appendChild(wrapper.element);
    const group = { _id: 'g1', title: 'Group 1', order: 1, lang: 'ja' };
    await wrapper.setData({ groups: [group], groupsLoaded: true, itemsByGroupId: { g1: [] } });

    await wrapper.find('[data-testid="quicktext-group-delete"]').trigger('click');
    await wrapper.vm.onConfirmDelete();
    wrapper.vm.handleConfirmDialogClosed();
    await flushPromises();

    expect(document.activeElement).to.equal(wrapper.find('.view-title').element);
    wrapper.unmount();
  });

  it('deleteGroup成功時は対象グループとitemsをローカル状態から削除する', async () => {
    quickTextAPI.deleteGroup = () => Promise.resolve();

    const View = buildViewWithoutLifecycle(QuickTextManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({
        store: createStoreMock({
          state: { user: { role: 'Administrator', isLogin: true, token: 'token-4' } },
        }),
      })
    );
    wrapper.setData({
      groups: [
        { _id: 'g1', title: 'group-1' },
        { _id: 'g2', title: 'group-2' },
      ],
      itemsByGroupId: {
        g1: [{ _id: 'i1' }],
        g2: [{ _id: 'i2' }],
      },
    });
    await wrapper.vm.$nextTick();

    await wrapper.vm.deleteGroup({ _id: 'g1' });
    await flushPromises();

    expect(wrapper.vm.groups.map((g) => g._id)).to.deep.equal(['g2']);
    expect(Object.prototype.hasOwnProperty.call(wrapper.vm.itemsByGroupId, 'g1')).to.equal(false);
    expect(wrapper.vm.sending).to.equal(false);
  });

  it('deleteItem成功時はfetchItemsForGroupで再取得する', async () => {
    quickTextAPI.deleteItem = () => Promise.resolve();

    const View = buildViewWithoutLifecycle(QuickTextManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({
        store: createStoreMock({
          state: { user: { role: 'Administrator', isLogin: true, token: 'token-5' } },
        }),
      })
    );
    const refetchCalls = [];
    wrapper.vm.fetchItemsForGroup = (groupId, options) => {
      refetchCalls.push({ groupId, options });
      return Promise.resolve(groupId);
    };

    await wrapper.vm.deleteItem({ _id: 'i1' }, { _id: 'g1' });
    await flushPromises();

    expect(refetchCalls).to.deep.equal([{ groupId: 'g1', options: { force: true } }]);
    expect(wrapper.vm.sending).to.equal(false);
  });
  it('グループ削除が部分失敗したら配下を再取得して同じ対象を再試行できる', async () => {
    quickTextAPI.deleteGroup = () => Promise.reject(new Error('delete failed'));
    const group = { _id: 'g1', title: 'Group 1' };
    quickTextAPI.getGroupsAll = async () => ({ data: [group] });
    let finishRefresh;
    quickTextAPI.getItems = () => new Promise((resolve) => { finishRefresh = () => resolve({ data: [] }); });
    const wrapper = createRenderedWrapper();
    await wrapper.setData({ groups: [group], itemsByGroupId: { g1: [{ _id: 'old', label: 'Old' }] } });
    wrapper.vm.confirmDeleteGroup(group);
    const pending = wrapper.vm.onConfirmDelete();
    await flushPromises();
    expect(wrapper.vm.sending).to.equal(true);
    expect(wrapper.vm.confirmSending).to.equal(true);
    finishRefresh();
    await pending;
    expect(wrapper.vm.itemsByGroupId.g1).to.deep.equal([]);
    expect(wrapper.vm.confirmVisible).to.equal(true);
    expect(wrapper.vm.confirmTarget._id).to.equal('g1');
    expect(wrapper.vm.sending).to.equal(false);
  });

  it('グループ削除の応答が失われても再取得で不存在なら確認を閉じる', async () => {
    quickTextAPI.deleteGroup = () => Promise.reject(new Error('response lost'));
    quickTextAPI.getGroupsAll = async () => ({ data: [] });
    const wrapper = createRenderedWrapper();
    const group = { _id: 'gone', title: 'Gone' };
    await wrapper.setData({ groups: [group] });
    wrapper.vm.confirmDeleteGroup(group);
    await wrapper.vm.onConfirmDelete();
    expect(wrapper.vm.groups).to.deep.equal([]);
    expect(wrapper.vm.confirmVisible).to.equal(false);
  });

});
