import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import SpamManagement from '@/views/management/SpamManagement.vue';
import spamApi from '@/api/spam';
import { createMountOptions, buildViewWithoutLifecycle } from './helpers';

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

const BaseEditDialogStub = {
  name: 'BaseEditDialog',
  props: {
    visible: Boolean,
    sending: Boolean,
    titleId: String,
    titleText: String,
    descriptionIds: String,
    cancelLabel: String,
    confirmLabel: String,
    progressMode: String,
    actionsAdjacent: Boolean,
    confirmDisabled: Boolean,
    confirmTestId: String,
    initialFocus: String,
  },
  emits: ['cancel', 'closed', 'confirm', 'update:visible'],
  template:
    '<section data-testid="base-edit-dialog-stub"><slot /><button :data-testid="confirmTestId" :disabled="sending || confirmDisabled">{{ confirmLabel }}</button></section>',
};

const ConfirmDialogStub = {
  name: 'ConfirmDialog',
  props: {
    dialogVisible: Boolean,
    title: String,
    titleId: String,
    message: String,
    confirmLabel: String,
    cancelLabel: String,
    sending: Boolean,
    actionsAdjacent: Boolean,
    closeOnConfirm: Boolean,
    closeOnEscape: Boolean,
    closeOnBackdrop: Boolean,
    initialFocus: String,
    confirmIcon: String,
    confirmTone: String,
    progressMode: String,
    confirmTestId: {
      type: String,
      default: 'confirm-dialog-confirm',
    },
  },
  emits: ['cancel', 'close', 'closed', 'confirm'],
  template:
    '<section data-testid="confirm-dialog-stub"><slot /><button :data-testid="confirmTestId" :disabled="sending">{{ confirmLabel }}</button></section>',
};

const SpamListBaseStub = {
  name: 'ManagementListBase',
  template: '<div><slot name="table" :items="[{ _id: \'spam-1\', word: \'blocked-word\', created_at: null }]" :table-attrs="{}" /><slot name="dialogs" /></div>',
};

const mountView = () => {
  const View = buildViewWithoutLifecycle(SpamManagement);
  return shallowMount(
    View,
    createMountOptions({
      stubs: {
        BaseEditDialog: BaseEditDialogStub,
        ConfirmDialog: ConfirmDialogStub,
      },
    })
  );
};

describe('スパムワードの管理画面', () => {
  let originalPaginate;
  let originalCreate;
  let originalUpdate;
  let originalRemove;

  beforeEach(() => {
    originalPaginate = spamApi.paginate;
    originalCreate = spamApi.create;
    originalUpdate = spamApi.update;
    originalRemove = spamApi.remove;
  });

  afterEach(() => {
    spamApi.paginate = originalPaginate;
    spamApi.create = originalCreate;
    spamApi.update = originalUpdate;
    spamApi.remove = originalRemove;
  });

  it('標準のスパムワード一覧ラベルと明示的な作成・削除操作を使用する', () => {
    const wrapper = mountView();
    const listBase = wrapper.findComponent({ name: 'ManagementListBase' });
    const submit = wrapper.find('[data-testid="management-spam-submit"]');
    const deleteConfirm = wrapper.find('[data-testid="management-spam-delete-confirm"]');

    expect(listBase.props('tableLabel')).to.equal('managementUi.tableLabel');
    expect(submit.text()).to.equal('作成');
    expect(deleteConfirm.text()).to.equal('managementUi.delete');
  });

  it('編集と物理削除を共通ダイアログ契約で表示する', async () => {
    const wrapper = mountView();
    wrapper.vm.showEditSpamDialog({ _id: 'spam-1', word: 'blocked-word' });
    await wrapper.vm.$nextTick();

    const editDialog = wrapper.findComponent(BaseEditDialogStub);
    const editContext = wrapper
      .findAllComponents({ name: 'DialogTargetContext' })
      .find((context) => context.props('contextId') === 'spam-management-target-context');

    expect(editDialog.props()).to.include({
      visible: true,
      titleId: 'spam-management-edit-dialog-title',
      titleText: 'スパムワード編集',
      descriptionIds: 'spam-management-target-context',
      cancelLabel: 'キャンセル',
      confirmLabel: 'managementUi.save',
      progressMode: 'indeterminate',
      actionsAdjacent: true,
      confirmDisabled: false,
      confirmTestId: 'management-spam-submit',
      initialFocus: '#spam-word',
    });
    expect(editContext.props()).to.include({
      label: '対象スパムワード',
      name: 'blocked-word',
    });

    wrapper.vm.showDeleteSpamDialog({ _id: 'spam-2', word: 'delete-target' });
    expect(wrapper.vm.deleteSpamValue.dialogVisible).to.equal(false);
    editDialog.vm.$emit('closed');
    await wrapper.vm.$nextTick();

    const deleteDialog = wrapper
      .findAllComponents(ConfirmDialogStub)
      .find((dialog) => dialog.props('confirmTestId') === 'management-spam-delete-confirm');
    const deleteContext = wrapper
      .findAllComponents({ name: 'DialogTargetContext' })
      .find((context) => context.props('contextId') === 'spam-management-delete-target-context');

    expect(deleteDialog.props()).to.include({
      dialogVisible: true,
      title: 'スパムワード削除',
      titleId: 'spam-management-delete-dialog-title',
      confirmLabel: 'managementUi.delete',
      cancelLabel: 'キャンセル',
      actionsAdjacent: true,
      closeOnConfirm: false,
      closeOnEscape: true,
      closeOnBackdrop: true,
      initialFocus: "[data-testid='confirm-dialog-cancel']",
      confirmIcon: 'delete',
      confirmTone: 'danger',
      progressMode: 'indeterminate',
    });
    expect(deleteContext.props()).to.include({
      label: '対象スパムワード',
      name: 'delete-target',
    });
  });

  it('編集値が入力検証違反の間は共通ダイアログの確認操作を無効にする', async () => {
    const wrapper = mountView();
    wrapper.vm.showEditSpamDialog();
    await wrapper.vm.$nextTick();

    expect(wrapper.findComponent(BaseEditDialogStub).props('confirmDisabled')).to.equal(true);

    await wrapper.setData({
      editSpamValue: {
        ...wrapper.vm.editSpamValue,
        word: 'valid-word',
      },
    });
    await flushPromises();

    expect(wrapper.findComponent(BaseEditDialogStub).props('confirmDisabled')).to.equal(false);
  });

  it('削除操作の読み上げ用の名前に対象スパムワードを含める', () => {
    const View = buildViewWithoutLifecycle(SpamManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({
        stubs: { ManagementListBase: SpamListBaseStub },
        mocks: {
          $t: (key, params) =>
            key === 'managementUi.deleteResourceAria'
              ? `${params.resource}「${params.name}」を削除`
              : key,
        },
      })
    );

    expect(wrapper.find('[data-testid="management-spam-delete"]').attributes('aria-label')).to.equal(
      'スパムワード「blocked-word」を削除'
    );
  });

  it('スパムワードは入力前に入力検証エラーを表示しない', async () => {
    const View = buildViewWithoutLifecycle(SpamManagement);
    const wrapper = shallowMount(View, createMountOptions());

    expect(wrapper.vm.wordError).to.equal('');

    wrapper.vm.v$.editSpamValue.word.$touch();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.wordError).to.equal('必須です');
  });

  it('検索文字を整形してスパム取得を行う', async () => {
    const calls = [];
    spamApi.paginate = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: { docs: [], page: 1, pages: 1, total: 0 } });
    };

    const View = buildViewWithoutLifecycle(SpamManagement);
    const wrapper = shallowMount(View, createMountOptions());
    const payload = wrapper.vm.buildSearchPayload({ page: 1, search: '  spam ' });
    await wrapper.vm.fetchSpam(payload);

    expect(payload).to.deep.equal({ page: 1, search: 'spam' });
    expect(calls[0]).to.deep.equal({ page: 1, search: 'spam' });
  });

  it('showEditSpamDialog は既存データを編集値に展開する', () => {
    const View = buildViewWithoutLifecycle(SpamManagement);
    const wrapper = shallowMount(View, createMountOptions());
    const spam = { _id: 'spam-1', word: 'abc' };

    wrapper.vm.showEditSpamDialog(spam);

    expect(wrapper.vm.editSpamValue).to.deep.equal({
      dialogVisible: true,
      _id: 'spam-1',
      word: 'abc',
    });
  });

  it('新規作成はAPIと一覧再取得の完了後もclosedまで編集対象を維持する', async () => {
    const mutation = createDeferred();
    const reload = createDeferred();
    const createCalls = [];
    spamApi.create = (payload) => {
      createCalls.push(payload);
      return mutation.promise;
    };

    let reloadCount = 0;
    const wrapper = mountView();
    Object.assign(wrapper.vm.$refs.listBase, {
      reload: () => {
        reloadCount += 1;
        return reload.promise;
      },
      showError: () => {},
    });
    await wrapper.setData({
      editSpamValue: {
        dialogVisible: true,
        _id: null,
        word: '  spam-word  ',
      },
      sending: false,
    });

    const operation = wrapper.vm.editSpam();
    await wrapper.vm.$nextTick();

    const editDialog = wrapper.findComponent(BaseEditDialogStub);
    await flushPromises();

    expect(createCalls).to.deep.equal([{ word: 'spam-word' }]);
    expect(reloadCount).to.equal(0);
    expect(wrapper.vm.sending).to.equal(true);
    expect(wrapper.vm.editSpamValue.word).to.equal('  spam-word  ');
    expect(wrapper.vm.editSpamValue.dialogVisible).to.equal(true);
    expect(editDialog.props()).to.include({
      sending: true,
      progressMode: 'indeterminate',
      actionsAdjacent: true,
    });

    wrapper.vm.clearEditSpamValue();
    wrapper.vm.editSpam();
    expect(createCalls).to.have.lengthOf(1);
    expect(wrapper.vm.editSpamValue.dialogVisible).to.equal(true);

    mutation.resolve();
    await flushPromises();

    expect(reloadCount).to.equal(1);
    expect(wrapper.vm.sending).to.equal(true);
    expect(wrapper.vm.editSpamValue.word).to.equal('  spam-word  ');
    expect(wrapper.vm.editSpamValue.dialogVisible).to.equal(true);

    reload.resolve();
    await operation;
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.editSpamValue._id).to.equal(null);
    expect(wrapper.vm.editSpamValue.word).to.equal('  spam-word  ');
    expect(wrapper.vm.editSpamValue.dialogVisible).to.equal(false);

    editDialog.vm.$emit('closed');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.editSpamValue.word).to.equal(null);
  });

  it('更新は一覧再取得の成否確定後もclosedまで編集対象を維持する', async () => {
    const mutation = createDeferred();
    const reload = createDeferred();
    const updateCalls = [];
    spamApi.update = (payload) => {
      updateCalls.push(payload);
      return mutation.promise;
    };

    let reloadCount = 0;
    const showErrorCalls = [];
    const wrapper = mountView();
    Object.assign(wrapper.vm.$refs.listBase, {
      reload: () => {
        reloadCount += 1;
        return reload.promise;
      },
      showError: (...args) => showErrorCalls.push(args),
    });
    await wrapper.setData({
      editSpamValue: {
        dialogVisible: true,
        _id: 'spam-2',
        word: '  updated  ',
      },
      sending: false,
    });

    const operation = wrapper.vm.editSpam();
    const editDialog = wrapper.findComponent(BaseEditDialogStub);
    await flushPromises();

    expect(updateCalls).to.deep.equal([{ _id: 'spam-2', word: 'updated' }]);
    expect(reloadCount).to.equal(0);
    expect(wrapper.vm.sending).to.equal(true);
    expect(wrapper.vm.editSpamValue._id).to.equal('spam-2');

    mutation.resolve();
    await flushPromises();

    expect(reloadCount).to.equal(1);
    expect(wrapper.vm.sending).to.equal(true);
    expect(wrapper.vm.editSpamValue.dialogVisible).to.equal(true);
    expect(wrapper.vm.editSpamValue.word).to.equal('  updated  ');

    reload.reject(new Error('reload failed'));
    await operation;

    expect(showErrorCalls).to.have.lengthOf(0);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.editSpamValue.dialogVisible).to.equal(false);
    expect(wrapper.vm.editSpamValue._id).to.equal('spam-2');
    expect(wrapper.vm.editSpamValue.word).to.equal('  updated  ');

    editDialog.vm.$emit('closed');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.editSpamValue._id).to.equal(null);
    expect(wrapper.vm.editSpamValue.word).to.equal(null);
  });

  [
    { label: '作成', method: 'create', id: null, errorMessage: '作成に失敗しました' },
    { label: '更新', method: 'update', id: 'spam-2', errorMessage: '更新に失敗しました' },
  ].forEach(({ label, method, id, errorMessage }) => {
    it(`${label}API失敗時は一覧を再取得せず編集対象を維持して再操作できる`, async () => {
      const apiError = new Error('mutation failed');
      const apiCalls = [];
      spamApi[method] = (payload) => {
        apiCalls.push(payload);
        return apiCalls.length === 1 ? Promise.reject(apiError) : Promise.resolve();
      };

      const reloadCalls = [];
      const showErrorCalls = [];
      const wrapper = mountView();
      Object.assign(wrapper.vm.$refs.listBase, {
        reload: () => {
          reloadCalls.push('reload');
          return Promise.resolve();
        },
        showError: (...args) => showErrorCalls.push(args),
      });
      await wrapper.setData({
        editSpamValue: {
          dialogVisible: true,
          _id: id,
          word: 'target',
        },
      });

      await wrapper.vm.editSpam();

      expect(reloadCalls).to.have.lengthOf(0);
      expect(showErrorCalls).to.deep.equal([[errorMessage, apiError]]);
      expect(wrapper.vm.sending).to.equal(false);
      expect(wrapper.vm.editSpamValue).to.deep.equal({
        dialogVisible: true,
        _id: id,
        word: 'target',
      });

      await wrapper.vm.editSpam();

      expect(apiCalls).to.have.lengthOf(2);
      expect(reloadCalls).to.deep.equal(['reload']);
      expect(wrapper.vm.editSpamValue.dialogVisible).to.equal(false);
    });
  });

  it('showDeleteSpamDialog は編集ダイアログのclosed後に削除ダイアログを開く', async () => {
    const View = buildViewWithoutLifecycle(SpamManagement);
    const wrapper = shallowMount(View, createMountOptions());
    wrapper.setData({
      editSpamValue: { dialogVisible: true, _id: 'spam-2', word: 'x' },
      deleteSpamValue: { dialogVisible: false },
    });
    await wrapper.vm.$nextTick();

    wrapper.vm.showDeleteSpamDialog();

    expect(wrapper.vm.editSpamValue.dialogVisible).to.equal(false);
    expect(wrapper.vm.deleteSpamValue.dialogVisible).to.equal(false);
    expect(wrapper.vm.deleteOpenPending).to.equal(true);
    expect(wrapper.vm.editSpamValue._id).to.equal('spam-2');

    wrapper.vm.handleSpamFormDialogClosed();

    expect(wrapper.vm.deleteSpamValue.dialogVisible).to.equal(true);
    expect(wrapper.vm.deleteOpenPending).to.equal(false);
    expect(wrapper.vm.editSpamValue._id).to.equal('spam-2');
  });

  it('物理削除後は削除確認のclosed後に隣接行へフォーカスを戻す', async () => {
    const wrapper = mountView();
    const focusRequest = { candidateIds: ['spam-next'] };
    const restored = [];
    Object.assign(wrapper.vm.$refs.listBase, {
      createLifecycleFocusRequest: () => focusRequest,
      restoreLifecycleFocus: (request) => restored.push(request),
    });

    wrapper.vm.showDeleteSpamDialog({ _id: 'spam-1', word: 'target' });
    wrapper.vm.deleteFocusAfterMutation = true;
    wrapper.vm.closeSpamDeleteDialog();

    expect(wrapper.vm.editSpamValue._id).to.equal('spam-1');
    expect(restored).to.deep.equal([]);

    wrapper.vm.handleSpamDeleteDialogClosed();

    expect(restored).to.deep.equal([focusRequest]);
    expect(wrapper.vm.editSpamValue._id).to.equal(null);
  });

  it('deleteSpam はAPIと一覧再取得の完了後もclosedまで削除対象を維持する', async () => {
    const mutation = createDeferred();
    const reload = createDeferred();
    const removeCalls = [];
    spamApi.remove = (payload) => {
      removeCalls.push(payload);
      return mutation.promise;
    };

    let reloadCount = 0;
    const wrapper = mountView();
    Object.assign(wrapper.vm.$refs.listBase, {
      reload: () => {
        reloadCount += 1;
        return reload.promise;
      },
      showError: () => {},
    });
    await wrapper.setData({
      editSpamValue: {
        dialogVisible: false,
        _id: 'spam-3',
        word: 'target',
      },
      deleteSpamValue: {
        dialogVisible: true,
      },
      sending: false,
    });

    const operation = wrapper.vm.deleteSpam();
    await wrapper.vm.$nextTick();

    const deleteDialog = wrapper
      .findAllComponents(ConfirmDialogStub)
      .find((dialog) => dialog.props('confirmTestId') === 'management-spam-delete-confirm');
    await flushPromises();

    expect(removeCalls).to.deep.equal([{ _id: 'spam-3' }]);
    expect(reloadCount).to.equal(0);
    expect(wrapper.vm.sending).to.equal(true);
    expect(wrapper.vm.editSpamValue.word).to.equal('target');
    expect(wrapper.vm.deleteSpamValue.dialogVisible).to.equal(true);
    expect(deleteDialog.props()).to.include({
      sending: true,
      closeOnConfirm: false,
      closeOnEscape: true,
      closeOnBackdrop: true,
      progressMode: 'indeterminate',
    });

    wrapper.vm.clearEditSpamValue();
    wrapper.vm.deleteSpam();
    expect(removeCalls).to.have.lengthOf(1);
    expect(wrapper.vm.deleteSpamValue.dialogVisible).to.equal(true);

    mutation.resolve();
    await flushPromises();

    expect(reloadCount).to.equal(1);
    expect(wrapper.vm.sending).to.equal(true);
    expect(wrapper.vm.editSpamValue._id).to.equal('spam-3');
    expect(wrapper.vm.editSpamValue.word).to.equal('target');
    expect(wrapper.vm.deleteSpamValue.dialogVisible).to.equal(true);

    reload.resolve();
    await operation;
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.editSpamValue._id).to.equal('spam-3');
    expect(wrapper.vm.editSpamValue.word).to.equal('target');
    expect(wrapper.vm.deleteSpamValue.dialogVisible).to.equal(false);

    deleteDialog.vm.$emit('closed');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.editSpamValue._id).to.equal(null);
    expect(wrapper.vm.editSpamValue.word).to.equal(null);
  });

  it('deleteSpam はAPI失敗時に一覧を再取得せず削除対象を維持して再操作できる', async () => {
    const apiError = new Error('mutation failed');
    const removeCalls = [];
    spamApi.remove = (payload) => {
      removeCalls.push(payload);
      return removeCalls.length === 1 ? Promise.reject(apiError) : Promise.resolve();
    };

    const reloadCalls = [];
    const showErrorCalls = [];
    const wrapper = mountView();
    Object.assign(wrapper.vm.$refs.listBase, {
      reload: () => {
        reloadCalls.push('reload');
        return Promise.resolve();
      },
      showError: (...args) => showErrorCalls.push(args),
    });
    await wrapper.setData({
      editSpamValue: {
        dialogVisible: false,
        _id: 'spam-4',
        word: 'target',
      },
      deleteSpamValue: {
        dialogVisible: true,
      },
    });

    await wrapper.vm.deleteSpam();

    expect(reloadCalls).to.have.lengthOf(0);
    expect(showErrorCalls).to.deep.equal([['削除に失敗しました', apiError]]);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.editSpamValue._id).to.equal('spam-4');
    expect(wrapper.vm.editSpamValue.word).to.equal('target');
    expect(wrapper.vm.deleteSpamValue.dialogVisible).to.equal(true);

    await wrapper.vm.deleteSpam();

    expect(removeCalls).to.have.lengthOf(2);
    expect(reloadCalls).to.deep.equal(['reload']);
    expect(wrapper.vm.deleteSpamValue.dialogVisible).to.equal(false);
  });

  it('deleteSpam は一覧再取得失敗を削除エラーに変換せずダイアログを閉じる', async () => {
    spamApi.remove = () => Promise.resolve();

    const showErrorCalls = [];
    const wrapper = mountView();
    Object.assign(wrapper.vm.$refs.listBase, {
      reload: () => Promise.reject(new Error('reload failed')),
      showError: (...args) => showErrorCalls.push(args),
    });
    await wrapper.setData({
      editSpamValue: {
        dialogVisible: false,
        _id: 'spam-5',
        word: 'target',
      },
      deleteSpamValue: {
        dialogVisible: true,
      },
    });

    await wrapper.vm.deleteSpam();

    expect(showErrorCalls).to.have.lengthOf(0);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.editSpamValue._id).to.equal('spam-5');
    expect(wrapper.vm.editSpamValue.word).to.equal('target');
    expect(wrapper.vm.deleteSpamValue.dialogVisible).to.equal(false);

    const deleteDialog = wrapper
      .findAllComponents(ConfirmDialogStub)
      .find((dialog) => dialog.props('confirmTestId') === 'management-spam-delete-confirm');
    deleteDialog.vm.$emit('closed');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.editSpamValue._id).to.equal(null);
    expect(wrapper.vm.editSpamValue.word).to.equal(null);
  });

  it('取消では対象を保持したままダイアログを非表示にし、closedイベントの後に編集対象を解除する', async () => {
    const wrapper = mountView();
    wrapper.vm.showEditSpamDialog({ _id: 'spam-cancel', word: 'cancel-target' });
    const editDialog = wrapper.findComponent(BaseEditDialogStub);

    wrapper.vm.requestCloseSpamDialog();

    expect(wrapper.vm.editSpamValue.dialogVisible).to.equal(false);
    expect(wrapper.vm.editSpamValue._id).to.equal('spam-cancel');
    expect(wrapper.vm.editSpamValue.word).to.equal('cancel-target');

    editDialog.vm.$emit('closed');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.editSpamValue._id).to.equal(null);
    expect(wrapper.vm.editSpamValue.word).to.equal(null);

    wrapper.vm.showDeleteSpamDialog({ _id: 'spam-delete-cancel', word: 'delete-cancel-target' });
    const deleteDialog = wrapper
      .findAllComponents(ConfirmDialogStub)
      .find((dialog) => dialog.props('confirmTestId') === 'management-spam-delete-confirm');

    wrapper.vm.requestCloseDeleteSpamDialog();

    expect(wrapper.vm.deleteSpamValue.dialogVisible).to.equal(false);
    expect(wrapper.vm.editSpamValue._id).to.equal('spam-delete-cancel');
    expect(wrapper.vm.editSpamValue.word).to.equal('delete-cancel-target');

    deleteDialog.vm.$emit('closed');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.editSpamValue._id).to.equal(null);
    expect(wrapper.vm.editSpamValue.word).to.equal(null);
  });

  it('一覧から削除確認を開き、編集を破棄した場合はフォームのclosedイベントの後に編集対象を解除する', async () => {
    const wrapper = mountView();
    wrapper.vm.showDeleteSpamDialog({ _id: 'spam-6', word: 'target' });
    expect(wrapper.vm.deleteSpamValue.dialogVisible).to.equal(true);
    expect(wrapper.vm.selectedSpamWord).to.equal('target');

    wrapper.vm.clearEditSpamValue();
    wrapper.vm.showEditSpamDialog({ _id: 'spam-7', word: 'before' });
    wrapper.vm.editSpamValue.word = 'after';
    wrapper.vm.requestCloseSpamDialog();
    const editDialog = wrapper.findComponent(BaseEditDialogStub);
    const discardDialog = wrapper
      .findAllComponents(ConfirmDialogStub)
      .find((dialog) => dialog.props('title') === '破棄');
    expect(wrapper.vm.discardConfirmVisible).to.equal(true);
    expect(wrapper.vm.editSpamValue.dialogVisible).to.equal(true);

    wrapper.vm.confirmDiscardChanges();
    expect(wrapper.vm.editSpamValue.dialogVisible).to.equal(true);
    expect(wrapper.vm.discardClosePending).to.equal(true);
    discardDialog.vm.$emit('closed');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.editSpamValue.dialogVisible).to.equal(false);
    expect(wrapper.vm.editSpamValue._id).to.equal('spam-7');
    expect(wrapper.vm.editSpamValue.word).to.equal('after');

    editDialog.vm.$emit('closed');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.editSpamValue._id).to.equal(null);
    expect(wrapper.vm.editSpamValue.word).to.equal(null);
  });
});
