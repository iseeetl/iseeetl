import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import CategoryTagManagement from '@/views/management/CategoryTagManagement.vue';
import tagApi from '@/api/tag';
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

const ManagementListBaseRowsStub = {
  name: 'ManagementListBase',
  props: ['title', 'tableLabel', 'payloadBuilder'],
  data() {
    return { rows: [] };
  },
  computed: {
    tableAttrs() {
      return { 'aria-label': this.tableLabel || this.title };
    },
  },
  methods: {
    reload() {},
    reloadFromFirstPage() {},
    setItems() {},
    showError() {},
    showSnackbar() {},
  },
  template: `
    <div>
      <slot name="header" :fetching="false" />
      <slot name="actions" :fetching="false" />
      <slot name="filters" :fetching="false" />
      <slot name="table" :items="rows" :table-attrs="tableAttrs" />
      <slot name="dialogs" />
    </div>
  `,
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
    cancelTestId: String,
    confirmTestId: String,
    actionsAdjacent: Boolean,
    initialFocus: String,
    progressMode: String,
  },
  emits: ['cancel', 'closed', 'confirm', 'update:visible'],
  template: '<section><h2 :id="titleId">{{ titleText }}</h2><slot /></section>',
};

const ConfirmDialogStub = {
  name: 'ConfirmDialog',
  props: {
    dialogVisible: Boolean,
    sending: Boolean,
    title: String,
    titleId: String,
    cancelLabel: String,
    confirmLabel: String,
    cancelTestId: String,
    confirmTestId: String,
    actionsAdjacent: Boolean,
    closeOnConfirm: Boolean,
    closeOnEscape: Boolean,
    closeOnBackdrop: Boolean,
    initialFocus: String,
    confirmIcon: String,
    confirmTone: String,
    progressMode: String,
  },
  emits: ['cancel', 'closed', 'confirm'],
  template: '<section><h2 :id="titleId">{{ title }}</h2><slot /></section>',
};

describe('共通タグの管理画面', () => {
  let originalPaginate;
  let originalCreate;
  let originalUpdate;
  let originalRemove;
  let originalImportCsv;
  let originalExportCsv;
  let originalFileReader;
  let originalCreateElement;
  let originalUrl;
  let originalUrlCreate;
  let originalUrlRevoke;

  beforeEach(() => {
    originalPaginate = tagApi.categoryTag.paginate;
    originalCreate = tagApi.categoryTag.create;
    originalUpdate = tagApi.categoryTag.update;
    originalRemove = tagApi.categoryTag.remove;
    originalImportCsv = tagApi.categoryTag.importCsv;
    originalExportCsv = tagApi.categoryTag.exportCsv;
    originalFileReader = global.FileReader;
    originalCreateElement = document.createElement;
    originalUrl = global.URL;
    originalUrlCreate = originalUrl ? originalUrl.createObjectURL : undefined;
    originalUrlRevoke = originalUrl ? originalUrl.revokeObjectURL : undefined;
  });

  afterEach(() => {
    tagApi.categoryTag.paginate = originalPaginate;
    tagApi.categoryTag.create = originalCreate;
    tagApi.categoryTag.update = originalUpdate;
    tagApi.categoryTag.remove = originalRemove;
    tagApi.categoryTag.importCsv = originalImportCsv;
    tagApi.categoryTag.exportCsv = originalExportCsv;
    if (originalFileReader) {
      global.FileReader = originalFileReader;
    } else {
      delete global.FileReader;
    }
    document.createElement = originalCreateElement;
    if (originalUrl) {
      global.URL = originalUrl;
      global.URL.createObjectURL = originalUrlCreate;
      global.URL.revokeObjectURL = originalUrlRevoke;
    } else {
      delete global.URL;
    }
  });

  it('タグ名の手入力とCSV入力に計測用の名称案内を表示しない', () => {
    const View = buildViewWithoutLifecycle(CategoryTagManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({ stubs: { ConfirmDialog: ConfirmDialogStub } })
    );

    expect(wrapper.get('#csvupload').attributes('aria-describedby')).to.equal(undefined);
    expect(wrapper.findAllComponents({ name: 'AnalyticsResourceNotice' })).to.have.lengthOf(0);
    expect(wrapper.get('#csvupload').classes()).to.include('display-none-input');
    expect(wrapper.get('[data-testid="management-categorytag-import"]').text()).to.equal(
      'managementUi.importCsv'
    );
    expect(wrapper.get('[data-testid="management-categorytag-export"]').text()).to.equal(
      'managementUi.exportCsv'
    );
    expect(wrapper.get('[data-testid="management-categorytag-create"]').text()).to.equal('作成');
  });

  it('共通タグの取得で管理APIを呼ぶ', async () => {
    const calls = [];
    tagApi.categoryTag.paginate = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: { docs: [], page: 1, pages: 1, total: 0 } });
    };

    const View = buildViewWithoutLifecycle(CategoryTagManagement);
    const wrapper = shallowMount(View, createMountOptions());
    await wrapper.vm.fetchCategoryTag({ page: 2, search: 'tag' });

    expect(calls[0]).to.deep.equal({ page: 2, search: 'tag' });
  });

  it('一覧はページと検索語だけを送り、削除状態の絞り込みを表示しない', () => {
    const View = buildViewWithoutLifecycle(CategoryTagManagement);
    const wrapper = shallowMount(View, createMountOptions());
    expect(wrapper.vm.buildListPayload({ page: 2, search: 'tag' })).to.deep.equal({ page: 2, search: 'tag' });
    expect(wrapper.findComponent({ name: 'ManagementStatusFilter' }).exists()).to.equal(false);
  });

  it('行クリックに依存せず、有効行は削除、編集の順、復元操作を表示しない', async () => {
    const View = buildViewWithoutLifecycle(CategoryTagManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({ stubs: { ManagementListBase: ManagementListBaseRowsStub } })
    );
    const listBase = wrapper.findComponent(ManagementListBaseRowsStub);
    await listBase.setData({
      rows: [
        { _id: 'active', order: 1, name: 'active', delete_flg: false },
        { _id: 'deleted', order: 2, name: 'deleted', delete_flg: true },
      ],
    });

    expect(wrapper.findAll('[data-testid="management-categorytag-edit"]')).to.have.lengthOf(2);
    expect(wrapper.findAll('[data-testid="management-categorytag-lifecycle"]')).to.have.lengthOf(2);
    expect(wrapper.findAll('.management-table__interactive-row')).to.have.lengthOf(0);
    expect(wrapper.get('table').attributes('aria-label')).to.equal('managementUi.tableLabel');
    expect(wrapper.findAllComponents({ name: 'ManagementStatusBadge' })).to.have.lengthOf(0);
    const rows = wrapper.findAll('tbody tr');
    expect(rows[0].findAllComponents({ name: 'UiButton' }).map((button) => button.text())).to.deep.equal([
      'managementUi.delete',
      'managementUi.edit',
    ]);
    expect(rows[1].findAllComponents({ name: 'UiButton' }).map((button) => button.text())).to.deep.equal([
      'managementUi.delete',
      'managementUi.edit',
    ]);
    expect(wrapper.get('table').classes()).to.include('management-table--wide');
  });

  it('新規ダイアログ表示時は編集値を初期化する', async () => {
    const View = buildViewWithoutLifecycle(CategoryTagManagement);
    const wrapper = shallowMount(View, createMountOptions());

    wrapper.setData({
      dialogVisible: false,
      id: 'tag-1',
      order: 12,
      name: 'before',
      delete_flg: true,
    });
    await wrapper.vm.$nextTick();

    wrapper.vm.showEditCategoryTagDialog();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.dialogVisible).to.equal(true);
    expect(wrapper.vm.id).to.equal(null);
    expect(wrapper.vm.order).to.equal(null);
    expect(wrapper.vm.name).to.equal(null);
    expect(wrapper.vm.categoryTagDialogTitle).to.equal('共通タグ - 作成');
    expect(wrapper.vm.categoryTagSubmitLabel).to.equal('作成');
    expect(wrapper.vm.categoryTagDialogDescriptionIds).to.equal('');
    expect(wrapper.findComponent({ name: 'DialogTargetContext' }).exists()).to.equal(false);
  });

  it('編集ダイアログは保存済み対象名、編集タイトル、隣接したキャンセルと保存を表示する', async () => {
    const View = buildViewWithoutLifecycle(CategoryTagManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({ stubs: { BaseEditDialog: BaseEditDialogStub } })
    );

    wrapper.vm.showEditCategoryTagDialog({
      _id: 'tag-1',
      order: 4,
      name: '保存済み共通タグ',
      delete_flg: false,
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.categoryTagDialogTitle).to.equal('共通タグ - 編集');
    expect(wrapper.vm.categoryTagSubmitLabel).to.equal('managementUi.save');
    expect(wrapper.vm.categoryTagDialogDescriptionIds).to.equal(
      'category-tag-management-target-context'
    );
    expect(wrapper.findComponent({ name: 'DialogTargetContext' }).props()).to.include({
      contextId: 'category-tag-management-target-context',
      label: '対象タグ',
      name: '保存済み共通タグ',
    });
    expect(wrapper.findComponent(BaseEditDialogStub).props()).to.include({
      visible: true,
      sending: false,
      titleId: 'category-tag-management-dialog-title',
      titleText: '共通タグ - 編集',
      descriptionIds: 'category-tag-management-target-context',
      cancelLabel: 'キャンセル',
      confirmLabel: 'managementUi.save',
      confirmTestId: 'management-categorytag-submit',
      actionsAdjacent: true,
      initialFocus: '#category-tag-order',
      progressMode: 'indeterminate',
    });
    expect(wrapper.findComponent({ name: 'ConfirmDialog' }).props()).to.include({
      actionsAdjacent: true,
      closeOnEscape: true,
      closeOnBackdrop: true,
      confirmIcon: 'delete',
    });
  });

  it('作成・編集内容を変更後に閉じる場合だけ破棄確認し、対象名は保存済み値を維持する', async () => {
    const View = buildViewWithoutLifecycle(CategoryTagManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({ stubs: { BaseEditDialog: BaseEditDialogStub } })
    );

    wrapper.vm.showEditCategoryTagDialog({
      _id: 'tag-1',
      order: 4,
      name: '保存済み共通タグ',
      delete_flg: false,
    });
    const editDialog = wrapper.findComponent(BaseEditDialogStub);
    wrapper.vm.requestCloseCategoryTagDialog();
    expect(wrapper.vm.dialogVisible).to.equal(false);
    expect(wrapper.vm.discardConfirmVisible).to.equal(false);
    expect(wrapper.vm.id).to.equal('tag-1');
    expect(wrapper.vm.name).to.equal('保存済み共通タグ');
    expect(wrapper.vm.selectedCategoryTagName).to.equal('保存済み共通タグ');

    editDialog.vm.$emit('closed');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.id).to.equal(null);
    expect(wrapper.vm.name).to.equal(null);
    expect(wrapper.vm.selectedCategoryTagName).to.equal('');

    wrapper.vm.showEditCategoryTagDialog({
      _id: 'tag-1',
      order: 4,
      name: '保存済み共通タグ',
      delete_flg: false,
    });
    await wrapper.setData({ name: '変更後のタグ' });
    wrapper.vm.requestCloseCategoryTagDialog();

    expect(wrapper.vm.dialogVisible).to.equal(true);
    expect(wrapper.vm.selectedCategoryTagName).to.equal('保存済み共通タグ');
    expect(wrapper.vm.discardConfirmVisible).to.equal(true);

    wrapper.vm.cancelDiscardChanges();
    expect(wrapper.vm.dialogVisible).to.equal(true);
    expect(wrapper.vm.discardConfirmVisible).to.equal(false);
    const discardDialog = wrapper.findComponent({ name: 'ConfirmDialog' });
    discardDialog.vm.$emit('closed');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.dialogVisible).to.equal(true);

    wrapper.vm.requestCloseCategoryTagDialog();
    wrapper.vm.confirmDiscardChanges();
    expect(wrapper.vm.dialogVisible).to.equal(true);
    expect(wrapper.vm.discardClosePending).to.equal(true);
    discardDialog.vm.$emit('closed');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.dialogVisible).to.equal(false);
    expect(wrapper.vm.discardConfirmVisible).to.equal(false);
    expect(wrapper.vm.id).to.equal('tag-1');
    expect(wrapper.vm.name).to.equal('変更後のタグ');
    expect(wrapper.vm.selectedCategoryTagName).to.equal('保存済み共通タグ');

    editDialog.vm.$emit('closed');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.id).to.equal(null);
    expect(wrapper.vm.name).to.equal(null);
    expect(wrapper.vm.selectedCategoryTagName).to.equal('');
  });

  it('タグ名は入力前に入力検証エラーを表示しない', async () => {
    const View = buildViewWithoutLifecycle(CategoryTagManagement);
    const wrapper = shallowMount(View, createMountOptions());

    expect(wrapper.vm.nameError).to.equal('');

    wrapper.vm.v$.name.$touch();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.nameError).to.equal('必須');
  });

  it('表示順番が小数なら送信せず snackbar を表示する', async () => {
    let createCalled = false;
    tagApi.categoryTag.create = () => {
      createCalled = true;
      return Promise.resolve();
    };

    const snackbar = [];
    const View = buildViewWithoutLifecycle(CategoryTagManagement);
    const wrapper = shallowMount(View, createMountOptions());
    Object.assign(wrapper.vm.$refs.listBase, {
      showSnackbar: (message) => snackbar.push(message),
      reload: () => {},
      showError: () => {},
    });

    wrapper.setData({
      id: null,
      order: '1.5',
      name: 'tag-name',
      dialogVisible: true,
      sending: false,
    });
    await wrapper.vm.$nextTick();

    wrapper.vm.editCategoryTag();

    expect(createCalled).to.equal(false);
    expect(wrapper.vm.sending).to.equal(false);
    expect(snackbar).to.deep.equal(['表示順番は1以上、100以下の整数です']);
  });

  it('新規作成時は空の表示順番を 100 に補完し、closedイベントの後に入力を初期化する', async () => {
    const createCalls = [];
    tagApi.categoryTag.create = (payload) => {
      createCalls.push(payload);
      return Promise.resolve();
    };

    let reloadCount = 0;
    const View = buildViewWithoutLifecycle(CategoryTagManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({ stubs: { BaseEditDialog: BaseEditDialogStub } })
    );
    Object.assign(wrapper.vm.$refs.listBase, {
      showSnackbar: () => {},
      reload: () => {
        reloadCount += 1;
      },
      showError: () => {},
    });

    wrapper.setData({
      id: null,
      order: '',
      name: 'new-tag',
      delete_flg: false,
      dialogVisible: true,
      sending: false,
    });
    await wrapper.vm.$nextTick();

    wrapper.vm.editCategoryTag();
    await flushPromises();

    expect(createCalls).to.deep.equal([{ order: 100, name: 'new-tag' }]);
    expect(reloadCount).to.equal(1);
    expect(wrapper.vm.dialogVisible).to.equal(false);
    expect(wrapper.vm.order).to.equal(100);
    expect(wrapper.vm.name).to.equal('new-tag');
    expect(wrapper.vm.sending).to.equal(false);

    wrapper.findComponent(BaseEditDialogStub).vm.$emit('closed');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.order).to.equal(null);
    expect(wrapper.vm.name).to.equal(null);
  });

  it('更新時は編集内容だけを送り、closedイベントの後に入力を初期化する', async () => {
    const updateCalls = [];
    tagApi.categoryTag.update = (payload) => {
      updateCalls.push(payload);
      return Promise.resolve();
    };

    let reloadCount = 0;
    const View = buildViewWithoutLifecycle(CategoryTagManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({ stubs: { BaseEditDialog: BaseEditDialogStub } })
    );
    Object.assign(wrapper.vm.$refs.listBase, {
      showSnackbar: () => {},
      reload: () => {
        reloadCount += 1;
      },
      showError: () => {},
    });

    wrapper.setData({
      id: 'ct-1',
      order: '7',
      name: 'updated',
      delete_flg: true,
      dialogVisible: true,
      sending: false,
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.find('#delete_flg').exists()).to.equal(false);

    wrapper.vm.editCategoryTag();
    await flushPromises();

    expect(updateCalls).to.deep.equal([{ _id: 'ct-1', order: 7, name: 'updated' }]);
    expect(reloadCount).to.equal(1);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.dialogVisible).to.equal(false);
    expect(wrapper.vm.id).to.equal('ct-1');
    expect(wrapper.vm.name).to.equal('updated');

    wrapper.findComponent(BaseEditDialogStub).vm.$emit('closed');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.id).to.equal(null);
    expect(wrapper.vm.name).to.equal(null);
  });

  [
    { label: '作成', id: null, method: 'create', errorMessage: '作成に失敗しました' },
    { label: '更新', id: 'ct-error', method: 'update', errorMessage: '更新に失敗しました' },
  ].forEach(({ label, id, method, errorMessage }) => {
    it(`${label}失敗時は操作に対応するエラーを表示して入力を維持する`, async () => {
      const apiError = new Error('failed');
      tagApi.categoryTag[method] = () => Promise.reject(apiError);
      const View = buildViewWithoutLifecycle(CategoryTagManagement);
      const wrapper = shallowMount(View, createMountOptions());
      const showErrorCalls = [];
      wrapper.vm.$refs.listBase.showError = (...args) => showErrorCalls.push(args);
      await wrapper.setData({
        id,
        order: 5,
        name: 'target',
        delete_flg: false,
        dialogVisible: true,
      });

      await wrapper.vm.editCategoryTag();

      expect(showErrorCalls).to.deep.equal([[errorMessage, apiError]]);
      expect(wrapper.vm.sending).to.equal(false);
      expect(wrapper.vm.dialogVisible).to.equal(true);
      expect(wrapper.vm.name).to.equal('target');
    });
  });

  it('削除APIと一覧再取得が完了するまで対象と送信状態を維持する', async () => {
    const mutation = createDeferred();
    const reload = createDeferred();
    const calls = [];
    tagApi.categoryTag.remove = (payload) => {
      calls.push(payload);
      return mutation.promise;
    };
    const View = buildViewWithoutLifecycle(CategoryTagManagement);
    const wrapper = shallowMount(View, createMountOptions());
    const reloadCalls = [];
    Object.assign(wrapper.vm.$refs.listBase, {
      reload: () => {
        reloadCalls.push('reload');
        return reload.promise;
      },
      showError: () => {},
    });
    wrapper.vm.showLifecycleDialog({ _id: 'ct-1', name: 'tag', delete_flg: false });

    const operation = wrapper.vm.deleteTag();
    await wrapper.vm.$nextTick();

    expect(calls).to.deep.equal([{ _id: 'ct-1' }]);
    expect(wrapper.vm.sending).to.equal(true);
    expect(wrapper.vm.lifecycleTarget._id).to.equal('ct-1');
    wrapper.vm.clearLifecycleDialog();
    await wrapper.vm.deleteTag();
    expect(calls).to.have.lengthOf(1);

    mutation.resolve();
    await flushPromises();
    expect(reloadCalls).to.deep.equal(['reload']);
    expect(wrapper.vm.sending).to.equal(true);

    reload.resolve();
    await operation;
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.lifecycleTarget._id).to.equal('ct-1');
    wrapper.vm.handleLifecycleDialogClosed();
    expect(wrapper.vm.lifecycleTarget).to.equal(null);
    expect(wrapper.vm.lifecycleDialogVisible).to.equal(false);
  });

  it('削除API失敗時は削除対象を維持する', async () => {
    const apiError = new Error('failed');
    tagApi.categoryTag.remove = () => Promise.reject(apiError);
    const View = buildViewWithoutLifecycle(CategoryTagManagement);
    const wrapper = shallowMount(View, createMountOptions());
    const reloadCalls = [];
    const showErrorCalls = [];
    Object.assign(wrapper.vm.$refs.listBase, {
      reload: () => reloadCalls.push('reload'),
      showError: (...args) => showErrorCalls.push(args),
    });
    wrapper.vm.showLifecycleDialog({ _id: 'ct-deleted', name: 'deleted', delete_flg: true });
    await wrapper.vm.$nextTick();

    expect(wrapper.findComponent({ name: 'ManagementLifecycleDialog' }).props('action')).to.equal('delete');
    await wrapper.vm.deleteTag();

    expect(reloadCalls).to.have.lengthOf(0);
    expect(showErrorCalls).to.deep.equal([['削除に失敗しました', apiError]]);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.lifecycleTarget._id).to.equal('ct-deleted');
    expect(wrapper.vm.lifecycleDialogVisible).to.equal(true);
  });

  it('削除失敗時は削除の基本文言と対象を維持する', async () => {
    const apiError = new Error('failed');
    tagApi.categoryTag.remove = () => Promise.reject(apiError);
    const View = buildViewWithoutLifecycle(CategoryTagManagement);
    const wrapper = shallowMount(View, createMountOptions());
    const showErrorCalls = [];
    wrapper.vm.$refs.listBase.showError = (...args) => showErrorCalls.push(args);
    wrapper.vm.showLifecycleDialog({ _id: 'ct-active', name: 'active', delete_flg: false });

    await wrapper.vm.deleteTag();

    expect(showErrorCalls).to.deep.equal([['削除に失敗しました', apiError]]);
    expect(wrapper.vm.lifecycleTarget._id).to.equal('ct-active');
    expect(wrapper.vm.lifecycleDialogVisible).to.equal(true);
  });

  it('CSV選択時はAPIを呼ばず、件数プレビュー確認後に明示的にインポートする', async () => {
    class FakeReader {
      readAsText() {
        setTimeout(() => {
          if (this.onload) this.onload({ target: { result: '2,Tag2\n1,"A,B"\n' } });
        }, 0);
      }
    }
    global.FileReader = FakeReader;

    const importCalls = [];
    tagApi.categoryTag.importCsv = (payload) => {
      importCalls.push(payload);
      return Promise.resolve({
        data: [
          { _id: 't2', order: 2, name: 'Tag2' },
          { _id: 't1', order: 1, name: 'A,B' },
        ],
      });
    };

    const reloadHistory = [];
    const snackbarHistory = [];
    const View = buildViewWithoutLifecycle(CategoryTagManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({ stubs: { ConfirmDialog: ConfirmDialogStub } })
    );
    Object.assign(wrapper.vm.$refs.listBase, {
      reloadFromFirstPage: () => reloadHistory.push('reload'),
      showSnackbar: (message) => snackbarHistory.push(message),
      showError: () => {},
      reload: () => {},
    });

    wrapper.vm.onFileChange({ target: { files: [{ name: 'tags.csv' }] } });
    await flushPromises();
    await flushPromises();

    expect(importCalls).to.have.lengthOf(0);
    expect(wrapper.vm.pendingImportRows).to.deep.equal([
      [2, 'Tag2'],
      [1, 'A,B'],
    ]);
    expect(wrapper.vm.importDialogVisible).to.equal(true);
    expect(wrapper.vm.sending).to.equal(false);

    const importDialog = wrapper
      .findAllComponents(ConfirmDialogStub)
      .find((dialog) => dialog.props('titleId') === 'category-tag-import-dialog-title');
    const importContexts = wrapper
      .findAllComponents({ name: 'DialogTargetContext' })
      .filter((context) => context.props('contextId').startsWith('category-tag-import-'));
    expect(importDialog.props()).to.include({
      dialogVisible: true,
      sending: false,
      title: 'managementUi.importPreviewTitle',
      titleId: 'category-tag-import-dialog-title',
      cancelLabel: 'managementUi.importCancel',
      confirmLabel: 'managementUi.importCsv',
      cancelTestId: 'management-categorytag-import-cancel',
      confirmTestId: 'management-categorytag-import-confirm',
      actionsAdjacent: true,
      closeOnConfirm: false,
      closeOnEscape: true,
      closeOnBackdrop: true,
      initialFocus: "[data-testid='management-categorytag-import-cancel']",
      confirmIcon: 'upload_file',
      confirmTone: 'danger',
      progressMode: 'indeterminate',
    });
    expect(importContexts.map((context) => context.props())).to.deep.include.members([
      {
        contextId: 'category-tag-import-file-context',
        label: 'managementUi.importFileLabel',
        name: 'tags.csv',
      },
      {
        contextId: 'category-tag-import-count-context',
        label: 'managementUi.importCountLabel',
        name: 'managementUi.importPreviewCount',
      },
    ]);
    expect(wrapper.get('#category-tag-import-warning').text()).to.equal(
      'managementUi.importReplaceWarning'
    );

    await wrapper.vm.confirmCsvImport();

    expect(importCalls).to.deep.equal([
      {
        csv: [
          [2, 'Tag2'],
          [1, 'A,B'],
        ],
      },
    ]);
    expect(reloadHistory).to.deep.equal(['reload']);
    expect(snackbarHistory).to.deep.equal(['CSVファイルをインポートしました']);
    expect(wrapper.vm.pendingImportRows).to.deep.equal([
      [2, 'Tag2'],
      [1, 'A,B'],
    ]);
    expect(wrapper.vm.pendingImportFileName).to.equal('tags.csv');
    expect(wrapper.vm.importDialogVisible).to.equal(false);
    expect(wrapper.vm.importCloseCleanupPending).to.equal(true);
    importDialog.vm.$emit('closed');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.pendingImportRows).to.deep.equal([]);
    expect(wrapper.vm.pendingImportFileName).to.equal('');
  });

  it('後から選択したCSVの読込結果だけをプレビューへ反映する', async () => {
    const readers = [];
    class FakeReader {
      constructor() {
        readers.push(this);
      }

      readAsText(file) {
        this.file = file;
      }
    }
    global.FileReader = FakeReader;

    const snackbarHistory = [];
    const View = buildViewWithoutLifecycle(CategoryTagManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({ stubs: { ConfirmDialog: ConfirmDialogStub } })
    );
    wrapper.vm.$refs.listBase.showSnackbar = (message) => snackbarHistory.push(message);
    const firstFile = { name: 'first.csv' };
    const secondFile = { name: 'second.csv' };

    wrapper.vm.onFileChange({ target: { files: [firstFile] } });
    wrapper.vm.onFileChange({ target: { files: [secondFile] } });
    readers[1].onload({ target: { result: '2,Second\n' } });
    readers[0].onload({ target: { result: '1,First\n' } });
    readers[0].onerror();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.pendingImportRows).to.deep.equal([[2, 'Second']]);
    expect(wrapper.vm.pendingImportFileName).to.equal('second.csv');
    expect(wrapper.vm.importDialogVisible).to.equal(true);
    expect(snackbarHistory).to.deep.equal([]);
  });

  it('CSV取込中は対象を維持して重複実行を防ぎ、成功後にダイアログを閉じて状態を消去する', async () => {
    const mutation = createDeferred();
    const calls = [];
    tagApi.categoryTag.importCsv = (payload) => {
      calls.push(payload);
      return mutation.promise;
    };
    const View = buildViewWithoutLifecycle(CategoryTagManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({ stubs: { ConfirmDialog: ConfirmDialogStub } })
    );
    Object.assign(wrapper.vm.$refs.listBase, {
      setItems: () => {},
      showSnackbar: () => {},
      showError: () => {},
    });
    await wrapper.setData({
      pendingImportRows: [[1, 'Tag']],
      pendingImportFileName: 'tags.csv',
      importDialogVisible: true,
    });

    const operation = wrapper.vm.confirmCsvImport();
    await wrapper.vm.$nextTick();
    await wrapper.vm.confirmCsvImport();

    expect(calls).to.deep.equal([{ csv: [[1, 'Tag']] }]);
    expect(wrapper.vm.sending).to.equal(true);
    expect(wrapper.vm.pendingImportRows).to.deep.equal([[1, 'Tag']]);
    expect(wrapper.vm.importDialogVisible).to.equal(true);
    const importDialog = wrapper
      .findAllComponents(ConfirmDialogStub)
      .find((dialog) => dialog.props('titleId') === 'category-tag-import-dialog-title');
    expect(importDialog.props()).to.include({ sending: true, dialogVisible: true });
    wrapper.vm.cancelCsvImport();
    expect(wrapper.vm.pendingImportRows).to.deep.equal([[1, 'Tag']]);

    mutation.resolve({ data: [{ _id: 'tag-1', order: 1, name: 'Tag' }] });
    await operation;

    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.pendingImportRows).to.deep.equal([[1, 'Tag']]);
    expect(wrapper.vm.pendingImportFileName).to.equal('tags.csv');
    expect(wrapper.vm.importDialogVisible).to.equal(false);
    importDialog.vm.$emit('closed');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.pendingImportRows).to.deep.equal([]);
    expect(wrapper.vm.pendingImportFileName).to.equal('');
  });

  it('CSV取込の取消ではダイアログを閉じてから状態を消し、失敗時は再試行できるよう保持する', async () => {
    const apiError = new Error('failed');
    const calls = [];
    tagApi.categoryTag.importCsv = (payload) => {
      calls.push(payload);
      return Promise.reject(apiError);
    };
    const View = buildViewWithoutLifecycle(CategoryTagManagement);
    const wrapper = shallowMount(
      View,
      createMountOptions({ stubs: { ConfirmDialog: ConfirmDialogStub } })
    );
    const showErrorCalls = [];
    Object.assign(wrapper.vm.$refs.listBase, {
      setItems: () => {},
      showSnackbar: () => {},
      showError: (...args) => showErrorCalls.push(args),
    });

    await wrapper.setData({
      pendingImportRows: [[1, 'Cancel']],
      pendingImportFileName: 'cancel.csv',
      importDialogVisible: true,
    });
    const importDialog = wrapper
      .findAllComponents(ConfirmDialogStub)
      .find((dialog) => dialog.props('titleId') === 'category-tag-import-dialog-title');
    wrapper.vm.cancelCsvImport();
    expect(calls).to.have.lengthOf(0);
    expect(wrapper.vm.pendingImportRows).to.deep.equal([[1, 'Cancel']]);
    expect(wrapper.vm.pendingImportFileName).to.equal('cancel.csv');
    expect(wrapper.vm.importDialogVisible).to.equal(false);
    expect(wrapper.vm.importCloseCleanupPending).to.equal(true);
    importDialog.vm.$emit('closed');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.pendingImportRows).to.deep.equal([]);
    expect(wrapper.vm.pendingImportFileName).to.equal('');

    await wrapper.setData({ pendingImportRows: [[2, 'Retry']], importDialogVisible: true });
    await wrapper.vm.confirmCsvImport();

    expect(calls).to.deep.equal([{ csv: [[2, 'Retry']] }]);
    expect(showErrorCalls).to.deep.equal([['CSVファイルのインポートに失敗しました', apiError]]);
    expect(wrapper.vm.pendingImportRows).to.deep.equal([[2, 'Retry']]);
    expect(wrapper.vm.importDialogVisible).to.equal(true);
    expect(wrapper.vm.sending).to.equal(false);
  });

  it('CSVエクスポートでダウンロード処理を行う', async () => {
    tagApi.categoryTag.exportCsv = () =>
      Promise.resolve({
        data: [
          { order: 2, name: 'b' },
          { order: 1, name: 'a' },
        ],
      });

    if (!global.URL) global.URL = {};
    let createdUrl = null;
    let revokedUrl = null;
    global.URL.createObjectURL = () => {
      createdUrl = 'blob:category-test';
      return createdUrl;
    };
    global.URL.revokeObjectURL = (url) => {
      revokedUrl = url;
    };

    let clicked = false;
    document.createElement = (tag) => {
      if (tag !== 'a') return originalCreateElement.call(document, tag);
      return {
        click: () => {
          clicked = true;
        },
        href: '',
        download: '',
      };
    };

    const View = buildViewWithoutLifecycle(CategoryTagManagement);
    const wrapper = shallowMount(View, createMountOptions());
    Object.assign(wrapper.vm.$refs.listBase, {
      showError: () => {},
      showSnackbar: () => {},
      reload: () => {},
      setItems: () => {},
    });

    wrapper.vm.onPressOutputButton();
    await flushPromises();

    expect(clicked).to.equal(true);
    expect(createdUrl).to.equal('blob:category-test');
    expect(revokedUrl).to.equal('blob:category-test');
    expect(wrapper.vm.sending).to.equal(false);
  });
});
