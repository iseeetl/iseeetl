import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import flushPromises from '../../helpers/flushPromises';
import aiAnalysisSettingsApi from '@/api/aiAnalysisSettings';
import AIAnalysisSettingFormFields from '@/components/analysis/AIAnalysisSettingFormFields.vue';
import BaseEditDialog from '@/components/common/BaseEditDialog.vue';
import AIAnalysisSettingManagement from '@/views/management/AIAnalysisSettingManagement.vue';
import { buildViewWithoutLifecycle, createMountOptions } from './helpers';
import { createApplicationI18n } from '@/i18n.js';

const setting = () => ({
  _id: 'setting-1',
  scope: 'category_tag',
  tag: { _id: 'tag-1', name: 'Tag A', translations: [] },
  analysis_kind: 'vision',
  additional_prompt: 'before',
  result_user: { _id: 'user-1', username: 'Alice', image_name: null },
  revision: 4,
});

const createDeferred = () => {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const createListStub = (items) => ({
  name: 'ManagementListBase',
  props: ['title', 'tableLabel', 'payloadBuilder'],
  data: () => ({ items }),
  methods: {
    reload() {},
    reloadFromFirstPage() {},
    showError() {},
    showSnackbar() {},
  },
  template: `
    <section>
      <header data-testid="list-header"><slot name="header" :fetching="false" /></header>
      <div data-testid="list-actions"><slot name="actions" :fetching="false" /></div>
      <div data-testid="list-filters"><slot name="filters" :fetching="false" /></div>
      <slot name="table" :items="items" :table-attrs="{ 'aria-label': tableLabel }" />
      <slot name="dialogs" />
    </section>
  `,
});

const UiButtonStub = {
  name: 'UiButton',
  props: ['tone', 'appearance', 'disabled'],
  emits: ['click'],
  template: '<button :disabled="disabled" :data-tone="tone" @click="$emit(\'click\')"><slot /></button>',
};

const UiDialogStub = {
  name: 'UiDialog',
  props: [
    'open',
    'titleId',
    'descriptionIds',
    'closeOnEscape',
    'closeOnBackdrop',
    'initialFocus',
    'ariaBusy',
  ],
  template: `
    <section v-if="open">
      <slot name="title" />
      <slot />
      <slot name="actions" />
      <slot name="status" />
    </section>
  `,
};

const ConfirmDialogStub = {
  name: 'ConfirmDialog',
  props: ['dialogVisible', 'title', 'message', 'confirmLabel', 'cancelLabel'],
  emits: ['confirm', 'cancel', 'closed'],
  template: '<aside data-testid="confirm-dialog-stub" />',
};

const createWrapper = (overrides = {}) => {
  const View = buildViewWithoutLifecycle(AIAnalysisSettingManagement);
  const wrapper = shallowMount(
    View,
    {
      global: { plugins: [createApplicationI18n({ locale: 'ja' })] },
      ...createMountOptions({
        ...overrides,
        stubs: {
          AIAnalysisSettingFormFields: false,
          'i18n-t': false,
          BaseEditDialog: false,
          ConfirmDialog: ConfirmDialogStub,
          UiButton: UiButtonStub,
          UiDialog: UiDialogStub,
          ...(overrides.stubs || {}),
        },
      }),
    }
  );
  Object.assign(wrapper.vm.$refs.listBase, {
    reload: () => Promise.resolve(),
    reloadFromFirstPage: () => Promise.resolve(),
    showError: () => {},
    showSnackbar: () => {},
  });
  return wrapper;
};

const selectWithSeparatedEvents = async (wrapper, selector, value) => {
  const select = wrapper.get(selector);
  select.element.value = value;
  select.element.dispatchEvent(new Event('input', { bubbles: true }));
  await wrapper.vm.$nextTick();
  expect(select.element.value).to.equal(value);

  select.element.dispatchEvent(new Event('change', { bubbles: true }));
  await wrapper.vm.$nextTick();
  await wrapper.vm.$nextTick();
  return select;
};

const emitFormDialogClosed = async (wrapper) => {
  wrapper.findComponent(BaseEditDialog).vm.$emit('closed');
  await wrapper.vm.$nextTick();
};

describe('共通AI解析設定の管理画面', () => {
  let originalDefaultResultUser;
  let originalCommonPaginate;
  let originalCommonCreate;
  let originalCommonUpdate;
  let originalCommonRemove;
  let originalCategoryTagsList;
  let originalResultUsersSearch;

  beforeEach(() => {
    originalDefaultResultUser = aiAnalysisSettingsApi.common.defaultResultUser;
    aiAnalysisSettingsApi.common.defaultResultUser = () => Promise.resolve({ data: null });
    originalCommonPaginate = aiAnalysisSettingsApi.common.paginate;
    originalCommonCreate = aiAnalysisSettingsApi.common.create;
    originalCommonUpdate = aiAnalysisSettingsApi.common.update;
    originalCommonRemove = aiAnalysisSettingsApi.common.remove;
    originalCategoryTagsList = aiAnalysisSettingsApi.categoryTags.list;
    originalResultUsersSearch = aiAnalysisSettingsApi.resultUsers.search;
    aiAnalysisSettingsApi.resultUsers.search = () => Promise.resolve({ data: [] });
  });

  afterEach(() => {
    aiAnalysisSettingsApi.common.defaultResultUser = originalDefaultResultUser;
    aiAnalysisSettingsApi.common.paginate = originalCommonPaginate;
    aiAnalysisSettingsApi.common.create = originalCommonCreate;
    aiAnalysisSettingsApi.common.update = originalCommonUpdate;
    aiAnalysisSettingsApi.common.remove = originalCommonRemove;
    aiAnalysisSettingsApi.categoryTags.list = originalCategoryTagsList;
    aiAnalysisSettingsApi.resultUsers.search = originalResultUsersSearch;
  });

  it('新規作成は初期ユーザを選択し、そのまま閉じても破棄確認を出さない', async () => {
    const user = { _id: 'support-1', username: 'Support', image_name: 'support.png' };
    aiAnalysisSettingsApi.common.defaultResultUser = () => Promise.resolve({ data: user });
    const wrapper = createWrapper();
    await wrapper.vm.openCreateDialog();
    expect(wrapper.findComponent(AIAnalysisSettingFormFields).props('selectedResultUser')).to.deep.equal(user);
    expect(wrapper.get('.ai-analysis-setting-fields__selected-user img').attributes('src')).to.equal(
      '/profile/support-1/support.png'
    );
    expect(wrapper.vm.resultUserSearchCompleted).to.equal(false);
    expect(wrapper.vm.hasUnsavedChanges).to.equal(false);
    wrapper.vm.requestCloseDialog();
    expect(wrapper.vm.discardConfirmVisible).to.equal(false);
    expect(wrapper.vm.dialogVisible).to.equal(false);
    wrapper.unmount();
  });

  it('初期ユーザの取得中に編集した他の項目は未保存の変更として残す', async () => {
    const deferred = createDeferred();
    aiAnalysisSettingsApi.common.defaultResultUser = () => deferred.promise;
    const wrapper = createWrapper();
    const pending = wrapper.vm.openCreateDialog();
    expect(wrapper.vm.resultUsersLoading).to.equal(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent(BaseEditDialog).props('confirmDisabled')).to.equal(true);
    await wrapper.setData({ form: { ...wrapper.vm.form, additionalPrompt: '入力中の指示' } });
    deferred.resolve({ data: { _id: 'support-1', username: 'Support' } });
    await pending;
    expect(wrapper.vm.form.additionalPrompt).to.equal('入力中の指示');
    expect(wrapper.vm.hasUnsavedChanges).to.equal(true);
    wrapper.vm.requestCloseDialog();
    expect(wrapper.vm.discardConfirmVisible).to.equal(true);
    wrapper.unmount();
  });

  it('遅れて届く初期ユーザで、開き直した編集画面の保存済みユーザを上書きしない', async () => {
    const deferred = createDeferred();
    aiAnalysisSettingsApi.common.defaultResultUser = () => deferred.promise;
    const wrapper = createWrapper();
    const pending = wrapper.vm.openCreateDialog();
    wrapper.vm.closeDialog();
    await emitFormDialogClosed(wrapper);
    wrapper.vm.openEditDialog(setting());
    deferred.resolve({ data: { _id: 'support-1', username: 'Support' } });
    await pending;
    expect(wrapper.vm.form.resultUserId).to.equal('user-1');
    expect(wrapper.vm.selectedResultUser.username).to.equal('Alice');
    expect(wrapper.vm.hasUnsavedChanges).to.equal(false);
    wrapper.unmount();
  });

  it('初期ユーザが未設定なら空欄とし、取得失敗後も手動で検索できる', async () => {
    const wrapper = createWrapper();
    await wrapper.vm.openCreateDialog();
    expect(wrapper.vm.form.resultUserId).to.equal('');
    aiAnalysisSettingsApi.common.defaultResultUser = () => Promise.reject(new Error('lookup failed'));
    await wrapper.vm.openCreateDialog();
    expect(wrapper.vm.form.resultUserId).to.equal('');
    expect(wrapper.vm.resultUsersLoading).to.equal(false);
    expect(wrapper.vm.resultUsersError).to.equal('aiAnalysisSettings.managementResultUserSearchFailed');
    const user = { _id: 'manual-1', username: 'Manual', image_name: null };
    aiAnalysisSettingsApi.resultUsers.search = () => Promise.resolve({ data: [user] });
    await wrapper.vm.searchResultUsers();
    expect(wrapper.vm.resultUsers).to.deep.equal([user]);
    expect(wrapper.vm.resultUsersError).to.equal('');
    wrapper.unmount();
  });

  it('初期ユーザから選び直したユーザを保存する', async () => {
    aiAnalysisSettingsApi.common.defaultResultUser = () => Promise.resolve({
      data: { _id: 'support-1', username: 'Support' },
    });
    const calls = [];
    aiAnalysisSettingsApi.common.create = (body) => { calls.push(body); return Promise.resolve({ data: {} }); };
    const wrapper = createWrapper();
    await wrapper.vm.openCreateDialog();
    await wrapper.setData({ form: { ...wrapper.vm.form, tagId: 'tag-1', analysisKind: 'vision' } });
    wrapper.findComponent(AIAnalysisSettingFormFields).vm.$emit('update:resultUserValue', 'manual-1');
    await wrapper.vm.submitSetting();
    expect(calls[0].result_user).to.equal('manual-1');
    wrapper.unmount();
  });

  it('作成と検索を提供し、削除状態フィルタと更新番号を表示しない', () => {
    const wrapper = createWrapper({
      stubs: {
        ManagementListBase: createListStub([]),
        UiButton: UiButtonStub,
      },
    });

    const header = wrapper.get('[data-testid="list-header"]');
    const filters = wrapper.get('[data-testid="list-filters"]');

    expect(header.get('.view-title').text()).to.equal('aiAnalysisSettings.titleCommonManagement');
    expect(header.get('[data-testid="ai-analysis-setting-create"]').text()).to.equal('作成');
    expect(header.get('[data-testid="ai-analysis-setting-create"]').attributes('aria-label')).to.equal(
      'aiAnalysisSettings.create'
    );
    expect(filters.text()).to.equal('');
    expect(wrapper.text()).not.to.contain('aiAnalysisSettings.revision');
    expect(wrapper.text()).not.to.contain('aiAnalysisSettings.status');
    expect(wrapper.get('[data-testid="list-actions"]').text()).to.equal('');
  });

  it('一覧取得へページと検索語だけを渡す', () => {
    const wrapper = createWrapper();
    expect(wrapper.vm.buildListPayload({ page: 1, search: null })).to.deep.equal({ page: 1, search: '' });
    expect(wrapper.vm.buildListPayload({ page: 2, search: 'x' })).to.deep.equal({ page: 2, search: 'x' });
  });

  it('ページと検索語を専用paginate APIへ渡す', async () => {
    const calls = [];
    aiAnalysisSettingsApi.common.paginate = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: { docs: [], page: 2, pages: 2, total: 0 } });
    };
    const wrapper = createWrapper();

    await wrapper.vm.fetchSettings({ page: 2, search: 'vision' });

    expect(calls).to.deep.equal([{ page: 2, search: 'vision' }]);
  });

  it('設定の5列と編集・削除操作を表示し、更新番号と復元操作を表示しない', async () => {
    const wrapper = createWrapper({
      stubs: {
        ManagementListBase: createListStub([setting()]),
        UiButton: UiButtonStub,
      },
    });
    const row = wrapper.get('tbody tr');
    expect(wrapper.get('table').attributes('aria-label')).to.equal('managementUi.tableLabel');
    expect(wrapper.get('table').classes()).to.include('management-table--wide');
    expect(row.classes()).not.to.include('management-table__interactive-row');
    expect(row.get('td:last-child').classes()).to.include('ai-analysis-settings__action-cell');
    expect(row.get('.ai-analysis-settings__row-actions').findAll('button')).to.have.lengthOf(2);
    expect(wrapper.findAll('thead th')).to.have.lengthOf(5);
    expect(row.findAll('td')).to.have.lengthOf(5);
    expect(row.findAll('button').map((button) => button.text())).to.deep.equal([
      'aiAnalysisSettings.delete', 'aiAnalysisSettings.edit',
    ]);
    expect(wrapper.text()).not.to.contain('aiAnalysisSettings.revision');
    expect(wrapper.text()).not.to.contain('aiAnalysisSettings.restore');
    await row.trigger('click');
    expect(wrapper.vm.dialogVisible).to.equal(false);
    expect(wrapper.vm.lifecycleTarget).to.equal(null);
    await row.get('button').trigger('click');
    expect(wrapper.vm.lifecycleTarget).to.deep.equal(setting());
  });

  it('参照先が欠損した設定は編集を無効にし、物理削除は許可する', async () => {
    const orphan = {
      ...setting(),
      _id: 'orphan-setting',
      tag: { _id: '' },
    };
    const wrapper = createWrapper({
      stubs: {
        ManagementListBase: createListStub([orphan]),
        UiButton: UiButtonStub,
      },
    });
    const row = wrapper.get('tbody tr');

    expect(row.text()).to.contain('managementUi.referenceUnavailable');
    expect(row.findAll('button')).to.have.lengthOf(2);
    expect(row.findAll('button')[0].attributes('disabled')).to.equal(undefined);
    expect(row.findAll('button')[1].attributes('disabled')).not.to.equal(undefined);
    expect(row.get('.management-action-reason').attributes('id')).to.equal(
      'ai-analysis-setting-unavailable-orphan-setting'
    );

    wrapper.vm.openEditDialog(orphan);
    wrapper.vm.showLifecycleDialog(orphan);
    expect(wrapper.vm.dialogVisible).to.equal(false);
    expect(wrapper.vm.lifecycleTarget).to.deep.equal(orphan);
  });

  it('参照タグまたは結果ユーザが削除済みの設定は編集できない状態と判定する', () => {
    const wrapper = createWrapper();
    const deletedTagReference = {
      ...setting(),
      tag: { ...setting().tag, delete_flg: true },
    };
    const deletedUserReference = {
      ...setting(),
      result_user: { ...setting().result_user, delete_flg: true },
    };

    expect(wrapper.vm.settingReferenceUnavailable(deletedTagReference)).to.equal(true);
    expect(wrapper.vm.settingReferenceUnavailable(deletedUserReference)).to.equal(true);
  });

  it('削除状態確認には解析種別とタグ名を組み合わせた対象名を渡す', async () => {
    const wrapper = createWrapper();
    wrapper.vm.showLifecycleDialog(setting());
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.settingResourceName(setting())).to.equal('aiAnalysisSettings.kindVision / Tag A');
    expect(wrapper.findComponent({ name: 'ManagementLifecycleDialog' }).props('resourceName')).to.equal(
      'aiAnalysisSettings.kindVision / Tag A'
    );
  });

  it('共通設定をNFC正規化したプロンプトと選択ユーザで作成する', async () => {
    const calls = [];
    aiAnalysisSettingsApi.common.create = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: setting() });
    };
    const wrapper = createWrapper();
    let reloadCount = 0;
    wrapper.vm.$refs.listBase.reload = () => {
      reloadCount += 1;
      return Promise.resolve();
    };

    await wrapper.vm.openCreateDialog();
    await wrapper.setData({
      form: {
        _id: null,
        tagId: 'tag-1',
        analysisKind: 'conversation',
        additionalPrompt: '  e\u0301  ',
        resultUserId: 'user-1',
        revision: null,
      },
    });
    await wrapper.vm.submitSetting();

    expect(calls).to.deep.equal([
      {
        category_tag: 'tag-1',
        analysis_kind: 'conversation',
        additional_prompt: '\u00e9',
        result_user: 'user-1',
      },
    ]);
    expect(reloadCount).to.equal(1);
    expect(wrapper.vm.dialogVisible).to.equal(false);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.form).to.deep.equal({
      _id: null,
      tagId: 'tag-1',
      analysisKind: 'conversation',
      additionalPrompt: '  e\u0301  ',
      resultUserId: 'user-1',
      revision: null,
    });
    expect(wrapper.vm.initialFormSnapshot).not.to.equal(null);

    await emitFormDialogClosed(wrapper);

    expect(wrapper.vm.form).to.deep.equal({
      _id: null,
      tagId: '',
      analysisKind: '',
      additionalPrompt: '',
      resultUserId: '',
      revision: null,
    });
    expect(wrapper.vm.initialFormSnapshot).to.equal(null);
  });

  it('通常のプロンプトは文字数を案内し、検索入力とボタンを同じ行に置く', async () => {
    const wrapper = createWrapper({
      stubs: {
        ManagementListBase: createListStub([]),
        UiButton: UiButtonStub,
        UiDialog: UiDialogStub,
      },
      mocks: {
        $t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
      },
    });

    await wrapper.setData({ dialogVisible: true });
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.promptDescription).to.equal(
      'aiAnalysisSettings.promptDescription:{"codePoints":2000}'
    );
    const searchControl = wrapper.get('.ai-analysis-setting-fields__search-control');
    expect(searchControl.get('input').attributes('id')).to.equal(
      'ai-analysis-setting-result-user-search'
    );
    const searchButton = searchControl.findComponent({ name: 'UiButton' });
    expect(searchButton.text()).to.equal('aiAnalysisSettings.search');
    expect(searchButton.props('appearance')).to.equal('filled');
    expect(searchButton.props('tone')).to.equal('primary');
    expect(wrapper.get('.ai-analysis-setting-form-dialog').exists()).to.equal(true);
    expect(wrapper.find('.ai-analysis-setting-fields__result-user-list').exists()).to.equal(false);
    expect(wrapper.find('select[size="4"]').exists()).to.equal(false);
  });

  it('共通編集ダイアログと入力項目を接続し、更新・検索イベントを親の状態へ反映する', async () => {
    const searchCalls = [];
    aiAnalysisSettingsApi.resultUsers.search = (payload) => {
      searchCalls.push(payload);
      return Promise.resolve({ data: [] });
    };
    const wrapper = createWrapper();
    await wrapper.vm.openCreateDialog();
    await wrapper.setData({ categoryTags: [{ _id: 'tag-1', name: 'Tag A' }] });
    await wrapper.vm.$nextTick();

    let dialog = wrapper.findComponent(BaseEditDialog);
    let fields = wrapper.findComponent(AIAnalysisSettingFormFields);
    expect(dialog.props()).to.include({
      visible: true,
      sending: false,
      titleId: 'ai-analysis-setting-dialog-title',
      titleText: 'aiAnalysisSettings.createTitle',
      cancelLabel: 'キャンセル',
      confirmLabel: '作成',
      confirmTestId: 'ai-analysis-setting-submit',
      actionsAdjacent: true,
      initialFocus: '#ai-analysis-setting-tag',
      progressMode: 'indeterminate',
    });
    expect(fields.props()).to.include({
      idPrefix: 'ai-analysis-setting',
      formTitleId: 'ai-analysis-setting-dialog-title',
      tagValue: '',
      kindValue: '',
      promptValue: '',
      resultUserValue: '',
      searchValue: '',
      searching: false,
      sending: false,
    });

    fields.vm.$emit('update:tagValue', 'tag-1');
    fields.vm.$emit('update:kindValue', 'speech');
    fields.vm.$emit('update:promptValue', 'next prompt');
    fields.vm.$emit('update:resultUserValue', 'user-2');
    fields.vm.$emit('update:searchValue', 'Alice');
    await wrapper.vm.$nextTick();
    fields.vm.$emit('search');
    await flushPromises();

    expect(wrapper.vm.form).to.deep.equal({
      _id: null,
      tagId: 'tag-1',
      analysisKind: 'speech',
      additionalPrompt: 'next prompt',
      resultUserId: 'user-2',
      revision: null,
    });
    expect(wrapper.vm.resultUserSearch).to.equal('Alice');
    expect(searchCalls).to.deep.equal([{ search: 'Alice' }]);

    const createForm = { ...wrapper.vm.form };
    wrapper.vm.closeDialog();
    expect(wrapper.vm.dialogVisible).to.equal(false);
    expect(wrapper.vm.form).to.deep.equal(createForm);

    dialog.vm.$emit('closed');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.form).to.deep.equal({
      _id: null,
      tagId: '',
      analysisKind: '',
      additionalPrompt: '',
      resultUserId: '',
      revision: null,
    });

    wrapper.vm.openEditDialog(setting());
    await wrapper.vm.$nextTick();

    dialog = wrapper.findComponent(BaseEditDialog);
    fields = wrapper.findComponent(AIAnalysisSettingFormFields);
    expect(dialog.props('titleText')).to.equal('aiAnalysisSettings.editTitle');
    expect(dialog.props('confirmLabel')).to.equal('aiAnalysisSettings.save');
    expect(fields.props()).to.include({
      tagValue: 'tag-1',
      kindValue: 'vision',
      promptValue: 'before',
      resultUserValue: 'user-1',
    });
  });

  it('編集対象を独立表示し、変更済みのキャンセルだけ破棄確認を表示する', async () => {
    const wrapper = createWrapper();
    const target = setting();

    wrapper.vm.openEditDialog(target);
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.dialogTargetName).to.equal('aiAnalysisSettings.kindVision / Tag A');
    expect(wrapper.vm.hasUnsavedChanges).to.equal(false);

    await wrapper.setData({
      form: {
        ...wrapper.vm.form,
        additionalPrompt: 'changed',
      },
    });
    wrapper.vm.requestCloseDialog();

    expect(wrapper.vm.dialogVisible).to.equal(true);
    expect(wrapper.vm.discardConfirmVisible).to.equal(true);

    wrapper.vm.cancelDiscard();
    expect(wrapper.vm.dialogVisible).to.equal(true);
    expect(wrapper.vm.discardConfirmVisible).to.equal(false);

    wrapper.vm.requestCloseDialog();
    wrapper.vm.confirmDiscard();
    expect(wrapper.vm.dialogVisible).to.equal(true);
    expect(wrapper.vm.discardClosePending).to.equal(true);

    wrapper.findComponent(ConfirmDialogStub).vm.$emit('closed');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.dialogVisible).to.equal(false);
    expect(wrapper.vm.dialogTargetName).to.equal('aiAnalysisSettings.kindVision / Tag A');
    expect(wrapper.vm.initialFormSnapshot).not.to.equal(null);
    expect(wrapper.vm.form.additionalPrompt).to.equal('changed');

    await emitFormDialogClosed(wrapper);

    expect(wrapper.vm.dialogTargetName).to.equal('');
    expect(wrapper.vm.initialFormSnapshot).to.equal(null);
    expect(wrapper.vm.form._id).to.equal(null);
  });

  it('作成ダイアログを未変更でキャンセルする場合は破棄確認なしで閉じ、closed後に状態を破棄する', async () => {
    const wrapper = createWrapper();

    await wrapper.vm.openCreateDialog();
    const initialFormSnapshot = wrapper.vm.initialFormSnapshot;
    wrapper.vm.requestCloseDialog();

    expect(wrapper.vm.dialogVisible).to.equal(false);
    expect(wrapper.vm.discardConfirmVisible).to.equal(false);
    expect(wrapper.vm.initialFormSnapshot).to.equal(initialFormSnapshot);

    await emitFormDialogClosed(wrapper);

    expect(wrapper.vm.initialFormSnapshot).to.equal(null);
  });

  it('実UiFieldでタグ・解析種別・解析結果の投稿者の選択を保持して作成する', async () => {
    const calls = [];
    aiAnalysisSettingsApi.common.create = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: setting() });
    };
    const wrapper = createWrapper({
      stubs: {
        ManagementListBase: createListStub([]),
        UiButton: UiButtonStub,
        UiDialog: UiDialogStub,
        UiField: false,
      },
    });
    await wrapper.setData({
      dialogVisible: true,
      categoryTags: [{ _id: 'tag-1', name: 'Tag A' }],
      resultUserSearchCompleted: true,
      resultUsers: [{ _id: 'user-1', username: 'Alice' }],
    });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    const tagSelect = await selectWithSeparatedEvents(
      wrapper,
      '#ai-analysis-setting-tag',
      'tag-1'
    );
    const kindSelect = await selectWithSeparatedEvents(
      wrapper,
      '#ai-analysis-setting-kind',
      'conversation'
    );
    const resultUserRadio = wrapper.get('input[type="radio"][value="user-1"]');
    await resultUserRadio.setValue();

    expect(wrapper.vm.form.tagId).to.equal('tag-1');
    expect(wrapper.vm.form.analysisKind).to.equal('conversation');
    expect(wrapper.vm.form.resultUserId).to.equal('user-1');
    [tagSelect, kindSelect].forEach((select) => {
      expect(
        select.element.closest('.ui-field').classList.contains('ui-field--stacked')
      ).to.equal(true);
    });
    expect(resultUserRadio.element.checked).to.equal(true);
    expect(wrapper.find('select[size="4"]').exists()).to.equal(false);

    await wrapper.vm.submitSetting();

    expect(calls).to.deep.equal([
      {
        category_tag: 'tag-1',
        analysis_kind: 'conversation',
        additional_prompt: '',
        result_user: 'user-1',
      },
    ]);
  });

  it('不正なkind、プロンプト、未選択ユーザではAPIを呼ばない', async () => {
    let createCount = 0;
    aiAnalysisSettingsApi.common.create = () => {
      createCount += 1;
      return Promise.resolve();
    };
    const wrapper = createWrapper({ attachTo: document.body });

    await wrapper.setData({
      dialogVisible: true,
      form: {
        _id: null,
        tagId: 'tag-1',
        analysisKind: 'unknown',
        additionalPrompt: 'x'.repeat(2001),
        resultUserId: '',
        revision: null,
      },
    });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    const focusCalls = [];
    wrapper.vm.$refs.formFields.focusKind = () => focusCalls.push('kind');
    await wrapper.vm.submitSetting();
    await wrapper.vm.$nextTick();

    expect(createCount).to.equal(0);
    expect(wrapper.vm.formSubmitted).to.equal(true);
    expect(wrapper.vm.sending).to.equal(false);
    expect(focusCalls).to.deep.equal(['kind']);
  });

  it('更新は選択中レコードのリビジョンを含む全項目を送る', async () => {
    const calls = [];
    aiAnalysisSettingsApi.common.update = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: setting() });
    };
    const wrapper = createWrapper();
    wrapper.vm.openEditDialog(setting());
    await wrapper.setData({
      form: {
        _id: 'setting-1',
        tagId: 'tag-2',
        analysisKind: 'speech',
        additionalPrompt: 'prompt',
        resultUserId: 'user-2',
        revision: 4,
      },
    });

    await wrapper.vm.submitSetting();

    expect(calls).to.deep.equal([
      {
        _id: 'setting-1',
        category_tag: 'tag-2',
        analysis_kind: 'speech',
        additional_prompt: 'prompt',
        result_user: 'user-2',
        revision: 4,
      },
    ]);
    expect(wrapper.vm.dialogVisible).to.equal(false);
    expect(wrapper.vm.dialogTargetName).to.equal('aiAnalysisSettings.kindVision / Tag A');
    expect(wrapper.vm.form._id).to.equal('setting-1');

    await emitFormDialogClosed(wrapper);

    expect(wrapper.vm.dialogTargetName).to.equal('');
    expect(wrapper.vm.form._id).to.equal(null);
  });

  it('確認後の削除はIDと競合防止用のリビジョンだけを削除APIへ送る', async () => {
    const calls = [];
    aiAnalysisSettingsApi.common.remove = (payload) => {
      calls.push(payload);
      return Promise.resolve({ data: {} });
    };
    const wrapper = createWrapper();
    wrapper.vm.showLifecycleDialog(setting());
    await wrapper.vm.$nextTick();
    const dialog = wrapper.findComponent({ name: 'ManagementLifecycleDialog' });
    expect(dialog.props('action')).to.equal('delete');
    expect(dialog.props('showDeleteRecoveryNote')).to.equal(false);
    expect(dialog.props('warning')).to.equal('この操作は元に戻せません');
    await wrapper.vm.deleteSetting();
    expect(calls).to.deep.equal([{ _id: 'setting-1', revision: 4 }]);
  });

  it('削除中は対象を維持し、成功後に一覧を更新して確認ダイアログを閉じる', async () => {
    let resolveUpdate;
    aiAnalysisSettingsApi.common.remove = () =>
      new Promise((resolve) => {
        resolveUpdate = resolve;
      });
    const wrapper = createWrapper();
    let reloadCount = 0;
    wrapper.vm.$refs.listBase.reload = () => {
      reloadCount += 1;
      return Promise.resolve();
    };
    const target = setting();
    wrapper.vm.showLifecycleDialog(target);

    const request = wrapper.vm.deleteSetting();
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.sending).to.equal(true);
    wrapper.vm.clearLifecycleDialog();
    expect(wrapper.vm.lifecycleTarget).to.deep.equal(target);

    resolveUpdate({ data: {} });
    await request;

    expect(reloadCount).to.equal(1);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.lifecycleDialogVisible).to.equal(false);
    expect(wrapper.vm.lifecycleTarget).to.deep.equal(target);
    wrapper.vm.handleLifecycleDialogClosed();
    expect(wrapper.vm.lifecycleTarget).to.equal(null);
  });

  it('削除失敗時は対象と確認ダイアログを維持する', async () => {
    const error = new Error('failed');
    aiAnalysisSettingsApi.common.remove = () => Promise.reject(error);
    const wrapper = createWrapper();
    const errors = [];
    wrapper.vm.$refs.listBase.showError = (...args) => errors.push(args);
    const target = setting();
    wrapper.vm.showLifecycleDialog(target);

    await wrapper.vm.deleteSetting();

    expect(errors).to.deep.equal([['aiAnalysisSettings.deleteFailed', error]]);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.lifecycleDialogVisible).to.equal(true);
    expect(wrapper.vm.lifecycleTarget).to.deep.equal(target);
  });

  it.each([409, 404])('更新・削除済みの対象は再送せず一覧を再取得する（HTTP %s）', async (status) => {
    let updateCount = 0;
    aiAnalysisSettingsApi.common.remove = () => {
      updateCount += 1;
      return Promise.reject({ response: { status, data: { error: { code: status === 409 ? 'CONFLICT' : 'NOT_FOUND' } } } });
    };
    const wrapper = createWrapper();
    let reloadCount = 0;
    const messages = [];
    wrapper.vm.$refs.listBase.reload = () => {
      reloadCount += 1;
      return Promise.resolve();
    };
    wrapper.vm.$refs.listBase.showSnackbar = (message) => messages.push(message);

    const target = setting();
    wrapper.vm.openEditDialog(target);
    wrapper.vm.showLifecycleDialog(target);
    await wrapper.vm.deleteSetting();

    expect(updateCount).to.equal(1);
    expect(reloadCount).to.equal(1);
    expect(messages).to.deep.equal(['aiAnalysisSettings.conflictReloaded']);
    expect(wrapper.vm.dialogVisible).to.equal(false);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.lifecycleDialogVisible).to.equal(false);
    expect(wrapper.vm.lifecycleTarget).to.deep.equal(target);
    expect(wrapper.vm.dialogTargetName).to.equal('aiAnalysisSettings.kindVision / Tag A');
    expect(wrapper.vm.form._id).to.equal('setting-1');

    await emitFormDialogClosed(wrapper);

    expect(wrapper.vm.dialogTargetName).to.equal('');
    expect(wrapper.vm.form._id).to.equal(null);
    wrapper.vm.handleLifecycleDialogClosed();
    expect(wrapper.vm.lifecycleTarget).to.equal(null);
  });

  it('解析結果の投稿者検索では名前を表示し、メールアドレスを状態に追加しない', async () => {
    aiAnalysisSettingsApi.resultUsers.search = () =>
      Promise.resolve({
        data: [{ _id: 'user-1', username: 'Alice', image_name: null, mail: 'hidden@example.test' }],
      });
    const wrapper = createWrapper();
    await wrapper.setData({ resultUserSearch: ' ali ' });

    expect(wrapper.vm.resultUserSearchCompleted).to.equal(false);
    await wrapper.vm.searchResultUsers();
    await flushPromises();

    expect(wrapper.vm.resultUserSearchCompleted).to.equal(true);
    expect(wrapper.vm.resultUsers).to.deep.equal([
      { _id: 'user-1', username: 'Alice', image_name: null },
    ]);
    expect(Object.prototype.hasOwnProperty.call(wrapper.vm.resultUsers[0], 'mail')).to.equal(false);
  });

  it('ユーザ検索中は検索と保存だけを無効にし、入力と閉じる操作を許可する', async () => {
    const searchRequest = createDeferred();
    let updateCount = 0;
    aiAnalysisSettingsApi.resultUsers.search = () => searchRequest.promise;
    aiAnalysisSettingsApi.common.update = () => {
      updateCount += 1;
      return Promise.resolve({ data: setting() });
    };
    const wrapper = createWrapper();
    wrapper.vm.openEditDialog(setting());
    await wrapper.setData({
      resultUserSearch: 'Bob',
      resultUserSearchCompleted: true,
    });

    const pending = wrapper.vm.searchResultUsers();
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    const baseDialog = wrapper.findComponent(BaseEditDialog);
    const uiDialog = wrapper.findComponent(UiDialogStub);
    const fields = wrapper.findComponent(AIAnalysisSettingFormFields);
    expect(wrapper.vm.resultUsersLoading).to.equal(true);
    expect(baseDialog.props('sending')).to.equal(false);
    expect(baseDialog.props('confirmDisabled')).to.equal(true);
    expect(uiDialog.props()).to.include({
      closeOnEscape: true,
      closeOnBackdrop: true,
      ariaBusy: 'false',
    });
    expect(fields.props('searching')).to.equal(true);
    expect(fields.props('sending')).to.equal(false);
    ['#ai-analysis-setting-tag', '#ai-analysis-setting-kind', '#ai-analysis-setting-prompt'].forEach(
      (selector) => expect(wrapper.get(selector).attributes('disabled')).to.equal(undefined)
    );
    expect(wrapper.get('#ai-analysis-setting-result-user-search').attributes('disabled')).not.to.equal(
      undefined
    );
    expect(wrapper.get('.ai-analysis-setting-fields__search-control button').attributes('disabled')).not.to.equal(
      undefined
    );
    const submitButtons = wrapper.findAll('[data-testid="ai-analysis-setting-submit"]');
    const cancelButtons = wrapper.findAll('[data-testid="base-edit-dialog-cancel"]');
    expect(submitButtons).to.have.lengthOf(2);
    expect(cancelButtons).to.have.lengthOf(2);
    expect(
      submitButtons.every((button) => button.attributes('disabled') !== undefined)
    ).to.equal(true);
    expect(cancelButtons.every((button) => button.attributes('disabled') === undefined)).to.equal(true);
    expect(wrapper.get('ui-progress-stub').attributes('style')).to.contain('display: none');

    wrapper.vm.requestCloseDialog();
    await wrapper.vm.submitSetting();
    expect(wrapper.vm.dialogVisible).to.equal(false);
    expect(updateCount).to.equal(0);

    baseDialog.vm.$emit('closed');
    await wrapper.vm.$nextTick();

    searchRequest.resolve({ data: [{ _id: 'user-2', username: 'Bob' }] });
    await pending;
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.resultUsersLoading).to.equal(false);
    expect(baseDialog.props('sending')).to.equal(false);
    expect(wrapper.findComponent(AIAnalysisSettingFormFields).exists()).to.equal(false);
  });

  it('ダイアログを開いただけではユーザを検索せず、検索成功後だけ検索結果を表示する', async () => {
    let searchCount = 0;
    aiAnalysisSettingsApi.resultUsers.search = () => {
      searchCount += 1;
      return Promise.resolve({ data: [] });
    };
    const wrapper = createWrapper({
      stubs: {
        ManagementListBase: createListStub([]),
        UiButton: UiButtonStub,
        UiDialog: UiDialogStub,
      },
    });

    await wrapper.vm.openCreateDialog();
    await wrapper.vm.$nextTick();

    expect(searchCount).to.equal(0);
    expect(wrapper.vm.resultUserSearchCompleted).to.equal(false);
    expect(wrapper.find('.ai-analysis-setting-fields__result-user-list').exists()).to.equal(false);

    await wrapper.vm.searchResultUsers();
    await wrapper.vm.$nextTick();

    expect(searchCount).to.equal(1);
    expect(wrapper.vm.resultUserSearchCompleted).to.equal(true);
    expect(wrapper.get('.ai-analysis-setting-fields__result-user-list legend').text()).to.equal(
      'aiAnalysisSettings.resultUserSearchResults'
    );
    expect(wrapper.get('.ai-analysis-setting-fields__result-user-list [role="status"]').text()).to.equal(
      'aiAnalysisSettings.resultUserSearchEmpty'
    );
  });

  it('編集時の選択中ユーザは検索前にも保持し、候補欄は検索後だけ表示する', async () => {
    const wrapper = createWrapper({
      stubs: {
        ManagementListBase: createListStub([]),
        UiButton: UiButtonStub,
        UiDialog: UiDialogStub,
      },
    });

    const saved = setting();
    saved.result_user.image_name = 'alice.png';
    wrapper.vm.openEditDialog(saved);
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.form.resultUserId).to.equal('user-1');
    expect(wrapper.vm.resultUserSearch).to.equal('');
    expect(wrapper.vm.resultUserSearchCompleted).to.equal(false);
    expect(wrapper.get('.ai-analysis-setting-fields__selected-user').text()).to.equal(
      '選択中: Alice'
    );
    expect(wrapper.get('.ai-analysis-setting-fields__selected-user img').attributes('src')).to.equal(
      '/profile/user-1/alice.png'
    );
    expect(wrapper.find('.ai-analysis-setting-fields__result-user-list').exists()).to.equal(false);
  });

  it('解析結果の投稿者と検索失敗に管理画面用のメッセージを使う', async () => {
    aiAnalysisSettingsApi.resultUsers.search = () => Promise.reject(new Error('failed'));
    const wrapper = createWrapper({
      stubs: {
        ManagementListBase: createListStub([setting()]),
        UiButton: UiButtonStub,
        UiDialog: UiDialogStub,
      },
    });

    expect(wrapper.findAll('th').map((header) => header.text())).to.include(
      'aiAnalysisSettings.managementResultUser'
    );

    await wrapper.vm.openCreateDialog();
    await wrapper.setData({ resultUserSearch: 'alice' });
    await wrapper.vm.searchResultUsers();

    expect(wrapper.vm.resultUsersError).to.equal(
      'aiAnalysisSettings.managementResultUserSearchFailed'
    );
  });

  it('共通タグの取得失敗を画面内のエラーメッセージに変換する', async () => {
    aiAnalysisSettingsApi.categoryTags.list = () => Promise.reject(new Error('failed'));
    const wrapper = createWrapper();

    await wrapper.vm.loadCategoryTags();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.categoryTags).to.deep.equal([]);
    expect(wrapper.vm.categoryTagsError).to.equal('aiAnalysisSettings.loadTagsFailed');
    expect(wrapper.vm.categoryTagsLoading).to.equal(false);
    expect(wrapper.get('[role="alert"]').attributes('id')).to.equal(
      'ai-analysis-settings-category-tags-error'
    );
    expect(
      wrapper.get('[data-testid="ai-analysis-setting-create"]').attributes('aria-describedby')
    ).to.equal('ai-analysis-settings-category-tags-error');
  });
});
