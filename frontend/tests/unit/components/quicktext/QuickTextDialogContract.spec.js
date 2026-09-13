import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import EditQuickTextGroupDialog from '@/components/quicktext/EditQuickTextGroupDialog.vue';
import EditQuickTextItemDialog from '@/components/quicktext/EditQuickTextItemDialog.vue';
import { quickTextDialogStubs } from './quickTextDialogStubs';

const cases = [
  {
    label: '管理画面の単語グループ',
    component: EditQuickTextGroupDialog,
    titleId: 'quicktext-group-dialog-title',
    createTitle: '単語グループ作成',
    editTitle: '単語グループ編集',
    initialFocus: '#qt_group_title',
    field: 'title',
    props: { propsGroup: null },
    createDescriptionIds: '',
    createContexts: [],
    editProps: { propsGroup: { _id: 'group-id', title: '管理単語グループ' } },
    editDescriptionIds: 'quicktext-group-target-context',
    editContexts: [
      {
        contextId: 'quicktext-group-target-context',
        label: '単語グループ名',
        name: '管理単語グループ',
      },
    ],
  },
  {
    label: '管理画面の単語',
    component: EditQuickTextItemDialog,
    titleId: 'quicktext-item-dialog-title',
    createTitle: '単語作成',
    editTitle: '単語編集',
    initialFocus: '#qt_item_label',
    field: 'label',
    props: { propsItem: null, group: { _id: 'group-id', title: '管理単語グループ' } },
    createDescriptionIds: 'quicktext-item-group-context',
    createContexts: [
      {
        contextId: 'quicktext-item-group-context',
        label: '単語グループ名',
        name: '管理単語グループ',
      },
    ],
    editProps: { propsItem: { _id: 'item-id', label: '管理単語' } },
    editDescriptionIds: 'quicktext-item-group-context quicktext-item-target-context',
    editContexts: [
      {
        contextId: 'quicktext-item-group-context',
        label: '単語グループ名',
        name: '管理単語グループ',
      },
      { contextId: 'quicktext-item-target-context', label: '名称', name: '管理単語' },
    ],
  },
];

const createWrapper = (entry, props = {}) =>
  shallowMount(entry.component, {
    stubs: quickTextDialogStubs,
    props: {
      dialogVisible: true,
      ...entry.props,
      ...props,
    },
    mocks: {
      $store: { getters: { lang: 'ja', userToken: 'token' }, dispatch: () => Promise.resolve() },
      $t: (key) => key,
    },
  });

describe('単語編集ダイアログの共通仕様', () => {
  cases.forEach((entry) => {
    it(`${entry.label}は共通編集ダイアログを使い、入力前のエラーを表示しない`, async () => {
      const wrapper = createWrapper(entry);
      const dialog = wrapper.findComponent({ name: 'BaseEditDialog' });
      const field = wrapper.findComponent({ name: 'UiField' });
      const contexts = wrapper.findAllComponents({ name: 'DialogTargetContext' });

      expect(dialog.props('visible')).to.equal(true);
      expect(dialog.props('sending')).to.equal(false);
      expect(dialog.props('titleId')).to.equal(entry.titleId);
      expect(dialog.props('titleText')).to.equal(entry.createTitle);
      expect(dialog.props('initialFocus')).to.equal(entry.initialFocus);
      expect(dialog.props('descriptionIds')).to.equal(entry.createDescriptionIds);
      expect(dialog.props('cancelLabel')).to.equal('キャンセル');
      expect(dialog.props('confirmLabel')).to.equal('作成');
      expect(dialog.props('cancelTestId')).to.equal('quicktext-dialog-cancel');
      expect(dialog.props('confirmTestId')).to.equal('quicktext-dialog-submit');
      expect(dialog.props('actionsAdjacent')).to.equal(true);
      expect(dialog.props('progressMode')).to.equal('indeterminate');
      expect(wrapper.find(`#${entry.titleId}`).exists()).to.equal(true);
      expect(contexts.map((context) => context.props())).to.deep.equal(entry.createContexts);
      expect(field.props('invalid')).to.equal(false);
      expect(field.props('error')).to.equal('');

      expect(wrapper.findComponent({ name: 'AnalyticsResourceNotice' }).exists()).to.equal(false);
      expect(wrapper.find('.quicktext-dialog-actions').exists()).to.equal(false);

      await wrapper.find(entry.initialFocus).trigger('blur');
      await wrapper.vm.$nextTick();

      expect(wrapper.vm.v$[entry.field].$dirty).to.equal(true);
      expect(field.props('invalid')).to.equal(true);
      expect(field.props('error')).to.equal('必須');

      await wrapper.setData({ sending: true });

      expect(dialog.props('sending')).to.equal(true);
    });

    it(`${entry.label}は編集対象を表示して保存操作を使う`, () => {
      const wrapper = createWrapper(entry, entry.editProps);
      const dialog = wrapper.findComponent({ name: 'BaseEditDialog' });
      const contexts = wrapper.findAllComponents({ name: 'DialogTargetContext' });

      expect(dialog.props()).to.include({
        titleText: entry.editTitle,
        descriptionIds: entry.editDescriptionIds,
        confirmLabel: '保存',
        actionsAdjacent: true,
      });
      expect(contexts.map((context) => context.props())).to.deep.equal(entry.editContexts);
    });
  });

  it('フォーカスが外れた後、200文字を許可し201文字を拒否する', async () => {
    const entry = cases[0];
    const wrapper = createWrapper(entry);
    const input = wrapper.find(entry.initialFocus);
    const field = wrapper.findComponent({ name: 'UiField' });

    await input.setValue('a'.repeat(200));
    await input.trigger('blur');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.v$.title.maxLength.$invalid).to.equal(false);
    expect(field.props('invalid')).to.equal(false);
    expect(field.props('error')).to.equal('');

    await input.setValue('a'.repeat(201));
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.v$.title.maxLength.$invalid).to.equal(true);
    expect(field.props('invalid')).to.equal(true);
    expect(field.props('error')).to.equal('200文字まで');
  });
});
