import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import ManagementLifecycleDialog from '@/components/management/ManagementLifecycleDialog.vue';

const messages = {
  'managementUi.deleteConfirmTitle': '削除の確認',
  'managementUi.restoreConfirmTitle': '復元の確認',
  'managementUi.deletedCanRestore': '削除後も管理画面から復元できます。',
  'managementUi.delete': '削除する',
  'managementUi.restore': '復元する',
  'managementUi.cancel': 'キャンセル',
};

const translate = (key, values = {}) => {
  if (key === 'managementUi.deleteConfirmMessage') {
    return `${values.resource}「${values.name}」を削除します。`;
  }
  if (key === 'managementUi.restoreConfirmMessage') {
    return `${values.resource}「${values.name}」を復元します。`;
  }
  return messages[key] || key;
};

const UiDialogStub = {
  name: 'UiDialog',
  props: ['open', 'titleId', 'descriptionIds', 'closeOnEscape', 'closeOnBackdrop'],
  emits: ['request-close', 'closed'],
  template:
    '<section role="dialog" :aria-labelledby="titleId" :aria-describedby="descriptionIds"><header><slot name="title" /></header><main><slot /></main><footer><slot name="actions" /></footer><slot name="status" /></section>',
};

const UiButtonStub = {
  name: 'UiButton',
  inheritAttrs: false,
  props: ['appearance', 'tone', 'iconOnly', 'disabled'],
  template: '<button v-bind="$attrs" :disabled="disabled" :data-tone="tone"><slot /></button>',
};

const UiIconStub = {
  name: 'UiIcon',
  props: ['name'],
  template: '<i :data-icon="name" />',
};

const UiProgressStub = {
  name: 'UiProgress',
  inheritAttrs: false,
  props: ['mode'],
  template: '<div role="progressbar" v-bind="$attrs" />',
};

const factory = (props = {}, slots = {}) =>
  shallowMount(ManagementLifecycleDialog, {
    props: {
      open: true,
      sending: false,
      action: 'delete',
      resourceLabel: 'ユーザー',
      resourceName: 'テスト利用者',
      ...props,
    },
    slots,
    stubs: {
      UiButton: UiButtonStub,
      UiDialog: UiDialogStub,
      UiIcon: UiIconStub,
      UiProgress: UiProgressStub,
    },
    mocks: { $t: translate },
  });

describe('管理対象の削除・復元ダイアログ', () => {
  it('削除対象、復元可能な説明、dangerの確定操作を明示する', () => {
    const wrapper = factory();
    const dialog = wrapper.findComponent(UiDialogStub);
    const confirmButtons = wrapper.findAll('[data-testid="management-lifecycle-confirm"]');

    expect(wrapper.get('h2').text()).to.equal('削除の確認');
    expect(wrapper.text()).to.contain('ユーザー「テスト利用者」を削除します。');
    expect(wrapper.text()).to.contain('削除後も管理画面から復元できます。');
    expect(dialog.attributes('aria-describedby').split(' ')).to.have.lengthOf(2);
    confirmButtons.forEach((button) => {
      expect(button.attributes('data-tone')).to.equal('danger');
    });
    expect(wrapper.text()).to.contain('削除する');
  });

  it('復元案内を無効にした削除では案内と説明参照を追加しない', () => {
    const wrapper = factory({ showDeleteRecoveryNote: false });
    const dialog = wrapper.findComponent(UiDialogStub);

    expect(wrapper.text()).not.to.contain('削除後も管理画面から復元できます。');
    expect(wrapper.find('.management-lifecycle-dialog__recoverable').exists()).to.equal(false);
    expect(dialog.attributes('aria-describedby').split(' ')).to.have.lengthOf(1);
  });

  it('復元ではprimaryの確定操作を使い、削除後の説明を表示しない', () => {
    const wrapper = factory({ action: 'restore' });
    const confirmButtons = wrapper.findAll('[data-testid="management-lifecycle-confirm"]');

    expect(wrapper.get('h2').text()).to.equal('復元の確認');
    expect(wrapper.text()).to.contain('ユーザー「テスト利用者」を復元します。');
    expect(wrapper.text()).not.to.contain('削除後も管理画面から復元できます。');
    confirmButtons.forEach((button) => {
      expect(button.attributes('data-tone')).to.equal('primary');
    });
    expect(wrapper.text()).to.contain('復元する');
  });

  it('確定、キャンセル、UiDialogからの閉鎖要求を個別に通知する', async () => {
    const wrapper = factory();

    await wrapper.find('[data-testid="management-lifecycle-confirm"]').trigger('click');
    await wrapper.find('[data-testid="management-lifecycle-cancel"]').trigger('click');
    wrapper.findComponent(UiDialogStub).vm.$emit('request-close', { reason: 'escape' });
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('confirm')).to.deep.equal([['delete']]);
    expect(wrapper.emitted('cancel')).to.deep.equal([[]]);
    expect(wrapper.emitted('request-close')).to.deep.equal([[{ reason: 'escape' }]]);
  });

  it('UiDialogのclosedイベントとデータをそのまま転送する', async () => {
    const wrapper = factory();
    const payload = { reason: 'programmatic' };

    wrapper.findComponent(UiDialogStub).vm.$emit('closed', payload);
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('closed')).to.deep.equal([[payload]]);
  });

  it('既定でPC操作を右へ隣接し、明示的に無効化できる', () => {
    const defaultWrapper = factory();
    const separatedWrapper = factory({ actionsAdjacent: false });
    const defaultDialog = defaultWrapper.findComponent(UiDialogStub);
    const separatedDialog = separatedWrapper.findComponent(UiDialogStub);

    expect(defaultWrapper.props('actionsAdjacent')).to.equal(true);
    expect(defaultDialog.classes()).to.include('management-lifecycle-dialog--actions-adjacent');
    expect(defaultWrapper.get('.management-lifecycle-dialog__actions').classes()).to.include(
      'management-lifecycle-dialog__actions--adjacent'
    );
    expect(separatedDialog.classes()).not.to.include('management-lifecycle-dialog--actions-adjacent');
    expect(separatedWrapper.get('.management-lifecycle-dialog__actions').classes()).not.to.include(
      'management-lifecycle-dialog__actions--adjacent'
    );
  });

  it('送信中は閉鎖と操作を抑止し、タイトルでラベル付けした進捗を表示する', async () => {
    const wrapper = factory({ sending: true });
    const dialog = wrapper.findComponent(UiDialogStub);

    expect(dialog.props()).to.include({ closeOnEscape: false, closeOnBackdrop: false });
    wrapper.findAll('button').forEach((button) => {
      expect(button.element.disabled).to.equal(true);
    });
    await wrapper.find('[data-testid="management-lifecycle-confirm"]').trigger('click');
    await wrapper.find('[data-testid="management-lifecycle-cancel"]').trigger('click');
    dialog.vm.$emit('request-close', { reason: 'escape' });
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('confirm')).to.equal(undefined);
    expect(wrapper.emitted('cancel')).to.equal(undefined);
    expect(wrapper.emitted('request-close')).to.equal(undefined);
    expect(wrapper.get('[role="progressbar"]').attributes('aria-labelledby')).to.equal(wrapper.get('h2').attributes('id'));
  });

  it('指定された注意事項を説明に含める', () => {
    const wrapper = factory({ warning: '関連データへ影響します。' });
    const describedBy = wrapper.findComponent(UiDialogStub).attributes('aria-describedby').split(' ');

    expect(wrapper.text()).to.contain('関連データへ影響します。');
    expect(describedBy).to.have.lengthOf(3);
    expect(describedBy.at(-1)).to.equal(wrapper.get('.management-lifecycle-dialog__warning').attributes('id'));
  });

  it('既定スロットがある場合だけ確認文と注意事項の間に対象の詳細を表示する', () => {
    const withDetails = factory(
      { warning: '削除すると添付メディアは復元できません。' },
      { default: '<dl data-testid="lifecycle-details"><dt>種別</dt><dd>投稿</dd></dl>' }
    );
    const content = withDetails.find('main').element;
    const message = withDetails.get('.management-lifecycle-dialog__message').element;
    const recoverable = withDetails.get('.management-lifecycle-dialog__recoverable').element;
    const details = withDetails.get('.management-lifecycle-dialog__details').element;
    const warning = withDetails.get('.management-lifecycle-dialog__warning').element;
    const describedBy = withDetails.findComponent(UiDialogStub).attributes('aria-describedby').split(' ');

    expect(withDetails.get('[data-testid="lifecycle-details"]').text()).to.contain('種別投稿');
    expect(Array.from(content.children).indexOf(message)).to.be.lessThan(Array.from(content.children).indexOf(recoverable));
    expect(Array.from(content.children).indexOf(recoverable)).to.be.lessThan(Array.from(content.children).indexOf(details));
    expect(Array.from(content.children).indexOf(details)).to.be.lessThan(Array.from(content.children).indexOf(warning));
    expect(describedBy).to.include(withDetails.get('.management-lifecycle-dialog__details').attributes('id'));

    const withoutDetails = factory();
    expect(withoutDetails.find('.management-lifecycle-dialog__details').exists()).to.equal(false);
  });
});
