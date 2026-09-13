import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import UpdateFloorDisplayConfirm from '@/components/floor/UpdateFloorDisplayConfirm.vue';

const UiDialogStub = {
  name: 'UiDialog',
  props: {
    open: Boolean,
    titleId: String,
    descriptionIds: String,
    initialFocus: String,
    closeOnEscape: Boolean,
    closeOnBackdrop: Boolean,
  },
  template: '<div><slot name="title" /><slot /><slot name="actions" /><slot name="status" /></div>',
};

const UiButtonStub = {
  name: 'UiButton',
  inheritAttrs: false,
  props: { disabled: Boolean, tone: String },
  template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>',
};

const UiIconStub = {
  name: 'UiIcon',
  props: { name: String, size: Number },
  template: '<i :data-icon="name" />',
};

const UiProgressStub = {
  name: 'UiProgress',
  props: { mode: String },
  template: '<div data-testid="progress" />',
};

const baseStubs = {
  UiDialog: UiDialogStub,
  UiButton: UiButtonStub,
  UiIcon: UiIconStub,
  UiProgress: UiProgressStub,
};

const createWrapper = (overrides = {}) =>
  shallowMount(UpdateFloorDisplayConfirm, {
    stubs: baseStubs,
    props: {
      confirmVisible: true,
      floorDisplayHidden: false,
      ...(overrides.props || {}),
    },
    mocks: {
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });

describe('フロアの表示・非表示の確認', () => {
  it('非表示を解除する操作を公開ではなく表示と案内する', () => {
    const wrapper = createWrapper({ props: { floorDisplayHidden: false } });
    const dialog = wrapper.findComponent(UiDialogStub);

    expect(wrapper.text()).to.include('全フロア表示');
    expect(wrapper.text()).to.include('作成したフロアの全てを表示します');
    expect(wrapper.text()).to.include('表示する');
    expect(wrapper.text()).not.to.include('公開');
    expect(wrapper.findAll('[data-icon="visibility"]')).to.have.lengthOf(2);
    expect(dialog.props('initialFocus')).to.equal('.update-floor-display-cancel');
  });

  it('非表示操作を文言とアイコンで明示する', () => {
    const wrapper = createWrapper({ props: { floorDisplayHidden: true } });

    expect(wrapper.text()).to.include('非表示にする');
    expect(wrapper.findAll('[data-icon="visibility_off"]')).to.have.lengthOf(2);
  });

  it('現在の状態でdoneを通知する', () => {
    const wrapper = createWrapper({ props: { floorDisplayHidden: true } });
    wrapper.vm.onPressDoneButton();

    expect(wrapper.emitted().done[0][0]).to.equal(true);
  });

  it('キャンセルでvisibleをfalseにする', async () => {
    const wrapper = createWrapper();
    wrapper.setData({ visible: true });
    await wrapper.vm.$nextTick();

    wrapper.vm.onPressCancelButton();
    expect(wrapper.vm.visible).to.equal(false);
  });

  it('送信中は閉じる操作と再送信を禁止し、進行状況を表示する', () => {
    const wrapper = createWrapper({ props: { sending: true, floorDisplayHidden: true } });
    const dialog = wrapper.findComponent(UiDialogStub);

    wrapper.vm.onPressDoneButton();
    wrapper.vm.onPressCancelButton();
    wrapper.vm.closedConfirm();

    expect(wrapper.emitted().done).to.equal(undefined);
    expect(wrapper.emitted().close).to.equal(undefined);
    expect(wrapper.vm.visible).to.equal(true);
    expect(dialog.props('closeOnEscape')).to.equal(false);
    expect(dialog.props('closeOnBackdrop')).to.equal(false);
    expect(wrapper.findComponent(UiProgressStub).props('mode')).to.equal('indeterminate');
    expect(wrapper.findAllComponents(UiButtonStub).every((button) => button.props('disabled'))).to.equal(
      true
    );
  });

  it('confirmVisibleの変更でvisibleが同期される', async () => {
    const wrapper = createWrapper({ props: { confirmVisible: false } });
    expect(wrapper.vm.visible).to.equal(false);
    await wrapper.setProps({ confirmVisible: true });
    expect(wrapper.vm.visible).to.equal(true);
  });

  it('closedConfirmでcloseを通知する', () => {
    const wrapper = createWrapper();
    wrapper.vm.closedConfirm();

    expect(wrapper.emitted().close).to.have.lengthOf(1);
  });
});
