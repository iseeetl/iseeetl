import { expect } from 'vitest';
import { shallowMount } from '../../../helpers/testUtils';
import SoundCautionConfirm from '@/components/timeline/dialogs/SoundCautionConfirm.vue';

const ConfirmDialogStub = {
  name: 'ConfirmDialog',
  props: [
    'dialogVisible',
    'titleId',
    'confirmTone',
    'confirmIcon',
    'closeOnConfirm',
    'closeOnEscape',
    'closeOnBackdrop',
    'actionsAdjacent',
  ],
  template: '<div><slot/></div>',
};

const createWrapper = () =>
  shallowMount(SoundCautionConfirm, {
    stubs: {
      ConfirmDialog: ConfirmDialogStub,
      UiIcon: true,
    },
    props: { confirmVisible: true },
    mocks: { $t: (key) => key },
  });

describe('音声再生前の注意確認', () => {
  it('閉鎖できない共通確認ダイアログへ確認操作を渡す', () => {
    const wrapper = createWrapper();
    const dialog = wrapper.findComponent(ConfirmDialogStub);

    expect(dialog.props()).to.include({
      dialogVisible: true,
      titleId: 'sound_caution_confirm_title',
      confirmTone: 'primary',
      confirmIcon: 'done',
      closeOnConfirm: false,
      closeOnEscape: false,
      closeOnBackdrop: false,
      actionsAdjacent: true,
    });
  });

  it('確認を同期通知してダイアログを閉じる', () => {
    const wrapper = createWrapper();

    wrapper.vm.onPressDoneButton();

    expect(wrapper.emitted().confirm).to.have.lengthOf(1);
    expect(wrapper.vm.visible).to.equal(false);
    expect(wrapper.find('audio').exists()).to.equal(false);
  });

  it('閉鎖完了データを通知する', () => {
    const wrapper = createWrapper();
    const payload = { focusRestored: true };

    wrapper.vm.closedDialog(payload);

    expect(wrapper.emitted().close).to.deep.equal([[payload]]);
  });
});
