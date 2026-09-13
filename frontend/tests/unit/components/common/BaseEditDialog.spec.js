import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import BaseEditDialog from '@/components/common/BaseEditDialog.vue';

const UiDialogStub = {
  name: 'UiDialog',
  inheritAttrs: false,
  props: [
    'open',
    'titleId',
    'descriptionIds',
    'closeOnEscape',
    'closeOnBackdrop',
    'initialFocus',
  ],
  template:
    '<section v-bind="$attrs"><header><slot name="title" /></header><main><slot /></main><footer><slot name="actions" /></footer><aside><slot name="status" /></aside></section>',
};
const UiButtonStub = {
  name: 'UiButton',
  inheritAttrs: false,
  props: {
    appearance: String,
    tone: String,
    iconOnly: Boolean,
  },
  template: '<button v-bind="$attrs"><slot /></button>',
};
const UiIconStub = {
  name: 'UiIcon',
  props: ['name'],
  template: '<i :data-name="name" />',
};
const UiProgressStub = {
  name: 'UiProgress',
  inheritAttrs: false,
  props: ['mode', 'value'],
  template: '<div class="progress" v-bind="$attrs" />',
};

const createWrapper = (props = {}) =>
  shallowMount(BaseEditDialog, {
    stubs: {
      UiButton: UiButtonStub,
      UiDialog: UiDialogStub,
      UiIcon: UiIconStub,
      UiProgress: UiProgressStub,
    },
    props: {
      visible: true,
      sending: false,
      titleId: 'title-id',
      titleText: 'Title',
      descriptionIds: 'description-id',
      cancelLabel: 'Cancel',
      confirmLabel: 'Confirm',
      progressAmount: 25,
      initialFocus: '#name',
      ...props,
    },
    slots: {
      default: '<label for="name">Name</label><input id="name" />',
    },
  });

describe('共通編集ダイアログ（BaseEditDialog）', () => {
  it('未使用のrestoreFocus propを公開しない', () => {
    expect(BaseEditDialog.props).not.to.have.property('restoreFocus');
  });

  it('visible の変更をopenへ同期し、localVisible変更をupdate:visibleで通知する', async () => {
    const wrapper = createWrapper({ visible: false });
    const dialog = wrapper.findComponent(UiDialogStub);
    expect(dialog.props('open')).to.equal(false);

    await wrapper.setProps({ visible: true });
    expect(dialog.props('open')).to.equal(true);

    await wrapper.setData({ localVisible: false });
    const emitted = wrapper.emitted()['update:visible'];
    expect(emitted[emitted.length - 1]).to.deep.equal([false]);
  });

  it('タイトル・内容・操作・進捗を共通UIのスロットへ渡す', () => {
    const wrapper = createWrapper();
    const progress = wrapper.findComponent(UiProgressStub);
    const buttons = wrapper.findAllComponents(UiButtonStub);

    expect(wrapper.find('h2#title-id').text()).to.equal('Title');
    expect(wrapper.find('main input#name').exists()).to.equal(true);
    expect(buttons.at(0).props()).to.include({ appearance: 'filled', tone: 'neutral', iconOnly: true });
    expect(buttons.at(1).props()).to.include({ appearance: 'filled', tone: 'primary', iconOnly: true });
    expect(progress.props()).to.include({ mode: 'determinate', value: 25 });
    expect(progress.attributes('aria-labelledby')).to.equal('title-id');
    expect(wrapper.findComponent(UiDialogStub).props('descriptionIds')).to.equal('description-id');
    expect(wrapper.findComponent(UiDialogStub).props('initialFocus')).to.equal('#name');
    expect(wrapper.findComponent(UiDialogStub).attributes('aria-busy')).to.equal('false');
  });

  it('progressModeを共通進捗へ渡す', () => {
    const wrapper = createWrapper({ progressMode: 'indeterminate' });
    const progress = wrapper.findComponent(UiProgressStub);

    expect(progress.props('mode')).to.equal('indeterminate');
    expect(progress.props('value')).to.equal(undefined);
  });

  it('指定時だけPCの操作ボタンを右下に並べるクラスを付ける', () => {
    const adjacent = createWrapper({ actionsAdjacent: true });
    const legacy = createWrapper();

    expect(adjacent.findComponent(UiDialogStub).classes()).to.include(
      'base-edit-dialog--actions-adjacent'
    );
    expect(adjacent.get('.common-dialog-actions').classes()).to.include(
      'common-dialog-actions--adjacent'
    );
    expect(legacy.findComponent(UiDialogStub).classes()).not.to.include(
      'base-edit-dialog--actions-adjacent'
    );
    expect(legacy.get('.common-dialog-actions').classes()).not.to.include(
      'common-dialog-actions--adjacent'
    );
  });

  it('sending=false の時はcancelとconfirmを通知する', () => {
    const wrapper = createWrapper();
    wrapper.vm.onCancel();
    wrapper.vm.onConfirm();

    expect(wrapper.emitted().cancel).to.have.lengthOf(1);
    expect(wrapper.emitted().confirm).to.have.lengthOf(1);
  });

  it('sending=true の時はcancelとconfirmを通知しない', () => {
    const wrapper = createWrapper({ sending: true });
    wrapper.vm.onCancel();
    wrapper.vm.onConfirm();

    expect(wrapper.emitted().cancel).to.equal(undefined);
    expect(wrapper.emitted().confirm).to.equal(undefined);
  });

  it('confirmDisabled=true の時はconfirmだけを無効にする', () => {
    const wrapper = createWrapper({ confirmDisabled: true });

    wrapper.vm.onCancel();
    wrapper.vm.onConfirm();

    expect(wrapper.emitted().cancel).to.have.lengthOf(1);
    expect(wrapper.emitted().confirm).to.equal(undefined);
    wrapper
      .findAll('[data-testid="base-edit-dialog-confirm"]')
      .forEach((button) => expect(button.attributes('disabled')).to.not.equal(undefined));
  });

  it('操作ボタンのテスト用IDを利用側から指定できる', () => {
    const wrapper = createWrapper({
      cancelTestId: 'custom-cancel',
      confirmTestId: 'custom-confirm',
    });

    expect(wrapper.findAll('[data-testid="custom-cancel"]')).to.have.length(2);
    expect(wrapper.findAll('[data-testid="custom-confirm"]')).to.have.length(2);
  });

  it('スマートフォン専用テスト用IDを指定した場合もPC操作のテスト用IDを維持する', () => {
    const wrapper = createWrapper({
      cancelTestId: 'cancel-desktop',
      mobileCancelTestId: 'cancel-mobile',
      confirmTestId: 'confirm-desktop',
      mobileConfirmTestId: 'confirm-mobile',
    });

    expect(wrapper.get('[data-testid="cancel-mobile"]').classes()).to.include('mobile-item');
    expect(wrapper.get('[data-testid="cancel-desktop"]').classes()).to.include('desktop-item');
    expect(wrapper.get('[data-testid="confirm-mobile"]').classes()).to.include('mobile-item');
    expect(wrapper.get('[data-testid="confirm-desktop"]').classes()).to.include('desktop-item');
  });

  it('request-closeをcancelへ接続し、openedとclosedを再通知する', () => {
    const wrapper = createWrapper();
    const dialog = wrapper.findComponent(UiDialogStub);
    const closedPayload = { focusRestored: true };

    dialog.vm.$emit('request-close', { reason: 'escape' });
    dialog.vm.$emit('opened');
    dialog.vm.$emit('closed', closedPayload);

    expect(wrapper.emitted().cancel).to.have.lengthOf(1);
    expect(wrapper.emitted().opened).to.have.lengthOf(1);
    expect(wrapper.emitted().closed[0]).to.deep.equal([closedPayload]);
  });

  it('送信中はEscapeキーや背景操作で閉じられない', async () => {
    const wrapper = createWrapper();
    const dialog = wrapper.findComponent(UiDialogStub);
    expect(dialog.props('closeOnEscape')).to.equal(true);
    expect(dialog.props('closeOnBackdrop')).to.equal(true);

    await wrapper.setProps({ sending: true });
    expect(dialog.props('closeOnEscape')).to.equal(false);
    expect(dialog.props('closeOnBackdrop')).to.equal(false);
    expect(dialog.attributes('aria-busy')).to.equal('true');
  });
});
