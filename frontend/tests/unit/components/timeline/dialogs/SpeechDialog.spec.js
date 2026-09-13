import { expect } from 'vitest';
import { shallowMount } from '../../../helpers/testUtils';
import SpeechDialog from '@/components/timeline/dialogs/SpeechDialog.vue';

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

const baseStubs = {
  ConfirmDialog: ConfirmDialogStub,
  UiIcon: true,
};

const createWrapper = (overrides = {}) =>
  shallowMount(SpeechDialog, {
    stubs: baseStubs,
    props: {
      dialogVisible: true,
      ...(overrides.props || {}),
    },
    mocks: {
      $store: {
        getters: { lang: 'ja', speechSpeed: 1.2 },
        dispatch: () => {},
      },
      $i18n: { locale: 'fr' },
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });

describe('読み上げの開始確認', () => {
  it('共通確認ダイアログへ開始操作を渡す', () => {
    const wrapper = createWrapper();
    const dialog = wrapper.findComponent(ConfirmDialogStub);

    expect(dialog.props()).to.include({
      dialogVisible: true,
      titleId: 'speech_dialog_title',
      confirmTone: 'primary',
      confirmIcon: 'play_arrow',
      closeOnConfirm: false,
      closeOnEscape: true,
      closeOnBackdrop: true,
      actionsAdjacent: true,
    });
  });

  it('キャンセル操作でダイアログを閉じる', () => {
    const wrapper = createWrapper();

    wrapper.vm.onPressCancelButton();

    expect(wrapper.vm.visible).to.equal(false);
    expect(wrapper.emitted().success).to.equal(undefined);
  });

  it('開始操作で読み上げとsuccess通知を行う', () => {
    const originalUttr = global.SpeechSynthesisUtterance;
    const originalSpeech = window.speechSynthesis;
    const speakCalls = [];

    global.SpeechSynthesisUtterance = function SpeechSynthesisUtterance() {
      this.text = '';
      this.lang = '';
      this.rate = 1;
    };
    window.speechSynthesis = {
      speak: (payload) => {
        speakCalls.push(payload);
      },
    };

    try {
      const wrapper = createWrapper();
      wrapper.vm.onPressDoneButton();

      expect(speakCalls).to.have.lengthOf(1);
      expect(speakCalls[0].lang).to.equal('fr');
      expect(wrapper.emitted().success).to.have.lengthOf(1);
      expect(wrapper.vm.visible).to.equal(false);
    } finally {
      global.SpeechSynthesisUtterance = originalUttr;
      window.speechSynthesis = originalSpeech;
    }
  });
});
