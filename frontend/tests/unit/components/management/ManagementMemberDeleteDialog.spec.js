import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import ManagementMemberDeleteDialog from '@/components/management/ManagementMemberDeleteDialog.vue';

const UiDialogStub = {
  name: 'UiDialog',
  inheritAttrs: false,
  props: ['open', 'titleId', 'descriptionIds', 'initialFocus', 'closeOnEscape', 'closeOnBackdrop'],
  emits: ['request-close'],
  template:
    '<section v-bind="$attrs" role="dialog" :aria-labelledby="titleId" :aria-describedby="descriptionIds"><header><slot name="title" /></header><main><slot /></main><footer><slot name="actions" /></footer><slot name="status" /></section>',
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

const DialogTargetContextStub = {
  name: 'DialogTargetContext',
  props: ['contextId', 'label', 'name'],
  template: '<div :id="contextId" class="target-context"><span>{{ label }}</span><strong>{{ name }}</strong></div>',
};

const createWrapper = (props = {}) =>
  shallowMount(ManagementMemberDeleteDialog, {
    props: {
      open: true,
      sending: false,
      titleId: 'member-delete-title',
      title: 'フロアメンバー削除',
      resourceLabel: '対象フロア',
      resourceName: 'フロアA',
      userName: 'ユーザA',
      message: 'フロアメンバーから削除する',
      testIdPrefix: 'management-floor-member-delete',
      ...props,
    },
    stubs: {
      DialogTargetContext: DialogTargetContextStub,
      UiButton: UiButtonStub,
      UiDialog: UiDialogStub,
      UiIcon: UiIconStub,
      UiProgress: UiProgressStub,
    },
    mocks: {
      $t: (key) => key,
    },
  });

describe('管理画面のメンバー削除ダイアログ', () => {
  it('対象リソースと対象ユーザを独立した文脈として表示し、説明へ関連付ける', () => {
    const wrapper = createWrapper();
    const dialog = wrapper.findComponent(UiDialogStub);
    const contexts = wrapper.findAllComponents(DialogTargetContextStub);

    expect(wrapper.get('h2').text()).to.equal('フロアメンバー削除');
    expect(contexts).to.have.lengthOf(2);
    expect(contexts[0].props()).to.include({
      contextId: 'member-delete-title-resource-context',
      label: '対象フロア',
      name: 'フロアA',
    });
    expect(contexts[1].props()).to.include({
      contextId: 'member-delete-title-user-context',
      label: '対象ユーザ',
      name: 'ユーザA',
    });
    expect(wrapper.get('.management-member-delete-dialog__message').text()).to.equal(
      'フロアメンバーから削除する'
    );
    expect(dialog.props('descriptionIds')).to.equal(
      'member-delete-title-resource-context member-delete-title-user-context member-delete-title-description'
    );
  });

  it('PC操作を右下へ隣接し、スマートフォン操作をヘッダの左右へ配置する', () => {
    const wrapper = createWrapper();
    const dialog = wrapper.findComponent(UiDialogStub);
    const actions = wrapper.get('.management-member-delete-dialog__actions');
    const desktopCancel = wrapper.get('[data-testid="management-floor-member-delete-cancel-desktop"]');
    const desktopConfirm = wrapper.get('[data-testid="management-floor-member-delete-confirm"]');
    const mobileCancel = wrapper.get('[data-testid="management-floor-member-delete-cancel-mobile"]');
    const mobileConfirm = wrapper.get('[data-testid="management-floor-member-delete-confirm-mobile"]');

    expect(dialog.props('initialFocus')).to.equal('.management-dialog-cancel-button');
    expect(actions.element.children).to.have.lengthOf(2);
    expect(actions.element.children[0]).to.equal(desktopCancel.element);
    expect(actions.element.children[1]).to.equal(desktopConfirm.element);
    expect(desktopCancel.classes()).to.include('management-dialog-cancel-button');
    expect(desktopConfirm.attributes('data-tone')).to.equal('danger');
    expect(mobileCancel.classes()).to.include('ui-dialog__header-start');
    expect(mobileCancel.get('[data-icon="close"]').exists()).to.equal(true);
    expect(mobileConfirm.classes()).to.include('ui-dialog__header-end');
    expect(mobileConfirm.attributes('data-tone')).to.equal('danger');
    expect(mobileConfirm.get('[data-icon="delete"]').exists()).to.equal(true);
  });

  it('PCとスマートフォンの操作およびダイアログ閉鎖要求を同じイベントへ集約する', async () => {
    const wrapper = createWrapper();

    await wrapper.get('[data-testid="management-floor-member-delete-cancel-desktop"]').trigger('click');
    await wrapper.get('[data-testid="management-floor-member-delete-cancel-mobile"]').trigger('click');
    await wrapper.get('[data-testid="management-floor-member-delete-confirm"]').trigger('click');
    await wrapper.get('[data-testid="management-floor-member-delete-confirm-mobile"]').trigger('click');
    wrapper.findComponent(UiDialogStub).vm.$emit('request-close', { reason: 'escape' });
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('cancel')).to.deep.equal([[], []]);
    expect(wrapper.emitted('confirm')).to.deep.equal([[], []]);
    expect(wrapper.emitted('request-close')).to.deep.equal([[{ reason: 'escape' }]]);
  });

  it('送信中は全操作と閉鎖を抑止し、タイトルで名前付けした進捗を表示する', async () => {
    const wrapper = createWrapper({ sending: true });
    const dialog = wrapper.findComponent(UiDialogStub);

    expect(dialog.props()).to.include({ closeOnEscape: false, closeOnBackdrop: false });
    wrapper.findAll('button').forEach((button) => {
      expect(button.element.disabled).to.equal(true);
    });

    await wrapper.get('[data-testid="management-floor-member-delete-cancel-desktop"]').trigger('click');
    await wrapper.get('[data-testid="management-floor-member-delete-confirm"]').trigger('click');
    dialog.vm.$emit('request-close', { reason: 'backdrop' });
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('cancel')).to.equal(undefined);
    expect(wrapper.emitted('confirm')).to.equal(undefined);
    expect(wrapper.emitted('request-close')).to.equal(undefined);
    expect(wrapper.get('[role="progressbar"]').attributes('aria-labelledby')).to.equal('member-delete-title');
    expect(wrapper.get('[role="progressbar"]').isVisible()).to.equal(true);
  });
});
