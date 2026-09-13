import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import quickTextAPI from '@/api/quickText';
import ResourceQuickTextDialog from '@/components/quicktext/ResourceQuickTextDialog.vue';
import flushPromises from '../../helpers/flushPromises';

const UiDialogStub = {
  name: 'UiDialog',
  inheritAttrs: false,
  props: [
    'open',
    'titleId',
    'descriptionIds',
    'initialFocus',
    'closeOnEscape',
    'closeOnBackdrop',
  ],
  emits: ['request-close', 'opened', 'closed'],
  template: `
    <section v-bind="$attrs">
      <header><slot name="title" /></header>
      <main><slot /></main>
      <footer><slot name="actions" /></footer>
      <aside><slot name="status" /></aside>
    </section>
  `,
};

const UiButtonStub = {
  name: 'UiButton',
  inheritAttrs: false,
  props: {
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['click'],
  template: `
    <button v-bind="$attrs" type="button" :disabled="disabled" @click="$emit('click', $event)">
      <slot />
    </button>
  `,
};

const UiFieldStub = {
  name: 'UiField',
  props: ['controlId', 'label', 'invalid', 'error'],
  computed: {
    controlAttrs() {
      return { id: this.controlId };
    },
  },
  template: `
    <label>
      <span>{{ label }}</span>
      <slot :control-attrs="controlAttrs" />
      <span v-if="error" role="alert">{{ error }}</span>
    </label>
  `,
};

const UiIconStub = {
  name: 'UiIcon',
  props: ['name'],
  template: '<i :data-name="name" />',
};

const UiProgressStub = {
  name: 'UiProgress',
  props: ['mode'],
  template: '<progress />',
};

const ResourceQuickTextListStub = {
  name: 'ResourceQuickTextList',
  props: [
    'resource',
    'groups',
    'itemsByGroupId',
    'sending',
    'userIsLogin',
    'canManage',
    'showCreateGroupAction',
    'emphasizeTranslationLabels',
  ],
  emits: [
    'create-item',
    'edit-group',
    'delete-group',
    'edit-item',
    'delete-item',
    'groups-drag-end',
    'items-drag-end',
  ],
  template: '<div data-testid="resource-quicktext-list-stub" />',
};

const ConfirmDialogStub = {
  name: 'ConfirmDialog',
  props: [
    'dialogVisible',
    'title',
    'message',
    'confirmLabel',
    'cancelLabel',
    'sending',
    'actionsAdjacent',
    'closeOnConfirm',
    'confirmIcon',
  ],
  emits: ['confirm', 'cancel', 'close', 'closed'],
  template: '<div data-testid="confirm-dialog-stub"><slot /></div>',
};

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

const createWrapper = (overrides = {}) => {
  const dispatchCalls = [];
  const pushCalls = [];
  const wrapper = shallowMount(ResourceQuickTextDialog, {
    attachTo: document.body,
    props: {
      dialogVisible: true,
      resource: 'room',
      resourceId: 'room-1',
      targetName: '対象ルーム',
      canManage: true,
      ...(overrides.props || {}),
    },
    stubs: {
      ConfirmDialog: ConfirmDialogStub,
      DialogTargetContext: false,
      ResourceQuickTextList: ResourceQuickTextListStub,
      UiButton: UiButtonStub,
      UiDialog: UiDialogStub,
      UiField: UiFieldStub,
      UiIcon: UiIconStub,
      UiProgress: UiProgressStub,
      ...(overrides.stubs || {}),
    },
    mocks: {
      $store: {
        getters: {
          userIsLogin: true,
          userToken: 'token',
          lang: 'ja',
        },
        dispatch: (type, payload) => dispatchCalls.push({ type, payload }),
      },
      $router: { push: (payload) => pushCalls.push(payload) },
      $t: (key) => key,
      $n: (value) => String(value),
      ...(overrides.mocks || {}),
    },
  });
  return { dispatchCalls, pushCalls, wrapper };
};

describe('フロア・ルームの単語管理ダイアログ', () => {
  const originalApi = {};
  let wrappers;

  beforeEach(() => {
    wrappers = [];
    [
      'getGroups',
      'getItems',
      'createGroup',
      'updateGroup',
      'createItem',
      'updateItem',
      'deleteGroup',
      'deleteItem',
    ].forEach((method) => {
      originalApi[method] = quickTextAPI[method];
    });
    quickTextAPI.getGroups = () => Promise.resolve({ data: [] });
    quickTextAPI.getItems = () => Promise.resolve({ data: [] });
    quickTextAPI.createGroup = () => Promise.resolve({ data: { _id: 'created-group' } });
    quickTextAPI.updateGroup = () => Promise.resolve({ data: { _id: 'updated-group' } });
    quickTextAPI.createItem = () => Promise.resolve({ data: { _id: 'created-item' } });
    quickTextAPI.updateItem = () => Promise.resolve({ data: { _id: 'updated-item' } });
    quickTextAPI.deleteGroup = () => Promise.resolve({});
    quickTextAPI.deleteItem = () => Promise.resolve({});
  });

  afterEach(() => {
    wrappers.forEach((wrapper) => wrapper.unmount());
    Object.entries(originalApi).forEach(([method, implementation]) => {
      quickTextAPI[method] = implementation;
    });
  });

  const mountDialog = (overrides = {}) => {
    const result = createWrapper(overrides);
    wrappers.push(result.wrapper);
    return result;
  };

  it('UiDialogへ見出し・対象・フォーカス・閉じ方を渡し、closed後に状態を解放してcloseを通知する', async () => {
    const { wrapper } = mountDialog({
      props: {
        resource: 'floor',
        resourceId: 'floor-1',
        targetName: '対象フロア',
      },
    });
    const dialog = wrapper.findComponent(UiDialogStub);

    expect(dialog.props()).to.include({
      open: true,
      titleId: 'resource-quicktext-floor-dialog-title',
      descriptionIds: 'resource-quicktext-floor-dialog-context',
      initialFocus: '#resource-quicktext-floor-dialog-title',
      closeOnEscape: true,
      closeOnBackdrop: true,
    });
    expect(wrapper.get('#resource-quicktext-floor-dialog-title').text()).to.equal('フロア単語');
    expect(wrapper.get('#resource-quicktext-floor-dialog-context').text()).to.contain('対象フロア');

    await wrapper.setData({ loading: true });
    expect(wrapper.find('.quicktext-summary').exists()).to.equal(false);
    expect(dialog.props('closeOnEscape')).to.equal(true);
    expect(dialog.props('closeOnBackdrop')).to.equal(true);
    dialog.vm.$emit('request-close');
    expect(wrapper.vm.visible).to.equal(false);

    await wrapper.setData({
      visible: true,
      loading: false,
      editorKind: 'group',
      formValue: '入力中',
      initialFormValue: '',
    });
    dialog.vm.$emit('request-close');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.visible).to.equal(true);
    expect(wrapper.vm.editorVisible).to.equal(true);
    expect(wrapper.vm.discardConfirmVisible).to.equal(true);

    wrapper.vm.confirmDiscardChanges();
    expect(wrapper.vm.editorVisible).to.equal(true);

    wrapper.findAllComponents(ConfirmDialogStub)[1].vm.$emit('closed');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.editorVisible).to.equal(false);

    dialog.vm.$emit('request-close');
    expect(wrapper.vm.visible).to.equal(false);
    dialog.vm.$emit('closed', { reason: 'escape' });
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('close')).to.deep.equal([[{ reason: 'escape' }]]);
    expect(wrapper.vm.groups).to.deep.equal([]);
    expect(wrapper.vm.confirmVisible).to.equal(false);
    expect(wrapper.vm.editorVisible).to.equal(false);
  });

  it('opened時にフロアのグループと全項目をトークン付きで取得して一覧へ渡す', async () => {
    const groupCalls = [];
    const itemCalls = [];
    quickTextAPI.getGroups = (...args) => {
      groupCalls.push(args);
      return Promise.resolve({ data: [{ _id: 'group-1', title: 'グループ', order: 1 }] });
    };
    quickTextAPI.getItems = (...args) => {
      itemCalls.push(args);
      return Promise.resolve({ data: { docs: [{ _id: 'item-1', label: '単語', order: 1 }] } });
    };
    const { wrapper } = mountDialog({
      props: { resource: 'floor', resourceId: 'floor-1', targetName: 'フロア' },
    });

    wrapper.findComponent(UiDialogStub).vm.$emit('opened');
    await flushPromises();

    expect(groupCalls).to.deep.equal([['token', { resource: 'floor', resourceId: 'floor-1' }]]);
    expect(itemCalls).to.deep.equal([
      ['token', { resource: 'floor', resourceId: 'floor-1', groupId: 'group-1' }],
    ]);
    const list = wrapper.findComponent(ResourceQuickTextListStub);
    expect(list.props()).to.include({
      resource: 'floor',
      canManage: true,
      showCreateGroupAction: false,
      emphasizeTranslationLabels: false,
    });
    expect(list.props('groups').map((group) => group._id)).to.deep.equal(['group-1']);
    expect(list.props('itemsByGroupId')['group-1'].map((item) => item._id)).to.deep.equal(['item-1']);
  });

  it('一覧からグループ・単語の内部フォームへ切り替え、戻ると外側ダイアログを閉じず一覧へ戻る', async () => {
    const group = { _id: 'group-1', title: 'グループ', lang: 'ja' };
    const item = { _id: 'item-1', label: '単語', lang: 'ja' };
    const { wrapper } = mountDialog();
    await wrapper.setData({ groups: [group], itemsByGroupId: { 'group-1': [item] } });
    const list = wrapper.findComponent(ResourceQuickTextListStub);

    await wrapper.get('[data-testid="quicktext-dialog-create-group"]').trigger('click');
    expect(wrapper.get('#resource-quicktext-room-dialog-title').text()).to.equal('単語グループ作成');
    expect(wrapper.get('#resource-quicktext-room-group-value').element.value).to.equal('');
    await wrapper.get('[data-testid="quicktext-dialog-header-start"]').trigger('click');

    list.vm.$emit('edit-group', group);
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-testid="quicktext-dialog-editor-screen"]').isVisible()).to.equal(true);
    expect(wrapper.get('#resource-quicktext-room-dialog-title').text()).to.equal('単語グループ編集');
    expect(wrapper.get('#resource-quicktext-room-group-value').element.value).to.equal('グループ');
    expect(wrapper.findAllComponents(UiDialogStub)).to.have.lengthOf(1);
    expect(wrapper.findComponent(ConfirmDialogStub).props('dialogVisible')).to.equal(false);

    await wrapper.get('[data-testid="quicktext-dialog-header-start"]').trigger('click');
    expect(wrapper.vm.visible).to.equal(true);
    expect(wrapper.vm.editorVisible).to.equal(false);
    expect(wrapper.get('[data-testid="quicktext-dialog-list-screen"]').isVisible()).to.equal(true);

    list.vm.$emit('create-item', group);
    await wrapper.vm.$nextTick();
    expect(wrapper.get('#resource-quicktext-room-dialog-title').text()).to.equal('単語作成');
    expect(wrapper.get('#resource-quicktext-room-item-value').element.value).to.equal('');
    expect(wrapper.findAll('.dialog-target-context').at(1).text()).to.contain('グループ');
    await wrapper.get('[data-testid="quicktext-dialog-header-start"]').trigger('click');

    list.vm.$emit('edit-item', item, group);
    await wrapper.vm.$nextTick();
    expect(wrapper.get('#resource-quicktext-room-dialog-title').text()).to.equal('単語編集');
    expect(wrapper.get('#resource-quicktext-room-item-value').element.value).to.equal('単語');
    expect(wrapper.findAll('.dialog-target-context').at(1).text()).to.contain('グループ');

    await wrapper.get('footer button').trigger('click');
    expect(wrapper.vm.visible).to.equal(true);
    expect(wrapper.vm.editorVisible).to.equal(false);
  });

  it('内部フォームから戻ると作成操作の起点へフォーカスを戻す', async () => {
    const { wrapper } = mountDialog();
    const trigger = wrapper.get('[data-testid="quicktext-dialog-create-group"]');
    trigger.element.focus();

    await trigger.trigger('click');
    expect(wrapper.vm.editorVisible).to.equal(true);
    expect(trigger.element.isConnected).to.equal(true);

    await wrapper.get('[data-testid="quicktext-dialog-header-start"]').trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.editorVisible).to.equal(false);
    expect(document.activeElement).to.equal(trigger.element);
  });

  it('日本語IMEの変換確定Enterでは保存せず、通常のEnterで保存する', async () => {
    const calls = [];
    quickTextAPI.createGroup = (...args) => {
      calls.push(args);
      return Promise.resolve({ data: { _id: 'created-group' } });
    };
    const { wrapper } = mountDialog();
    wrapper.vm.loadData = () => Promise.resolve();
    await wrapper.setData({ editorKind: 'group', formValue: '入力中' });
    const input = wrapper.get('#resource-quicktext-room-group-value');

    await input.trigger('keydown', { key: 'Enter', isComposing: true, keyCode: 229 });
    await flushPromises();
    expect(calls).to.deep.equal([]);
    expect(wrapper.vm.editorVisible).to.equal(true);

    await input.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(calls).to.have.lengthOf(1);
    expect(wrapper.vm.editorVisible).to.equal(false);
  });

  it.each([
    {
      label: 'グループ作成',
      kind: 'group',
      editingValue: null,
      group: null,
      value: '新規グループ',
      method: 'createGroup',
      responseId: 'created-group',
      expectedPayload: {
        resource: 'room',
        resourceId: 'room-1',
        title: '新規グループ',
        lang: 'ja',
      },
    },
    {
      label: 'グループ編集',
      kind: 'group',
      editingValue: { _id: 'group-1', title: '変更前', lang: 'en' },
      group: null,
      value: '変更後',
      method: 'updateGroup',
      responseId: 'group-1',
      expectedPayload: {
        resource: 'room',
        resourceId: 'room-1',
        id: 'group-1',
        title: '変更後',
        lang: 'en',
      },
    },
    {
      label: '単語作成',
      kind: 'item',
      editingValue: null,
      group: { _id: 'group-1', title: 'グループ' },
      value: '新規単語',
      method: 'createItem',
      responseId: 'created-item',
      expectedPayload: {
        resource: 'room',
        resourceId: 'room-1',
        groupId: 'group-1',
        label: '新規単語',
        lang: 'ja',
      },
    },
    {
      label: '単語編集',
      kind: 'item',
      editingValue: { _id: 'item-1', label: '変更前', lang: 'en' },
      group: { _id: 'group-1', title: 'グループ' },
      value: '変更後',
      method: 'updateItem',
      responseId: 'item-1',
      expectedPayload: {
        resource: 'room',
        resourceId: 'room-1',
        id: 'item-1',
        label: '変更後',
        lang: 'en',
      },
    },
  ])('$labelを対応APIへ保存し、再取得して一覧へ戻る', async ({
    kind,
    editingValue,
    group,
    value,
    method,
    responseId,
    expectedPayload,
  }) => {
    const calls = [];
    quickTextAPI[method] = (...args) => {
      calls.push(args);
      return Promise.resolve({ data: { _id: responseId } });
    };
    const { wrapper } = mountDialog();
    let loadCalls = 0;
    wrapper.vm.loadData = () => {
      loadCalls += 1;
      return Promise.resolve();
    };
    await wrapper.setData({
      editorKind: kind,
      editorValue: editingValue,
      editorGroup: group,
      formValue: value,
    });

    await wrapper.vm.saveForm();

    expect(calls).to.deep.equal([['token', expectedPayload]]);
    expect(loadCalls).to.equal(1);
    expect(wrapper.vm.editorVisible).to.equal(false);
    expect(wrapper.vm.formValue).to.equal('');
  });

  it('入力エラー時はAPIを呼ばず最初の入力項目へフォーカスする', async () => {
    let createCalls = 0;
    let focusCalls = 0;
    quickTextAPI.createGroup = () => {
      createCalls += 1;
      return Promise.resolve({ data: {} });
    };
    const { wrapper } = mountDialog();
    wrapper.vm.focusFormControl = () => {
      focusCalls += 1;
    };
    await wrapper.setData({ editorKind: 'group', formValue: '' });

    await wrapper.vm.saveForm();

    expect(createCalls).to.equal(0);
    expect(focusCalls).to.equal(1);
    expect(wrapper.vm.formSubmitted).to.equal(true);
  });

  it.each([
    {
      label: 'グループ',
      kind: 'group',
      target: { _id: 'group-1', title: '削除グループ' },
      group: null,
      method: 'deleteGroup',
      expectedPayload: { resource: 'room', resourceId: 'room-1', id: 'group-1' },
    },
    {
      label: '単語',
      kind: 'item',
      target: { _id: 'item-1', label: '削除単語' },
      group: { _id: 'group-1', title: 'グループ' },
      method: 'deleteItem',
      expectedPayload: { resource: 'room', resourceId: 'room-1', id: 'item-1' },
    },
  ])('$labelの削除だけ確認ダイアログを開き、確定後に対応APIと再取得を一度だけ行う', async ({
    kind,
    target,
    group,
    method,
    expectedPayload,
  }) => {
    const calls = [];
    quickTextAPI[method] = (...args) => {
      calls.push(args);
      return Promise.resolve({});
    };
    const { wrapper } = mountDialog();
    let loadCalls = 0;
    wrapper.vm.loadData = () => {
      loadCalls += 1;
      return Promise.resolve();
    };

    if (kind === 'group') {
      wrapper.vm.confirmDeleteGroup(target);
    } else {
      wrapper.vm.confirmDeleteItem(target, group);
    }
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.editorVisible).to.equal(false);
    expect(wrapper.vm.visible).to.equal(true);
    expect(wrapper.findAllComponents(UiDialogStub)).to.have.lengthOf(1);
    const confirm = wrapper.findComponent(ConfirmDialogStub);
    expect(confirm.props('dialogVisible')).to.equal(true);
    expect(confirm.props('title')).to.equal(kind === 'group' ? '単語グループを削除' : '単語を削除');
    expect(confirm.props('confirmLabel')).to.equal('削除');
    expect(confirm.props()).to.include({
      actionsAdjacent: true,
      closeOnConfirm: false,
      confirmIcon: 'delete',
    });
    expect(wrapper.get('.quicktext-delete-details').text()).to.contain('対象ルーム');
    expect(wrapper.get('.quicktext-delete-details').text()).to.contain(
      kind === 'group' ? target.title : target.label
    );

    confirm.vm.$emit('confirm');
    await flushPromises();

    expect(calls).to.deep.equal([['token', expectedPayload]]);
    expect(loadCalls).to.equal(1);
    expect(wrapper.vm.confirmVisible).to.equal(false);
    confirm.vm.$emit('closed');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.confirmTarget).to.equal(null);
  });

  it('削除に失敗した場合は対象を保持して確認ダイアログを再表示できる', async () => {
    quickTextAPI.deleteGroup = () => Promise.reject(new Error('delete failed'));
    const { wrapper } = mountDialog();
    const group = { _id: 'group-1', title: '削除グループ' };
    let refreshCalls = 0;
    wrapper.vm.loadData = async () => {
      refreshCalls += 1;
      wrapper.vm.groups = [group];
      wrapper.vm.itemsByGroupId = { 'group-1': [] };
    };

    wrapper.vm.confirmDeleteGroup(group);
    await wrapper.vm.onConfirmDelete();

    expect(wrapper.vm.confirmVisible).to.equal(true);
    expect(wrapper.vm.confirmTarget).to.deep.equal(group);
    expect(refreshCalls).to.equal(1);
    expect(wrapper.vm.itemsByGroupId['group-1']).to.deep.equal([]);
    expect(wrapper.vm.confirmSending).to.equal(false);
  });

  it('単語削除後は同じグループの次行へフォーカスし、なければ親グループへ戻す', async () => {
    const group = { _id: 'group-1', title: 'グループ' };
    const first = { _id: 'item-1', label: '削除対象' };
    const next = { _id: 'item-2', label: '次の単語' };
    const { wrapper } = mountDialog();
    await wrapper.setData({
      groups: [group],
      itemsByGroupId: { 'group-1': [first, next] },
    });
    wrapper.vm.loadData = async () => {
      wrapper.vm.itemsByGroupId = { 'group-1': [next] };
    };
    const focusCalls = [];
    wrapper.vm.focusSavedEntry = (target) => focusCalls.push(target);

    wrapper.vm.confirmDeleteItem(first, group);
    await wrapper.vm.onConfirmDelete();

    expect(focusCalls).to.deep.equal([]);
    wrapper.findComponent(ConfirmDialogStub).vm.$emit('closed');
    await wrapper.vm.$nextTick();
    expect(focusCalls).to.deep.equal([{ kind: 'item', id: 'item-2' }]);
  });

  it('resourceId切替後に先行リクエストが完了しても旧ルームの一覧を反映しない', async () => {
    const firstRequest = createDeferred();
    const secondRequest = createDeferred();
    const groupCalls = [];
    const itemCalls = [];
    quickTextAPI.getGroups = (...args) => {
      const payload = args[args.length - 1];
      groupCalls.push(args);
      return payload.resourceId === 'room-1' ? firstRequest.promise : secondRequest.promise;
    };
    quickTextAPI.getItems = (...args) => {
      const payload = args[args.length - 1];
      itemCalls.push(args);
      return Promise.resolve({ data: [{ _id: `item-${payload.groupId}` }] });
    };
    const { wrapper } = mountDialog();

    const firstLoad = wrapper.vm.openedDialog();
    expect(wrapper.vm.loading).to.equal(true);

    await wrapper.setProps({ resourceId: 'room-2', targetName: '次のルーム' });
    expect(groupCalls).to.deep.equal([
      [{ resource: 'room', resourceId: 'room-1' }],
      [{ resource: 'room', resourceId: 'room-2' }],
    ]);

    secondRequest.resolve({ data: [{ _id: 'group-2', title: '新しい一覧' }] });
    await flushPromises();
    expect(wrapper.vm.groups.map((group) => group._id)).to.deep.equal(['group-2']);
    expect(wrapper.vm.itemsByGroupId['group-2'].map((item) => item._id)).to.deep.equal(['item-group-2']);

    firstRequest.resolve({ data: [{ _id: 'group-1', title: '古い一覧' }] });
    await firstLoad;
    await flushPromises();

    expect(wrapper.vm.groups.map((group) => group._id)).to.deep.equal(['group-2']);
    expect(wrapper.vm.itemsByGroupId['group-1']).to.equal(undefined);
    expect(itemCalls).to.deep.equal([
      [{ resource: 'room', resourceId: 'room-2', groupId: 'group-2' }],
    ]);
    expect(wrapper.get('#resource-quicktext-room-dialog-context').text()).to.contain('次のルーム');
  });

  it('ルームの取得で401になっても公開取得の仕様に従ってログアウトしない', async () => {
    quickTextAPI.getGroups = () => Promise.reject({ response: { status: 401 } });
    const { dispatchCalls, pushCalls, wrapper } = mountDialog();

    await wrapper.vm.openedDialog();

    expect(dispatchCalls.some((call) => call.type === 'doLogout')).to.equal(false);
    expect(pushCalls).to.deep.equal([]);
    expect(wrapper.vm.loadFailed).to.equal(true);
    expect(wrapper.find('.quicktext-summary').exists()).to.equal(false);
  });

  it('フロアの取得で401になった場合は仕様に従ってログアウトしてログイン画面へ遷移する', async () => {
    quickTextAPI.getGroups = () => Promise.reject({ response: { status: 401 } });
    const { dispatchCalls, pushCalls, wrapper } = mountDialog({
      props: { resource: 'floor', resourceId: 'floor-1' },
    });

    await wrapper.vm.openedDialog();

    expect(dispatchCalls.some((call) => call.type === 'doLogout')).to.equal(true);
    expect(pushCalls).to.deep.equal([{ name: 'Login' }]);
    expect(wrapper.vm.loadFailed).to.equal(true);
    expect(wrapper.find('.quicktext-summary').exists()).to.equal(false);
  });

  it('canManageがfalseなら一覧を閲覧専用にし、作成・編集・削除を開始しない', async () => {
    const group = { _id: 'group-1', title: 'グループ' };
    const item = { _id: 'item-1', label: '単語' };
    const { wrapper } = mountDialog({ props: { canManage: false } });
    await wrapper.setData({ groups: [group], itemsByGroupId: { 'group-1': [item] } });

    expect(wrapper.findComponent(ResourceQuickTextListStub).props('canManage')).to.equal(false);
    expect(wrapper.get('[data-testid="quicktext-dialog-create-group"]').attributes('disabled')).not.to.equal(
      undefined
    );

    wrapper.vm.openGroupForm(group);
    wrapper.vm.openItemForm(item, group);
    wrapper.vm.confirmDeleteGroup(group);
    wrapper.vm.confirmDeleteItem(item, group);

    expect(wrapper.vm.editorVisible).to.equal(false);
    expect(wrapper.vm.confirmVisible).to.equal(false);
  });
  it('グループ削除の応答が失われても再取得で不存在なら確認を閉じる', async () => {
    quickTextAPI.deleteGroup = () => Promise.reject(new Error('response lost'));
    const { wrapper } = mountDialog();
    wrapper.vm.loadData = async () => { wrapper.vm.groups = []; wrapper.vm.itemsByGroupId = {}; };
    const group = { _id: 'gone', title: 'Gone' };
    wrapper.vm.confirmDeleteGroup(group);
    await wrapper.vm.onConfirmDelete();
    expect(wrapper.vm.confirmVisible).to.equal(false);
    expect(wrapper.vm.confirmSending).to.equal(false);
  });

});
