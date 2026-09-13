import { expect } from 'vitest';
import quickTextAPI from '@/api/quickText';
import {
  createQuickTextGroupDialogComponent,
  createQuickTextItemDialogComponent,
} from '@/components/quicktext/quickTextDialogFactory';

const createVm = (component, overrides = {}) => {
  const emitted = [];
  const dispatches = [];
  const pushes = [];
  const vm = {
    ...component.data(),
    dialogVisible: true,
    propsGroup: null,
    propsItem: null,
    group: { _id: 'group-id' },
    v$: {
      $invalid: false,
      $touch() {},
      $reset() {},
      title: {},
      label: {},
    },
    $store: {
      getters: { lang: 'ja', userToken: 'token' },
      dispatch(type, payload) {
        dispatches.push({ type, payload });
        return Promise.resolve();
      },
    },
    $router: {
      push(payload) {
        pushes.push(payload);
        return Promise.resolve();
      },
    },
    $t: (key) => key,
    $emit(name, payload) {
      emitted.push({ name, payload });
    },
    ...overrides,
  };
  return { vm, emitted, dispatches, pushes };
};

describe('単語編集ダイアログの共通処理', () => {
  const originals = {};

  beforeEach(() => {
    originals.createGroup = quickTextAPI.createGroup;
    originals.updateGroup = quickTextAPI.updateGroup;
    originals.createItem = quickTextAPI.createItem;
    originals.updateItem = quickTextAPI.updateItem;
  });

  afterEach(() => {
    quickTextAPI.createGroup = originals.createGroup;
    quickTextAPI.updateGroup = originals.updateGroup;
    quickTextAPI.createItem = originals.createItem;
    quickTextAPI.updateItem = originals.updateItem;
  });

  it('変更の破棄を確認するダイアログが閉じてから親を閉じる', () => {
    const cases = [
      createQuickTextGroupDialogComponent({
        name: 'ManagementGroup',
        resource: 'management',
        confirmDiscard: true,
      }),
      createQuickTextItemDialogComponent({
        name: 'ManagementItem',
        resource: 'management',
        confirmDiscard: true,
      }),
    ];

    cases.forEach((component) => {
      const { vm } = createVm(component, { visible: true, hasUnsavedChanges: true });

      component.methods.onCancel.call(vm);
      expect(vm.visible).to.equal(true);
      expect(vm.discardConfirmVisible).to.equal(true);

      component.methods.cancelDiscard.call(vm);
      component.methods.handleDiscardConfirmationClosed.call(vm);
      expect(vm.visible).to.equal(true);

      component.methods.onCancel.call(vm);
      component.methods.confirmDiscard.call(vm);
      expect(vm.visible).to.equal(true);
      expect(vm.discardConfirmVisible).to.equal(false);
      expect(vm.closeAfterDiscardConfirmation).to.equal(true);

      component.methods.handleDiscardConfirmationClosed.call(vm);
      expect(vm.visible).to.equal(false);
      expect(vm.closeAfterDiscardConfirmation).to.equal(false);
    });
  });

  it('共通単語グループを作成し、成功を通知する', async () => {
    const component = createQuickTextGroupDialogComponent({
      name: 'ManagementGroup',
      resource: 'management',
    });
    const calls = [];
    quickTextAPI.createGroup = (...args) => {
      calls.push(args);
      return Promise.resolve();
    };
    const { vm, emitted, dispatches } = createVm(component, { title: 'New group' });

    await component.methods.onDone.call(vm);

    expect(calls).to.deep.equal([
      ['token', { resource: 'management', lang: 'ja', title: 'New group' }],
    ]);
    expect(emitted).to.deep.include({ name: 'success', payload: undefined });
    expect(dispatches).to.deep.include({
      type: 'doShowSnackbar',
      payload: { message: '単語グループを作成しました', role: 'status' },
    });
    expect(vm.sending).to.equal(false);
  });

  it('共通単語グループの更新ではフロア・ルームIDを使わない', async () => {
    const component = createQuickTextGroupDialogComponent({
      name: 'ManagementGroup',
      resource: 'management',
    });
    const calls = [];
    quickTextAPI.updateGroup = (...args) => {
      calls.push(args);
      return Promise.resolve();
    };
    const { vm } = createVm(component, { id: 'group-id', title: 'Updated group' });

    await component.methods.onDone.call(vm);

    expect(calls).to.deep.equal([
      ['token', { resource: 'management', lang: 'ja', id: 'group-id', title: 'Updated group' }],
    ]);
  });

  it('編集時はUI 言語設定ではなく保存済み原文言語設定を維持する', async () => {
    const component = createQuickTextGroupDialogComponent({ name: 'ManagementGroup', resource: 'management' });
    const calls = [];
    quickTextAPI.updateGroup = (...args) => {
      calls.push(args);
      return Promise.resolve();
    };
    const { vm } = createVm(component, {
      id: 'group-id',
      title: 'Texte',
      propsGroup: { _id: 'group-id', title: 'Texte', lang: 'fr' },
      $store: { getters: { lang: 'he', userToken: 'token' }, dispatch: () => Promise.resolve() },
    });

    await component.methods.onDone.call(vm);

    expect(calls[0][1].lang).to.equal('fr');
  });

  it('グループの入力が不正な場合や送信中は送信しない', async () => {
    const component = createQuickTextGroupDialogComponent({
      name: 'ManagementGroup',
      resource: 'management',
    });
    let callCount = 0;
    quickTextAPI.createGroup = () => {
      callCount += 1;
      return Promise.resolve();
    };

    const invalid = createVm(component);
    invalid.vm.v$.$invalid = true;
    await component.methods.onDone.call(invalid.vm);

    const sending = createVm(component, { sending: true });
    await component.methods.onDone.call(sending.vm);

    expect(callCount).to.equal(0);
  });

  it('共通処理で単語の作成・更新データを組み立てる', async () => {
    const component = createQuickTextItemDialogComponent({
      name: 'ManagementItem',
      resource: 'management',
    });
    const createCalls = [];
    const updateCalls = [];
    quickTextAPI.createItem = (...args) => {
      createCalls.push(args);
      return Promise.resolve();
    };
    quickTextAPI.updateItem = (...args) => {
      updateCalls.push(args);
      return Promise.resolve();
    };

    const created = createVm(component, { label: 'New item' });
    await component.methods.onDone.call(created.vm);

    const updated = createVm(component, { id: 'item-id', label: 'Updated item' });
    await component.methods.onDone.call(updated.vm);

    expect(createCalls).to.deep.equal([
      [
        'token',
        {
          resource: 'management',
          lang: 'ja',
          groupId: 'group-id',
          label: 'New item',
        },
      ],
    ]);
    expect(updateCalls).to.deep.equal([
      [
        'token',
        {
          resource: 'management',
          lang: 'ja',
          id: 'item-id',
          label: 'Updated item',
        },
      ],
    ]);
  });

  it('401応答を通知し、共通の認証エラー処理を行う', async () => {
    const component = createQuickTextGroupDialogComponent({
      name: 'ManagementGroup',
      resource: 'management',
    });
    quickTextAPI.updateGroup = () => Promise.reject({ response: { status: 401 } });
    const { vm, dispatches, pushes } = createVm(component, { id: 'group-id', title: 'Updated group' });

    const handled = await component.methods.onDone.call(vm);

    expect(handled).to.equal(true);
    expect(dispatches.some((call) => call.type === 'doShowSnackbar' && call.payload.role === 'alert')).to.equal(true);
    expect(dispatches.some((call) => call.type === 'doLogout')).to.equal(true);
    expect(pushes).to.deep.equal([{ name: 'Login' }]);
    expect(vm.sending).to.equal(false);
  });
});
