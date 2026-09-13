import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import HelpDialog from '@/components/help/HelpDialog.vue';

const UiDialogStub = {
  name: 'UiDialog',
  inheritAttrs: false,
  props: ['open', 'titleId', 'descriptionIds', 'initialFocus'],
  template:
    '<section><header><slot name="title" /></header><main><slot /></main><footer><slot name="actions" /></footer></section>',
};

const UiButtonStub = {
  name: 'UiButton',
  inheritAttrs: false,
  props: ['appearance', 'tone', 'iconOnly'],
  template: '<button v-bind="$attrs"><slot /></button>',
};

const baseStubs = {
  HelpContent: true,
  UiButton: UiButtonStub,
  UiDialog: UiDialogStub,
  UiIcon: { name: 'UiIcon', props: ['name'], template: '<i :data-name="name" />' },
};

const createWrapper = (overrides = {}) =>
  shallowMount(HelpDialog, {
    stubs: baseStubs,
    props: { dialogVisible: false, ...(overrides.props || {}) },
    mocks: {
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });

describe('ヘルプダイアログ', () => {
  it('dialogVisibleの変更をUiDialogのopenへ反映する', async () => {
    const wrapper = createWrapper();
    const dialog = wrapper.findComponent(UiDialogStub);

    expect(dialog.props('open')).to.equal(false);
    await wrapper.setProps({ dialogVisible: true });

    expect(wrapper.vm.visible).to.equal(true);
    expect(dialog.props('open')).to.equal(true);
  });

  it('タイトル・説明・閉じるボタンへの初期フォーカスをUiDialogへ渡す', () => {
    const wrapper = createWrapper();
    const dialog = wrapper.findComponent(UiDialogStub);

    expect(dialog.props()).to.include({
      titleId: 'help_dialog_title',
      descriptionIds: 'help_dialog_description',
      initialFocus: '.help-dialog__primary-close-button',
    });
    expect(wrapper.get('[data-testid="dialog-help-close-desktop"]').classes()).to.include(
      'help-dialog__primary-close-button'
    );
    expect(wrapper.get('[data-testid="dialog-help-close-desktop"]').classes()).to.include('desktop-item');
    expect(
      wrapper.findComponent('[data-testid="dialog-help-close-desktop"]').props('tone')
    ).to.equal('neutral');
    expect(wrapper.find('h2#help_dialog_title').exists()).to.equal(true);
    expect(wrapper.find('#help_dialog_description').exists()).to.equal(true);
  });

  it('request-closeで表示状態をfalseにする', () => {
    const wrapper = createWrapper({ props: { dialogVisible: true } });
    const dialog = wrapper.findComponent(UiDialogStub);

    dialog.vm.$emit('request-close', { reason: 'backdrop' });

    expect(wrapper.vm.visible).to.equal(false);
  });

  it('ダイアログが閉じたらUiDialogのデータをcloseへ渡す', () => {
    const wrapper = createWrapper();
    const payload = { focusRestored: true };

    wrapper.vm.closedDialog(payload);

    expect(wrapper.emitted().close[0]).to.deep.equal([payload]);
  });
});
