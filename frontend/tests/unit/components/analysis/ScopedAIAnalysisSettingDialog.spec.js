import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import aiAnalysisSettingsApi from '@/api/aiAnalysisSettings';
import tagApi from '@/api/tag';
import AIAnalysisSettingFormFields from '@/components/analysis/AIAnalysisSettingFormFields.vue';
import ScopedAIAnalysisSettingDialog from '@/components/analysis/ScopedAIAnalysisSettingDialog.vue';
import flushPromises from '../../helpers/flushPromises';
import { createApplicationI18n } from '@/i18n.js';

const UiDialogStub = {
  name: 'UiDialog',
  props: [
    'open',
    'titleId',
    'descriptionIds',
    'initialFocus',
    'closeOnEscape',
    'closeOnBackdrop',
  ],
  template:
    '<section><header><slot name="title" /></header><main><slot /></main><footer><slot name="actions" /></footer><slot name="status" /></section>',
};

const UiButtonStub = {
  name: 'UiButton',
  inheritAttrs: false,
  emits: ['click'],
  props: {
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  template: '<button v-bind="$attrs" type="button" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
};

const UiIconStub = {
  name: 'UiIcon',
  props: ['name'],
  template: '<span class="ui-icon-stub">{{ name }}</span>',
};

const UiFieldStub = {
  name: 'UiField',
  props: {
    controlId: {
      type: String,
      required: true,
    },
    label: {
      type: String,
      required: true,
    },
    invalid: {
      type: Boolean,
      default: false,
    },
    error: {
      type: String,
      default: '',
    },
    description: {
      type: String,
      default: '',
    },
    stacked: {
      type: Boolean,
      default: false,
    },
  },
  computed: {
    controlAttrs() {
      const attrs = { id: this.controlId };
      const describedBy = [];
      if (this.invalid) attrs['aria-invalid'] = 'true';
      if (this.description) describedBy.push(`${this.controlId}-description`);
      if (this.error) describedBy.push(`${this.controlId}-error`);
      if (describedBy.length) attrs['aria-describedby'] = describedBy.join(' ');
      return attrs;
    },
  },
  template: `
    <div>
      <label :for="controlId">{{ label }}</label>
      <slot :control-attrs="controlAttrs" />
      <p v-if="description" :id="controlId + '-description'">{{ description }}</p>
      <p v-if="error" :id="controlId + '-error'" role="alert">{{ error }}</p>
    </div>
  `,
};

const ManagementLifecycleDialogStub = {
  name: 'ManagementLifecycleDialog',
  props: [
    'open',
    'sending',
    'action',
    'resourceLabel',
    'resourceName',
    'showDeleteRecoveryNote',
    'warning',
    'actionsAdjacent',
  ],
  emits: ['confirm', 'cancel', 'request-close', 'closed'],
  template: '<aside data-testid="management-lifecycle-dialog-stub"><slot /></aside>',
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
  ],
  emits: ['confirm', 'cancel', 'close', 'closed'],
  template: '<aside data-testid="confirm-dialog-stub" />',
};

const settingFixture = (overrides = {}) => ({
  _id: 'setting-1',
  scope: 'floor',
  tag: { _id: 'tag-1', name: 'Tag', lang: 'ja', translations: [] },
  analysis_kind: 'vision',
  additional_prompt: 'prompt',
  result_user: { _id: 'user-1', username: 'Result User', image_name: null },
  revision: 2,
  ...overrides,
});

const createDeferred = () => {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const createWrapper = (overrides = {}) => {
  const dispatchCalls = [];
  const wrapper = shallowMount(ScopedAIAnalysisSettingDialog, {
    attachTo: document.body,
    global: { plugins: [createApplicationI18n({ locale: 'ja' })] },
    props: {
      dialogVisible: true,
      scope: 'floor',
      floorId: 'floor-1',
      ...(overrides.props || {}),
    },
    stubs: {
      AIAnalysisSettingFormFields: false,
      'i18n-t': false,
      ManagementLifecycleDialog: ManagementLifecycleDialogStub,
      ConfirmDialog: ConfirmDialogStub,
      DialogTargetContext: false,
      UiDialog: UiDialogStub,
      UiButton: UiButtonStub,
      UiField: UiFieldStub,
      UiIcon: UiIconStub,
      ...(overrides.stubs || {}),
    },
    mocks: {
      $store: {
        dispatch: (type, payload) => dispatchCalls.push({ type, payload }),
      },
      $router: { push: () => {} },
      $i18n: { locale: 'ja' },
      $t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
      $n: (value) => String(value),
      ...(overrides.mocks || {}),
    },
  });
  return { wrapper, dispatchCalls };
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

describe('フロア・ルームのAI解析設定ダイアログ', () => {
  const original = {};

  beforeEach(() => {
    original.floorDefaultResultUser = aiAnalysisSettingsApi.floor.defaultResultUser;
    original.roomDefaultResultUser = aiAnalysisSettingsApi.room.defaultResultUser;
    aiAnalysisSettingsApi.floor.defaultResultUser = () => Promise.resolve({ data: null });
    aiAnalysisSettingsApi.room.defaultResultUser = () => Promise.resolve({ data: null });
    original.floorList = aiAnalysisSettingsApi.floor.list;
    original.floorCreate = aiAnalysisSettingsApi.floor.create;
    original.floorUpdate = aiAnalysisSettingsApi.floor.update;
    original.floorRemove = aiAnalysisSettingsApi.floor.remove;
    original.floorSearchResultUsers = aiAnalysisSettingsApi.floor.searchResultUsers;
    original.roomList = aiAnalysisSettingsApi.room.list;
    original.roomCreate = aiAnalysisSettingsApi.room.create;
    original.roomUpdate = aiAnalysisSettingsApi.room.update;
    original.roomRemove = aiAnalysisSettingsApi.room.remove;
    original.roomSearchResultUsers = aiAnalysisSettingsApi.room.searchResultUsers;
    original.floorTagList = tagApi.floorTag.list;
    original.roomTagList = tagApi.roomTag.list;
  });

  afterEach(() => {
    aiAnalysisSettingsApi.floor.defaultResultUser = original.floorDefaultResultUser;
    aiAnalysisSettingsApi.room.defaultResultUser = original.roomDefaultResultUser;
    aiAnalysisSettingsApi.floor.list = original.floorList;
    aiAnalysisSettingsApi.floor.create = original.floorCreate;
    aiAnalysisSettingsApi.floor.update = original.floorUpdate;
    aiAnalysisSettingsApi.floor.remove = original.floorRemove;
    aiAnalysisSettingsApi.floor.searchResultUsers = original.floorSearchResultUsers;
    aiAnalysisSettingsApi.room.list = original.roomList;
    aiAnalysisSettingsApi.room.create = original.roomCreate;
    aiAnalysisSettingsApi.room.update = original.roomUpdate;
    aiAnalysisSettingsApi.room.remove = original.roomRemove;
    aiAnalysisSettingsApi.room.searchResultUsers = original.roomSearchResultUsers;
    tagApi.floorTag.list = original.floorTagList;
    tagApi.roomTag.list = original.roomTagList;
  });

  ['floor', 'room'].forEach((scope) => {
    it(`${scope}の新規作成では初期ユーザを選び、未変更のまま戻れる`, async () => {
      const user = { _id: 'support-1', username: 'Support', image_name: 'support.png' };
      const calls = [];
      aiAnalysisSettingsApi[scope].defaultResultUser = (body) => {
        calls.push(body);
        return Promise.resolve({ data: user });
      };
      const { wrapper } = createWrapper({ props: { scope, roomId: 'room-1' } });
      await wrapper.vm.openCreateForm();
      expect(calls).to.deep.equal([{
        floor_id: 'floor-1', ...(scope === 'room' ? { room_id: 'room-1' } : {}),
      }]);
      expect(wrapper.findComponent(AIAnalysisSettingFormFields).props('selectedResultUser')).to.deep.equal(user);
      expect(wrapper.get('.ai-analysis-setting-fields__selected-user img').attributes('src')).to.equal(
        '/profile/support-1/support.png'
      );
      expect(wrapper.vm.formDirty).to.equal(false);
      wrapper.vm.requestCloseForm();
      expect(wrapper.vm.formVisible).to.equal(false);
      expect(wrapper.vm.discardConfirmVisible).to.equal(false);
      wrapper.vm.openEditForm(settingFixture());
      expect(wrapper.vm.form.resultUserId).to.equal('user-1');
      expect(calls.length).to.equal(1);
      wrapper.unmount();
    });
  });

  it('初期ユーザの取得中に入力した指示は未保存の変更として残す', async () => {
    const deferred = createDeferred();
    aiAnalysisSettingsApi.floor.defaultResultUser = () => deferred.promise;
    const { wrapper } = createWrapper();
    const pending = wrapper.vm.openCreateForm();
    expect(wrapper.vm.searching).to.equal(true);
    await wrapper.setData({ form: { ...wrapper.vm.form, additionalPrompt: '入力中の指示' } });
    deferred.resolve({ data: { _id: 'support-1', username: 'Support' } });
    await pending;
    expect(wrapper.vm.form.additionalPrompt).to.equal('入力中の指示');
    expect(wrapper.vm.formDirty).to.equal(true);
    wrapper.vm.requestCloseForm();
    expect(wrapper.vm.discardConfirmVisible).to.equal(true);
    wrapper.unmount();
  });

  it('戻ってから開いた編集画面へ遅れた初期ユーザを反映しない', async () => {
    const deferred = createDeferred();
    aiAnalysisSettingsApi.floor.defaultResultUser = () => deferred.promise;
    const { wrapper } = createWrapper();
    const pending = wrapper.vm.openCreateForm();
    wrapper.vm.requestCloseForm();
    wrapper.vm.openEditForm(settingFixture());
    deferred.resolve({ data: { _id: 'support-1', username: 'Support' } });
    await pending;
    expect(wrapper.vm.form.resultUserId).to.equal('user-1');
    expect(wrapper.vm.formDirty).to.equal(false);
    expect(wrapper.vm.searching).to.equal(false);
    wrapper.unmount();
  });

  it('対象フロアを変更した後に届く初期ユーザは反映しない', async () => {
    const deferred = createDeferred();
    aiAnalysisSettingsApi.floor.defaultResultUser = () => deferred.promise;
    aiAnalysisSettingsApi.floor.list = () => Promise.resolve({ data: [] });
    tagApi.floorTag.list = () => Promise.resolve({ data: [] });
    const { wrapper } = createWrapper();
    const pending = wrapper.vm.openCreateForm();
    await wrapper.setProps({ floorId: 'floor-2' });
    deferred.resolve({ data: { _id: 'support-1', username: 'Support' } });
    await pending;
    await flushPromises();
    expect(wrapper.vm.form.resultUserId).to.equal('');
    expect(wrapper.vm.resultUsers).to.deep.equal([]);
    wrapper.unmount();
  });

  it('初期ユーザが未設定なら空欄とし、取得失敗後も検索・選択できる', async () => {
    const { wrapper, dispatchCalls } = createWrapper();
    await wrapper.vm.openCreateForm();
    expect(wrapper.vm.form.resultUserId).to.equal('');
    aiAnalysisSettingsApi.floor.defaultResultUser = () => Promise.reject(new Error('lookup failed'));
    await wrapper.vm.openCreateForm();
    expect(wrapper.vm.searching).to.equal(false);
    expect(wrapper.vm.form.resultUserId).to.equal('');
    expect(dispatchCalls.some(({ payload }) => payload?.role === 'alert' && payload.message.includes('aiAnalysisSettings.managementResultUserSearchFailed'))).to.equal(true);
    const user = { _id: 'manual-1', username: 'Manual' };
    aiAnalysisSettingsApi.floor.searchResultUsers = () => Promise.resolve({ data: [user] });
    await wrapper.vm.searchResultUsers();
    expect(wrapper.vm.resultUsers).to.deep.equal([user]);
    wrapper.findComponent(AIAnalysisSettingFormFields).vm.$emit('update:resultUserValue', user._id);
    expect(wrapper.vm.form.resultUserId).to.equal(user._id);
    wrapper.unmount();
  });

  it('フォーカス・Escapeキー・背景操作をUiDialogへ委ね、処理中は閉じない', async () => {
    const { wrapper } = createWrapper();
    const dialog = wrapper.findComponent(UiDialogStub);

    expect(dialog.props('initialFocus')).to.equal('#scoped-ai-analysis-settings-floor-title');
    expect(wrapper.find('#scoped-ai-analysis-settings-floor-title').attributes('tabindex')).to.equal('-1');
    expect(dialog.props('closeOnEscape')).to.equal(true);
    expect(dialog.props('closeOnBackdrop')).to.equal(true);

    await wrapper.setData({ sending: true });
    wrapper.vm.requestClose();
    expect(wrapper.vm.visible).to.equal(true);
    expect(dialog.props('closeOnEscape')).to.equal(false);
    expect(dialog.props('closeOnBackdrop')).to.equal(false);

    await wrapper.setData({ sending: false });
    wrapper.vm.requestClose();
    expect(wrapper.vm.visible).to.equal(false);
  });

  it('対象ルームをダイアログ説明へ関連付け、GET中も閉じられる', async () => {
    const { wrapper } = createWrapper({
      props: {
        scope: 'room',
        roomId: 'room-1',
        targetName: '対象のルーム',
      },
    });
    const dialog = wrapper.findComponent(UiDialogStub);

    expect(dialog.props('descriptionIds')).to.equal(
      'scoped-ai-analysis-settings-room-description scoped-ai-analysis-settings-room-target-context'
    );
    expect(wrapper.get('.dialog-target-context').text()).to.contain('対象ルーム');
    expect(wrapper.get('.dialog-target-context').text()).to.contain('対象のルーム');

    await wrapper.setData({ loading: true });
    expect(wrapper.find('.settings-summary').exists()).to.equal(false);
    expect(dialog.props('closeOnEscape')).to.equal(true);
    expect(dialog.props('closeOnBackdrop')).to.equal(true);
    wrapper.vm.requestClose();
    expect(wrapper.vm.visible).to.equal(false);
  });

  it('一覧GET失敗をエラー状態にし、再試行できる', async () => {
    tagApi.floorTag.list = () => Promise.resolve({ data: [] });
    aiAnalysisSettingsApi.floor.list = () => Promise.reject(new Error('load failed'));
    const { wrapper } = createWrapper();

    await wrapper.vm.loadDialogData();

    expect(wrapper.vm.loadFailed).to.equal(true);
    expect(wrapper.get('.settings-load-error').attributes('role')).to.equal('alert');
    expect(wrapper.get('.settings-load-error').text()).to.contain('再試行');
    expect(wrapper.find('.settings-summary').exists()).to.equal(false);
  });

  it('GET中に閉じた後の遅延応答を一覧へ反映しない', async () => {
    const deferred = {};
    deferred.promise = new Promise((resolve) => {
      deferred.resolve = resolve;
    });
    tagApi.floorTag.list = () => deferred.promise;
    aiAnalysisSettingsApi.floor.list = () => deferred.promise;
    const { wrapper } = createWrapper();

    const request = wrapper.vm.loadDialogData();
    wrapper.vm.requestClose();
    deferred.resolve({ data: [settingFixture({ _id: 'stale' })] });
    await request;

    expect(wrapper.vm.settings).to.deep.equal([]);
    expect(wrapper.vm.tags).to.deep.equal([]);
  });

  it('表示中に対象IDが変わった場合は旧GETを破棄して新しい対象だけを反映する', async () => {
    const firstTags = createDeferred();
    const firstSettings = createDeferred();
    const secondTags = createDeferred();
    const secondSettings = createDeferred();
    tagApi.floorTag.list = ({ floor_id: floorId }) =>
      floorId === 'floor-1' ? firstTags.promise : secondTags.promise;
    aiAnalysisSettingsApi.floor.list = ({ floor_id: floorId }) =>
      floorId === 'floor-1' ? firstSettings.promise : secondSettings.promise;
    const { wrapper } = createWrapper();

    const firstLoad = wrapper.vm.loadDialogData();
    await wrapper.setProps({ floorId: 'floor-2', targetName: '次のフロア' });
    await wrapper.vm.$nextTick();

    secondTags.resolve({ data: [{ _id: 'tag-2', name: 'New Tag' }] });
    secondSettings.resolve({ data: [settingFixture({ _id: 'setting-2' })] });
    await flushPromises();

    firstTags.resolve({ data: [{ _id: 'tag-1', name: 'Old Tag' }] });
    firstSettings.resolve({ data: [settingFixture({ _id: 'setting-1' })] });
    await firstLoad;
    await flushPromises();

    expect(wrapper.vm.tags.map((tag) => tag._id)).to.deep.equal(['tag-2']);
    expect(wrapper.vm.settings.map((setting) => setting._id)).to.deep.equal(['setting-2']);
  });

  it('有効な設定をPCでは5列の表、スマートフォンではカードに表示し、状態と内部リビジョンは隠す', async () => {
    const revisionMarker = 'REVISION_MUST_NOT_BE_RENDERED';
    const active = settingFixture({ revision: revisionMarker });
    const { wrapper } = createWrapper();

    await wrapper.setData({ settings: [active] });

    expect(wrapper.findComponent(UiDialogStub).classes()).to.include(
      'scoped-ai-analysis-settings-dialog'
    );

    const desktop = wrapper.get(
      '[data-testid="scoped-ai-analysis-settings-desktop-list"]'
    );
    expect(desktop.get('table').attributes('aria-label')).to.equal(
      'aiAnalysisSettings.titleFloor'
    );
    expect(desktop.findAll('thead th').map((heading) => heading.text().trim())).to.deep.equal([
      'aiAnalysisSettings.tag',
      'aiAnalysisSettings.kind',
      'aiAnalysisSettings.prompt',
      'aiAnalysisSettings.managementResultUser',
      'aiAnalysisSettings.actions',
    ]);
    desktop.findAll('tbody tr').forEach((row) => {
      expect(row.findAll('td')).to.have.lengthOf(5);
    });
    expect(desktop.text()).not.to.contain('aiAnalysisSettings.status');
    expect(desktop.text()).not.to.contain('aiAnalysisSettings.revision');
    expect(desktop.text()).not.to.contain(revisionMarker);

    const mobile = wrapper.get(
      '[data-testid="scoped-ai-analysis-settings-mobile-list"]'
    );
    expect(mobile.element.tagName).to.equal('UL');
    expect(mobile.attributes('aria-label')).to.equal('aiAnalysisSettings.titleFloor');

    const cards = mobile.findAll('.settings-card');
    expect(cards).to.have.lengthOf(1);
    expect(cards.every((card) => card.element.tagName === 'LI')).to.equal(true);
    expect(cards.every((card) => card.find('article').exists())).to.equal(true);
    expect(cards[0].get('h3').text()).to.equal('Tag');
    expect(cards[0].findAll('dt').map((term) => term.text().trim())).to.deep.equal([
      'aiAnalysisSettings.kind',
      'aiAnalysisSettings.managementResultUser',
      'aiAnalysisSettings.prompt',
    ]);
    expect(cards[0].findAll('dd').map((description) => description.text().trim())).to.deep.equal([
      'aiAnalysisSettings.kindVision',
      'Result User',
      'prompt',
    ]);
    expect(cards[0].find('.status-badge').exists()).to.equal(false);
    expect(cards[0].findAll('button').map((button) => button.text().trim())).to.deep.equal([
      'aiAnalysisSettings.edit',
      'aiAnalysisSettings.delete',
    ]);
    expect(mobile.text()).not.to.contain('aiAnalysisSettings.revision');
    expect(mobile.text()).not.to.contain(revisionMarker);
  });

  it('一覧から作成画面へ切り替えてタグ選択へフォーカスし、戻ると一覧と作成ボタンへ戻す', async () => {
    const { wrapper } = createWrapper();
    const trigger = wrapper.find('button[aria-label="aiAnalysisSettings.create"]');
    const desktopCreateButton = wrapper.get('#scoped-ai-analysis-settings-floor-create-desktop');
    const headerStart = wrapper.get('header > .ui-dialog__header-start');
    const headerEnd = wrapper.get('header > .ui-dialog__header-end');

    expect(wrapper.get('.settings-view').isVisible()).to.equal(true);
    expect(wrapper.find('.ai-analysis-setting-fields').exists()).to.equal(false);
    expect(wrapper.get('#scoped-ai-analysis-settings-floor-title').text()).to.equal(
      'aiAnalysisSettings.titleFloor'
    );
    expect(headerStart.attributes('aria-label')).to.equal('aiAnalysisSettings.close');
    expect(headerStart.get('.ui-icon-stub').text()).to.equal('close');
    expect(headerEnd.attributes('aria-label')).to.equal('aiAnalysisSettings.create');
    expect(headerEnd.get('.ui-icon-stub').text()).to.equal('add');
    expect(desktopCreateButton.text()).to.equal('作成');

    await trigger.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.get('.settings-view').isVisible()).to.equal(false);
    expect(wrapper.get('.ai-analysis-setting-fields').isVisible()).to.equal(true);
    expect(wrapper.get('#scoped-ai-analysis-settings-floor-title').text()).to.equal(
      'aiAnalysisSettings.createTitle'
    );
    const tagSelect = wrapper.get('#scoped-ai-analysis-settings-floor-tag');
    expect(document.activeElement).to.equal(tagSelect.element);
    expect(headerStart.attributes('aria-label')).to.equal('戻る');
    expect(headerStart.get('.ui-icon-stub').text()).to.equal('chevron_left');
    expect(headerEnd.attributes('aria-label')).to.equal('作成');
    expect(headerEnd.get('.ui-icon-stub').text()).to.equal('done');

    await wrapper.get('button[aria-label="戻る"]').trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.formVisible).to.equal(false);
    expect(wrapper.get('.settings-view').isVisible()).to.equal(true);
    expect(wrapper.find('.ai-analysis-setting-fields').exists()).to.equal(false);
    expect(wrapper.get('#scoped-ai-analysis-settings-floor-title').text()).to.equal(
      'aiAnalysisSettings.titleFloor'
    );
    expect(document.activeElement).to.equal(trigger.element);
  });

  it('通常のプロンプトは文字数を案内し、解析結果の投稿者欄と検索ボタンを同じ行に置く', async () => {
    const { wrapper } = createWrapper();
    await wrapper.vm.openCreateForm();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.promptDescription).to.equal(
      'aiAnalysisSettings.promptDescription:{"codePoints":2000}'
    );
    expect(wrapper.vm.promptDescription).not.to.contain('bytes');
    expect(wrapper.vm.promptDescription).not.to.contain('8000');

    const searchControl = wrapper.get('.ai-analysis-setting-fields__search-control');
    expect(searchControl.get('input').attributes('id')).to.equal(
      'scoped-ai-analysis-settings-floor-result-user-search'
    );
    expect(searchControl.get('button').text()).to.equal('aiAnalysisSettings.search');
    expect(searchControl.get('button').attributes('appearance')).to.equal('filled');
    expect(searchControl.get('button').attributes('tone')).to.equal('primary');
    expect(wrapper.find('.ai-analysis-setting-fields__result-user-list').exists()).to.equal(false);
  });

  it('共通入力項目の値と更新イベントを連携し、作成・編集の操作名を切り替える', async () => {
    const searchCalls = [];
    aiAnalysisSettingsApi.floor.searchResultUsers = (payload) => {
      searchCalls.push(payload);
      return Promise.resolve({ data: [] });
    };
    const { wrapper } = createWrapper();
    await wrapper.vm.openCreateForm();
    await wrapper.setData({
      tags: [
        { _id: 'tag-1', name: 'Tag A', translations: [] },
        { _id: 'tag-2', name: 'Tag B', translations: [] },
      ],
    });

    let fields = wrapper.findComponent(AIAnalysisSettingFormFields);
    expect(fields.props()).to.include({
      idPrefix: 'scoped-ai-analysis-settings-floor',
      formTitleId: 'scoped-ai-analysis-settings-floor-title',
      tagValue: '',
      kindValue: '',
      promptValue: '',
      resultUserValue: '',
      searchValue: '',
      searching: false,
      sending: false,
    });
    expect(wrapper.vm.formActionLabel).to.equal('作成');
    expect(wrapper.get('.setting-form-actions').findAll('button')[1].text()).to.equal('作成');

    fields.vm.$emit('update:tagValue', 'tag-2');
    fields.vm.$emit('update:kindValue', 'speech');
    fields.vm.$emit('update:promptValue', 'next prompt');
    fields.vm.$emit('update:resultUserValue', 'user-2');
    fields.vm.$emit('update:searchValue', 'Alice');
    await wrapper.vm.$nextTick();
    fields.vm.$emit('search');
    await flushPromises();

    expect(wrapper.vm.form).to.deep.equal({
      tagId: 'tag-2',
      analysisKind: 'speech',
      additionalPrompt: 'next prompt',
      resultUserId: 'user-2',
    });
    expect(wrapper.vm.resultUserSearch).to.equal('Alice');
    expect(searchCalls).to.deep.equal([{ floor_id: 'floor-1', search: 'Alice' }]);

    wrapper.vm.closeForm({ restoreFocus: false });
    wrapper.vm.openEditForm(settingFixture());
    await wrapper.vm.$nextTick();

    fields = wrapper.findComponent(AIAnalysisSettingFormFields);
    expect(fields.props()).to.include({
      tagValue: 'tag-1',
      kindValue: 'vision',
      promptValue: 'prompt',
      resultUserValue: 'user-1',
    });
    expect(wrapper.vm.formActionLabel).to.equal('aiAnalysisSettings.save');
    expect(wrapper.get('.setting-form-actions').findAll('button')[1].text()).to.equal(
      'aiAnalysisSettings.save'
    );
  });

  it('入力画面のEscape・背景クリック要求は外側ダイアログを閉じず一覧へ戻す', async () => {
    const { wrapper } = createWrapper();
    const trigger = wrapper.find('button[aria-label="aiAnalysisSettings.create"]');

    await trigger.trigger('click');
    wrapper.vm.requestClose({ reason: 'escape' });
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.visible).to.equal(true);
    expect(wrapper.vm.formVisible).to.equal(false);
    expect(wrapper.get('.settings-view').isVisible()).to.equal(true);
    expect(document.activeElement).to.equal(trigger.element);
  });

  it('入力変更後の戻るは破棄確認を表示し、取消なら入力を保持する', async () => {
    const { wrapper } = createWrapper();
    await wrapper.vm.openCreateForm();
    await wrapper.setData({
      form: {
        tagId: 'tag-1',
        analysisKind: '',
        additionalPrompt: '',
        resultUserId: '',
      },
    });

    wrapper.vm.requestCloseForm();
    expect(wrapper.vm.formVisible).to.equal(true);
    expect(wrapper.vm.discardConfirmVisible).to.equal(true);

    wrapper.vm.cancelDiscardChanges();
    expect(wrapper.vm.formVisible).to.equal(true);
    expect(wrapper.vm.form.tagId).to.equal('tag-1');

    wrapper.vm.requestCloseForm();
    wrapper.vm.confirmDiscardChanges();
    expect(wrapper.vm.formVisible).to.equal(true);

    wrapper.findComponent(ConfirmDialogStub).vm.$emit('closed');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.formVisible).to.equal(false);
  });

  it('タグと解析種別が未選択なら必須指定・aria-invalid・エラーを関連付ける', async () => {
    const { wrapper } = createWrapper();
    await wrapper.vm.openCreateForm();
    await wrapper.vm.$nextTick();

    const tagSelect = wrapper.get('#scoped-ai-analysis-settings-floor-tag');
    const kindSelect = wrapper.get('#scoped-ai-analysis-settings-floor-kind');
    kindSelect.element.focus();
    await wrapper.vm.saveSetting();
    await wrapper.vm.$nextTick();
    expect(tagSelect.attributes('required')).not.to.equal(undefined);
    expect(tagSelect.attributes('aria-invalid')).to.equal('true');
    expect(tagSelect.attributes('aria-describedby')).to.equal(
      'scoped-ai-analysis-settings-floor-tag-error'
    );
    expect(kindSelect.attributes('required')).not.to.equal(undefined);
    expect(kindSelect.attributes('aria-invalid')).to.equal('true');
    expect(kindSelect.attributes('aria-describedby')).to.equal(
      'scoped-ai-analysis-settings-floor-kind-error'
    );
    expect(wrapper.get('#scoped-ai-analysis-settings-floor-tag-error').attributes('role')).to.equal('alert');
    expect(wrapper.get('#scoped-ai-analysis-settings-floor-kind-error').attributes('role')).to.equal('alert');
    expect(document.activeElement).to.equal(tagSelect.element);
  });

  [
    {
      scope: 'floor',
      tagId: 'floor-tag-1',
      tagField: 'floor_tag',
      props: {},
    },
    {
      scope: 'room',
      tagId: 'room-tag-1',
      tagField: 'room_tag',
      props: { scope: 'room', roomId: 'room-1' },
    },
  ].forEach(({ scope, tagId, tagField, props }) => {
    it(`${scope}の作成ではタグ・解析種別と、対象範囲内で選んだ解析結果の投稿者を保存する`, async () => {
      const searchCalls = [];
      const createCalls = [];
      aiAnalysisSettingsApi[scope].searchResultUsers = (payload) => {
        searchCalls.push(payload);
        return Promise.resolve({
          data: [{ _id: 'result-user-1', username: 'Result User', image_name: null }],
        });
      };
      aiAnalysisSettingsApi[scope].create = (payload) => {
        createCalls.push(payload);
        return Promise.resolve({ data: settingFixture({ scope }) });
      };
      aiAnalysisSettingsApi[scope].list = () => Promise.resolve({ data: [] });
      const { wrapper } = createWrapper({
        props,
        stubs: { UiField: false },
      });
      await wrapper.vm.openCreateForm();
      await wrapper.setData({
        tags: [{ _id: tagId, name: `${scope} Tag`, translations: [] }],
      });
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      const tagSelect = await selectWithSeparatedEvents(
        wrapper,
        `#scoped-ai-analysis-settings-${scope}-tag`,
        tagId
      );
      const kindSelect = await selectWithSeparatedEvents(
        wrapper,
        `#scoped-ai-analysis-settings-${scope}-kind`,
        'vision'
      );
      await flushPromises();

      expect(wrapper.vm.form.tagId).to.equal(tagId);
      expect(wrapper.vm.form.analysisKind).to.equal('vision');
      expect(tagSelect.get('option[value=""]').attributes('disabled')).not.to.equal(undefined);
      expect(kindSelect.get('option[value=""]').attributes('disabled')).not.to.equal(undefined);
      [tagSelect, kindSelect].forEach((select) => {
        expect(
          select.element.closest('.ui-field').classList.contains('ui-field--stacked')
        ).to.equal(true);
      });

      await wrapper.setData({ resultUserSearch: 'Result' });
      await wrapper.vm.searchResultUsers();
      await wrapper.vm.$nextTick();
      await wrapper.get('input[type="radio"][value="result-user-1"]').setValue();

      const scopeIds = {
        floor_id: 'floor-1',
        ...(scope === 'room' ? { room_id: 'room-1' } : {}),
      };
      expect(searchCalls).to.deep.equal([{ ...scopeIds, search: 'Result' }]);

      await wrapper.vm.saveSetting();

      expect(createCalls).to.deep.equal([
        {
          ...scopeIds,
          [tagField]: tagId,
          analysis_kind: 'vision',
          additional_prompt: '',
          result_user: 'result-user-1',
        },
      ]);
    });
  });

  it('フロア一覧は削除済み設定を要求せずactive設定だけを取得する', async () => {
    const calls = [];
    tagApi.floorTag.list = (payload) => {
      calls.push({ name: 'tags', payload });
      return Promise.resolve({ data: [{ _id: 'tag-1', name: 'Tag' }] });
    };
    aiAnalysisSettingsApi.floor.list = (payload) => {
      calls.push({ name: 'settings', payload });
      return Promise.resolve({ data: [settingFixture()] });
    };
    const { wrapper } = createWrapper();

    await wrapper.vm.openedDialog();
    await wrapper.vm.fetchSettings();
    await wrapper.vm.fetchSettingsAfterMutation();

    expect(calls).to.deep.equal([
      { name: 'tags', payload: { floor_id: 'floor-1' } },
      {
        name: 'settings',
        payload: { floor_id: 'floor-1' },
      },
      {
        name: 'settings',
        payload: { floor_id: 'floor-1' },
      },
      {
        name: 'settings',
        payload: { floor_id: 'floor-1' },
      },
    ]);
    expect(wrapper.find('input[type="checkbox"]').exists()).to.equal(false);
    expect(wrapper.vm.tags).to.have.lengthOf(1);
    expect(wrapper.vm.settings).to.have.lengthOf(1);
  });

  it('ルームではfloor_idとroom_idを必ず一覧・タグ取得へ渡す', async () => {
    const calls = [];
    tagApi.roomTag.list = (payload) => {
      calls.push({ name: 'tags', payload });
      return Promise.resolve({ data: [] });
    };
    aiAnalysisSettingsApi.room.list = (payload) => {
      calls.push({ name: 'settings', payload });
      return Promise.resolve({ data: [] });
    };
    const { wrapper } = createWrapper({
      props: { scope: 'room', floorId: 'floor-1', roomId: 'room-1' },
    });

    await wrapper.vm.openedDialog();

    expect(calls).to.deep.equal([
      { name: 'tags', payload: { room_id: 'room-1' } },
      {
        name: 'settings',
        payload: { floor_id: 'floor-1', room_id: 'room-1' },
      },
    ]);
  });

  it('親設定に依存せず解析結果の投稿者を必須とし、未選択なら作成しない', async () => {
    const createCalls = [];
    aiAnalysisSettingsApi.floor.create = (payload) => {
      createCalls.push(payload);
      return Promise.resolve({ data: settingFixture() });
    };
    aiAnalysisSettingsApi.floor.list = () => Promise.resolve({ data: [] });
    const { wrapper } = createWrapper();
    await wrapper.vm.openCreateForm();
    await wrapper.setData({
      form: {
        tagId: 'tag-1',
        analysisKind: 'vision',
        additionalPrompt: '  prompt  ',
        resultUserId: '',
      },
    });

    await wrapper.vm.saveSetting();
    await wrapper.vm.$nextTick();

    expect(createCalls).to.deep.equal([]);
    expect(wrapper.vm.resultUserError).to.equal('aiAnalysisSettings.managementSelectResultUser');
    const searchInput = wrapper.get('#scoped-ai-analysis-settings-floor-result-user-search');
    const error = wrapper.get('#scoped-ai-analysis-settings-floor-result-user-search-error');
    expect(searchInput.attributes('aria-invalid')).to.equal('true');
    expect(searchInput.attributes('aria-describedby')).to.contain(error.attributes('id'));
    expect(error.attributes('role')).to.equal('alert');
    expect(wrapper.find('.ai-analysis-setting-fields__result-user-list').exists()).to.equal(false);
    expect(wrapper.find('.parent-preview').exists()).to.equal(false);
  });

  it('編集で保存済みユーザを検索前に示し、検索後に候補を変更して送信できる', async () => {
    const updateCalls = [];
    aiAnalysisSettingsApi.floor.searchResultUsers = () =>
      Promise.resolve({
        data: [{ _id: 'new-user', username: 'New User', image_name: null }],
      });
    aiAnalysisSettingsApi.floor.update = (payload) => {
      updateCalls.push(payload);
      return Promise.resolve({ data: settingFixture() });
    };
    aiAnalysisSettingsApi.floor.list = () => Promise.resolve({ data: [] });
    const { wrapper } = createWrapper();
    const setting = settingFixture({
      result_user: { _id: 'saved-user', username: 'Saved User', image_name: 'saved.png' },
    });

    wrapper.vm.openEditForm(setting);
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.form.resultUserId).to.equal('saved-user');
    expect(wrapper.find('.ai-analysis-setting-fields__result-user-list').exists()).to.equal(false);
    expect(wrapper.get('.ai-analysis-setting-fields__selected-user').text()).to.contain('Saved User');
    expect(wrapper.get('.ai-analysis-setting-fields__selected-user img').attributes('src')).to.equal(
      '/profile/saved-user/saved.png'
    );

    await wrapper.setData({ resultUserSearch: 'New' });
    await wrapper.vm.searchResultUsers();
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.resultUserSearchCompleted).to.equal(true);
    expect(wrapper.get('.ai-analysis-setting-fields__result-user-list legend').text()).to.equal(
      'aiAnalysisSettings.resultUserSearchResults'
    );
    expect(wrapper.get('input[type="radio"][value="saved-user"]').element.checked).to.equal(true);
    await wrapper.get('input[type="radio"][value="new-user"]').setValue();
    await wrapper.vm.saveSetting();

    expect(updateCalls).to.deep.equal([
      {
        _id: 'setting-1',
        floor_id: 'floor-1',
        floor_tag: 'tag-1',
        analysis_kind: 'vision',
        additional_prompt: 'prompt',
        result_user: 'new-user',
        revision: 2,
      },
    ]);
  });

  it('検索完了後だけ検索結果の表題と0件案内を表示する', async () => {
    aiAnalysisSettingsApi.floor.searchResultUsers = () => Promise.resolve({ data: [] });
    const { wrapper } = createWrapper();
    await wrapper.vm.openCreateForm();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.resultUserSearchCompleted).to.equal(false);
    expect(wrapper.find('.ai-analysis-setting-fields__result-user-list').exists()).to.equal(false);

    await wrapper.vm.searchResultUsers();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.resultUserSearchCompleted).to.equal(true);
    expect(wrapper.get('.ai-analysis-setting-fields__result-user-list legend').text()).to.equal(
      'aiAnalysisSettings.resultUserSearchResults'
    );
    expect(wrapper.get('.ai-analysis-setting-fields__result-user-list [role="status"]').text()).to.equal(
      'aiAnalysisSettings.resultUserSearchEmpty'
    );
  });

  it('ユーザ検索の失敗を管理画面と同じメッセージで通知する', async () => {
    aiAnalysisSettingsApi.floor.searchResultUsers = () => Promise.reject({});
    const { wrapper, dispatchCalls } = createWrapper();
    await wrapper.vm.openCreateForm();
    await wrapper.setData({ resultUserSearch: 'Alice' });

    await wrapper.vm.searchResultUsers();

    expect(dispatchCalls).to.deep.equal([
      {
        type: 'doShowSnackbar',
        payload: {
          message: 'aiAnalysisSettings.managementResultUserSearchFailed',
          role: 'alert',
        },
      },
    ]);
    expect(wrapper.vm.resultUserSearchCompleted).to.equal(false);
    expect(wrapper.vm.searching).to.equal(false);
  });

  it('検索中は検索操作と保存だけを抑止し、入力継続と戻る操作を許可する', async () => {
    const searchRequest = createDeferred();
    let searchCalls = 0;
    let updateCalls = 0;
    aiAnalysisSettingsApi.floor.searchResultUsers = () => {
      searchCalls += 1;
      return searchRequest.promise;
    };
    aiAnalysisSettingsApi.floor.update = () => {
      updateCalls += 1;
      return Promise.resolve({ data: settingFixture() });
    };
    const { wrapper } = createWrapper();
    wrapper.vm.openEditForm(settingFixture());
    await wrapper.setData({
      resultUserSearch: 'Next',
      resultUserSearchCompleted: true,
    });

    const pending = wrapper.vm.searchResultUsers();
    await wrapper.vm.$nextTick();

    const dialog = wrapper.findComponent(UiDialogStub);
    const actions = wrapper.get('.setting-form-actions');
    expect(wrapper.vm.searching).to.equal(true);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.closeBlocked).to.equal(false);
    expect(dialog.props('closeOnEscape')).to.equal(true);
    expect(dialog.props('closeOnBackdrop')).to.equal(true);
    expect(actions.findAll('button')[0].attributes('disabled')).to.equal(undefined);
    expect(actions.findAll('button')[1].attributes('disabled')).not.to.equal(undefined);
    expect(wrapper.get('#scoped-ai-analysis-settings-floor-tag').attributes('disabled')).to.equal(undefined);
    expect(wrapper.get('#scoped-ai-analysis-settings-floor-kind').attributes('disabled')).to.equal(undefined);
    expect(wrapper.get('#scoped-ai-analysis-settings-floor-prompt').attributes('disabled')).to.equal(undefined);
    expect(
      wrapper.get('#scoped-ai-analysis-settings-floor-result-user-search').attributes('disabled')
    ).not.to.equal(undefined);
    expect(wrapper.get('.ai-analysis-setting-fields__search-control button').attributes('disabled')).not.to.equal(
      undefined
    );
    expect(wrapper.get('input[type="radio"]').attributes('disabled')).not.to.equal(undefined);
    expect(wrapper.get('ui-progress-stub').attributes('style')).not.to.contain('display: none');

    await wrapper.vm.searchResultUsers();
    await wrapper.vm.saveSetting();

    expect(searchCalls).to.equal(1);
    expect(updateCalls).to.equal(0);

    wrapper.vm.requestClose({ reason: 'escape' });
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.formVisible).to.equal(false);
    expect(wrapper.vm.visible).to.equal(true);
    expect(wrapper.vm.searching).to.equal(false);

    searchRequest.resolve({
      data: [{ _id: 'late-user', username: 'Late User' }],
    });
    await pending;

    expect(wrapper.vm.searching).to.equal(false);
    expect(wrapper.vm.resultUsers).to.deep.equal([]);
    expect(wrapper.vm.resultUserSearchCompleted).to.equal(false);
  });

  it('検索中にダイアログを閉じても遅延応答を反映しない', async () => {
    const searchRequest = createDeferred();
    aiAnalysisSettingsApi.floor.searchResultUsers = () => searchRequest.promise;
    const { wrapper } = createWrapper();
    await wrapper.vm.openCreateForm();

    const pending = wrapper.vm.searchResultUsers();
    await wrapper.setProps({ dialogVisible: false });
    searchRequest.resolve({
      data: [{ _id: 'late-user', username: 'Late User' }],
    });
    await pending;

    expect(wrapper.vm.searching).to.equal(false);
    expect(wrapper.vm.resultUsers).to.deep.equal([]);
    expect(wrapper.vm.resultUserSearchCompleted).to.equal(false);
  });

  it('対象範囲を指定して検索した解析結果の投稿者を送信する', async () => {
    const createCalls = [];
    aiAnalysisSettingsApi.floor.searchResultUsers = (payload) =>
      Promise.resolve({ data: [{ _id: 'user-2', username: 'Admin selected' }], payload });
    aiAnalysisSettingsApi.floor.create = (payload) => {
      createCalls.push(payload);
      return Promise.resolve({ data: settingFixture() });
    };
    aiAnalysisSettingsApi.floor.list = () => Promise.resolve({ data: [] });
    const { wrapper } = createWrapper();
    await wrapper.vm.openCreateForm();
    await wrapper.setData({ resultUserSearch: 'Admin' });
    await wrapper.vm.searchResultUsers();
    await wrapper.setData({
      form: {
        tagId: 'tag-1',
        analysisKind: 'conversation',
        additionalPrompt: '',
        resultUserId: 'user-2',
      },
    });

    await wrapper.vm.saveSetting();

    expect(createCalls[0]).to.deep.equal({
      floor_id: 'floor-1',
      floor_tag: 'tag-1',
      analysis_kind: 'conversation',
      additional_prompt: '',
      result_user: 'user-2',
    });
  });

  it('ルーム設定の更新でも選択済みresult_userと対象範囲を送信する', async () => {
    const updateCalls = [];
    const setting = settingFixture({
      scope: 'room',
      room: 'room-1',
      tag: { _id: 'room-tag-1', name: 'Room Tag' },
    });
    aiAnalysisSettingsApi.room.update = (payload) => {
      updateCalls.push(payload);
      return Promise.resolve({ data: setting });
    };
    aiAnalysisSettingsApi.room.list = () => Promise.resolve({ data: [] });
    const { wrapper } = createWrapper({
      props: { scope: 'room', floorId: 'floor-1', roomId: 'room-1' },
    });
    wrapper.vm.openEditForm(setting);
    await flushPromises();

    await wrapper.vm.saveSetting();

    expect(updateCalls).to.deep.equal([
      {
        _id: 'setting-1',
        floor_id: 'floor-1',
        room_id: 'room-1',
        room_tag: 'room-tag-1',
        analysis_kind: 'vision',
        additional_prompt: 'prompt',
        result_user: 'user-1',
        revision: 2,
      },
    ]);
  });

  it('編集保存の成功後はフォームを開いた編集ボタンへフォーカスを戻す', async () => {
    const setting = settingFixture();
    aiAnalysisSettingsApi.floor.update = () => Promise.resolve({ data: setting });
    aiAnalysisSettingsApi.floor.list = () => Promise.resolve({ data: [settingFixture({ revision: 3 })] });
    const { wrapper } = createWrapper();
    await wrapper.setData({ settings: [setting] });
    const trigger = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'aiAnalysisSettings.edit');

    await trigger.trigger('click');
    await flushPromises();
    expect(wrapper.get('.settings-view').isVisible()).to.equal(false);
    expect(wrapper.get('#scoped-ai-analysis-settings-floor-title').text()).to.equal(
      'aiAnalysisSettings.editTitle'
    );
    expect(document.activeElement).to.equal(
      wrapper.get('#scoped-ai-analysis-settings-floor-tag').element
    );

    await wrapper.vm.saveSetting();
    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.formVisible).to.equal(false);
    expect(wrapper.get('.settings-view').isVisible()).to.equal(true);
    expect(wrapper.get('#scoped-ai-analysis-settings-floor-title').text()).to.equal(
      'aiAnalysisSettings.titleFloor'
    );
    expect(document.activeElement.id).to.equal(
      'scoped-ai-analysis-settings-floor-edit-desktop-setting-1'
    );
  });

  it('作成保存後は再取得した一覧の作成対象へフォーカスする', async () => {
    const created = settingFixture({ _id: 'setting-created', revision: 1 });
    aiAnalysisSettingsApi.floor.create = () => Promise.resolve({ data: created });
    aiAnalysisSettingsApi.floor.list = () => Promise.resolve({ data: [created] });
    const { wrapper } = createWrapper();
    const trigger = wrapper.get('#scoped-ai-analysis-settings-floor-create-desktop');

    await trigger.trigger('click');
    await wrapper.setData({
      form: {
        tagId: 'tag-1',
        analysisKind: 'vision',
        additionalPrompt: '',
        resultUserId: 'user-1',
      },
    });

    await wrapper.vm.saveSetting();
    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.formVisible).to.equal(false);
    expect(wrapper.get('.settings-view').isVisible()).to.equal(true);
    expect(document.activeElement).to.equal(
      wrapper.get('#scoped-ai-analysis-settings-floor-edit-desktop-setting-created').element
    );
  });

  it('保存対象が再取得した一覧にない場合はダイアログ見出しへフォーカスする', async () => {
    const created = settingFixture({ _id: 'setting-not-listed', revision: 1 });
    aiAnalysisSettingsApi.floor.create = () => Promise.resolve({ data: created });
    aiAnalysisSettingsApi.floor.list = () => Promise.resolve({ data: [] });
    const { wrapper } = createWrapper();

    await wrapper.get('#scoped-ai-analysis-settings-floor-create-desktop').trigger('click');
    await wrapper.setData({
      form: {
        tagId: 'tag-1',
        analysisKind: 'vision',
        additionalPrompt: '',
        resultUserId: 'user-1',
      },
    });

    await wrapper.vm.saveSetting();
    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(document.activeElement).to.equal(
      wrapper.get('#scoped-ai-analysis-settings-floor-title').element
    );
  });

  it('保存成功後の一覧再取得失敗はエラー状態にして再試行を表示する', async () => {
    aiAnalysisSettingsApi.floor.create = () =>
      Promise.resolve({ data: settingFixture({ _id: 'setting-created' }) });
    aiAnalysisSettingsApi.floor.list = () => Promise.reject(new Error('reload failed'));
    const { wrapper } = createWrapper();

    await wrapper.get('#scoped-ai-analysis-settings-floor-create-desktop').trigger('click');
    await wrapper.setData({
      form: {
        tagId: 'tag-1',
        analysisKind: 'vision',
        additionalPrompt: '',
        resultUserId: 'user-1',
      },
    });

    await wrapper.vm.saveSetting();
    await flushPromises();

    expect(wrapper.vm.formVisible).to.equal(false);
    expect(wrapper.vm.loadFailed).to.equal(true);
    expect(wrapper.get('.settings-load-error').text()).to.contain('再試行');
    expect(wrapper.find('.settings-summary').exists()).to.equal(false);
  });

  it('削除確認で元に戻せないことを案内し、取消時はAPIを呼ばない', async () => {
    let removeCalls = 0;
    aiAnalysisSettingsApi.floor.remove = () => {
      removeCalls += 1;
      return Promise.resolve({});
    };
    const setting = settingFixture();
    const { wrapper } = createWrapper({ props: { targetName: '対象フロア名' } });
    await wrapper.setData({ settings: [setting] });
    const deleteButton = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'aiAnalysisSettings.delete');

    await deleteButton.trigger('click');

    const lifecycleDialog = wrapper.findComponent(ManagementLifecycleDialogStub);
    expect(removeCalls).to.equal(0);
    expect(lifecycleDialog.props()).to.include({
      open: true,
      sending: false,
      action: 'delete',
      resourceLabel: 'aiAnalysisSettings.titleFloor',
      resourceName: 'aiAnalysisSettings.kindVision / Tag',
      showDeleteRecoveryNote: false,
      warning: 'この操作は元に戻せません',
      actionsAdjacent: true,
    });
    expect(wrapper.get('.setting-delete-context').text()).to.contain('対象フロア名');
    expect(wrapper.get('.setting-delete-context').text()).to.contain(
      'aiAnalysisSettings.kindVision / Tag'
    );

    lifecycleDialog.vm.$emit('cancel');
    await wrapper.vm.$nextTick();

    expect(removeCalls).to.equal(0);
    expect(wrapper.vm.deleteDialogVisible).to.equal(false);
    expect(wrapper.vm.deleteTarget).to.deep.equal(setting);
    lifecycleDialog.vm.$emit('closed');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.deleteTarget).to.equal(null);
  });

  it('削除は対象範囲のIDとリビジョンを1回だけ送信し、有効な設定の再取得後に確認を閉じる', async () => {
    const removeCalls = [];
    const listCalls = [];
    let resolveRemove;
    aiAnalysisSettingsApi.room.remove = (payload) => {
      removeCalls.push(payload);
      return new Promise((resolve) => {
        resolveRemove = resolve;
      });
    };
    aiAnalysisSettingsApi.room.list = (payload) => {
      listCalls.push(payload);
      return Promise.resolve({ data: [] });
    };
    const { wrapper } = createWrapper({
      props: { scope: 'room', floorId: 'floor-1', roomId: 'room-1' },
    });
    const setting = settingFixture({ scope: 'room' });
    await wrapper.setData({ settings: [setting] });
    wrapper.vm.openDeleteConfirmation(setting);
    const focusCalls = [];
    wrapper.vm.focusSavedSetting = () => focusCalls.push(wrapper.vm.savedSettingFocusRequest);

    const request = wrapper.vm.confirmDeleteSetting();
    await wrapper.vm.$nextTick();
    await wrapper.vm.confirmDeleteSetting();

    expect(removeCalls).to.deep.equal([
      { _id: 'setting-1', revision: 2, floor_id: 'floor-1', room_id: 'room-1' },
    ]);
    expect(wrapper.findComponent(ManagementLifecycleDialogStub).props('sending')).to.equal(true);

    resolveRemove({});
    await request;
    await flushPromises();

    expect(listCalls).to.deep.equal([{ floor_id: 'floor-1', room_id: 'room-1' }]);
    expect(wrapper.vm.settings).to.deep.equal([]);
    expect(wrapper.vm.deleteDialogVisible).to.equal(false);
    expect(wrapper.vm.deleteTarget).to.deep.equal(setting);
    expect(focusCalls).to.deep.equal([]);

    wrapper.findComponent(ManagementLifecycleDialogStub).vm.$emit('closed');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.deleteTarget).to.equal(null);
    expect(focusCalls).to.deep.equal([{ settingId: null, presentation: 'desktop' }]);
  });

  it('削除の通常失敗では確認対象を維持して再操作できる', async () => {
    const error = { response: { status: 500 } };
    aiAnalysisSettingsApi.floor.remove = () => Promise.reject(error);
    const setting = settingFixture();
    const { wrapper, dispatchCalls } = createWrapper();
    wrapper.vm.openDeleteConfirmation(setting);

    await wrapper.vm.confirmDeleteSetting();

    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.deleteDialogVisible).to.equal(true);
    expect(wrapper.vm.deleteTarget).to.deep.equal(setting);
    expect(dispatchCalls.some((call) => call.payload?.role === 'alert')).to.equal(true);
  });

  it('削除のリビジョン競合では再送せずactive一覧を再取得して確認を閉じる', async () => {
    let removeCalls = 0;
    let listCalls = 0;
    const setting = settingFixture();
    aiAnalysisSettingsApi.floor.remove = () => {
      removeCalls += 1;
      return Promise.reject({ response: { status: 409, data: { error: { code: 'CONFLICT' } } } });
    };
    aiAnalysisSettingsApi.floor.list = (payload) => {
      listCalls += 1;
      expect(payload).to.deep.equal({ floor_id: 'floor-1' });
      return Promise.resolve({ data: [{ ...setting, revision: 3 }] });
    };
    const { wrapper, dispatchCalls } = createWrapper();
    wrapper.vm.openDeleteConfirmation(setting);

    await wrapper.vm.confirmDeleteSetting();

    expect(removeCalls).to.equal(1);
    expect(listCalls).to.equal(1);
    expect(wrapper.vm.settings[0].revision).to.equal(3);
    expect(wrapper.vm.deleteDialogVisible).to.equal(false);
    wrapper.findComponent(ManagementLifecycleDialogStub).vm.$emit('closed');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.deleteTarget).to.equal(null);
    expect(dispatchCalls.some((call) => call.payload?.role === 'alert')).to.equal(true);
  });

  it.each(['remove', 'update'])('%sの対象が既に削除されていたら再送せず一覧と操作画面を更新する', async (operation) => {
    let mutationCalls = 0;
    let listCalls = 0;
    aiAnalysisSettingsApi.floor[operation] = () => {
      mutationCalls += 1;
      return Promise.reject({ response: { status: 404, data: { error: { code: 'NOT_FOUND' } } } });
    };
    aiAnalysisSettingsApi.floor.list = () => {
      listCalls += 1;
      return Promise.resolve({ data: [] });
    };
    const setting = settingFixture();
    const { wrapper, dispatchCalls } = createWrapper();
    await wrapper.setData({ settings: [setting] });
    if (operation === 'remove') {
      wrapper.vm.openDeleteConfirmation(setting);
      await wrapper.vm.confirmDeleteSetting();
    } else {
      wrapper.vm.openEditForm(setting);
      await wrapper.vm.saveSetting();
    }
    await flushPromises();

    expect(mutationCalls).to.equal(1);
    expect(listCalls).to.equal(1);
    expect(wrapper.vm.settings).to.deep.equal([]);
    expect(wrapper.vm.deleteDialogVisible).to.equal(false);
    expect(wrapper.vm.formVisible).to.equal(false);
    expect(wrapper.vm.sending).to.equal(false);
    expect(dispatchCalls.some((call) => call.payload?.role === 'alert')).to.equal(true);
  });

  it('編集のリビジョン競合では更新処理を再送せず最新一覧を再取得する', async () => {
    let updateCalls = 0;
    let listCalls = 0;
    const setting = settingFixture();
    aiAnalysisSettingsApi.floor.update = () => {
      updateCalls += 1;
      return Promise.reject({ response: { status: 409, data: { error: { code: 'CONFLICT' } } } });
    };
    aiAnalysisSettingsApi.floor.list = () => {
      listCalls += 1;
      return Promise.resolve({ data: [{ ...setting, revision: 3 }] });
    };
    const { wrapper, dispatchCalls } = createWrapper();
    await wrapper.setData({ settings: [setting] });
    const trigger = wrapper
      .findAll('button')
      .find((button) => button.text().trim() === 'aiAnalysisSettings.edit');
    await trigger.trigger('click');
    await flushPromises();

    await wrapper.vm.saveSetting();
    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(updateCalls).to.equal(1);
    expect(listCalls).to.equal(1);
    expect(wrapper.vm.settings[0].revision).to.equal(3);
    expect(dispatchCalls.some((call) => call.payload?.role === 'alert')).to.equal(true);
    expect(wrapper.vm.formVisible).to.equal(false);
    expect(document.activeElement.id).to.equal(
      'scoped-ai-analysis-settings-floor-edit-desktop-setting-1'
    );
  });

  it('追加プロンプトの文字数・バイト数・文字起こし用の上限を共通の入力検証で案内する', async () => {
    const { wrapper } = createWrapper();
    await wrapper.vm.openCreateForm();
    await wrapper.setData({
      form: {
        tagId: 'tag-1',
        analysisKind: 'speech',
        additionalPrompt: 'あ'.repeat(75),
        resultUserId: 'user-1',
      },
    });

    expect(wrapper.vm.validateForm()).to.equal(false);
    expect(wrapper.vm.promptError).to.contain('aiAnalysisSettings.validationSpeechPromptBytes');
    expect(wrapper.vm.promptDescription).to.contain('"max":224');
  });
});
