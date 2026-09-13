import { expect } from 'vitest';
import { shallowMount } from '../../../helpers/testUtils';
import TimelineSettingDialog from '@/components/timeline/dialogs/TimelineSettingDialog.vue';

const BaseEditDialogStub = {
  name: 'BaseEditDialog',
  props: ['visible', 'sending', 'titleText', 'cancelLabel', 'confirmLabel', 'actionsAdjacent', 'initialFocus'],
  template: '<div><slot/></div>',
};

const baseStubs = {
  BaseEditDialog: BaseEditDialogStub,
  ConfirmDialog: true,
};

const createWrapper = (overrides = {}) =>
  shallowMount(TimelineSettingDialog, {
    stubs: baseStubs,
    props: {
      dialogVisible: true,
      ...(overrides.props || {}),
    },
    mocks: {
      $store: overrides.store || {
        getters: {
          speechSpeed: 1,
          displayName: true,
          displayDate: true,
          displayTag: true,
          displaySupplement: true,
          displayActionButton: true,
          enableTextAnimation: true,
          animationSpeed: 'fast',
          displayUserKickButton: true,
          userRole: 'User',
          roomRole: 'User',
        },
        dispatch: () => {},
      },
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });

describe('タイムラインの表示設定', () => {
  it('共通編集ダイアログへ保存操作と送信状態を渡す', async () => {
    const wrapper = createWrapper();
    await wrapper.setData({ sending: true });
    const dialog = wrapper.findComponent(BaseEditDialogStub);

    expect(dialog.props()).to.include({
      visible: true,
      sending: true,
      titleText: 'タイムライン設定',
      cancelLabel: 'キャンセル',
      confirmLabel: '決定',
      actionsAdjacent: true,
      initialFocus: '#speech_speed',
    });
  });

  it('dialogVisible の変更で visible が同期される', async () => {
    const wrapper = createWrapper({ props: { dialogVisible: false } });

    expect(wrapper.vm.visible).to.equal(false);
    await wrapper.setProps({ dialogVisible: true });
    expect(wrapper.vm.visible).to.equal(true);
  });

  it('ダイアログを開くとストアの値を反映する', () => {
    const wrapper = createWrapper();

    wrapper.vm.openedDialog();

    expect(wrapper.vm.speechSpeed).to.equal(1);
    expect(wrapper.vm.displayName).to.equal(true);
    expect(wrapper.vm.displayDate).to.equal(true);
    expect(wrapper.vm.displayTag).to.equal(true);
    expect(wrapper.vm.displaySupplement).to.equal(true);
    expect(wrapper.vm.displayActionButton).to.equal(true);
    expect(wrapper.vm.enableTextAnimation).to.equal(true);
    expect(wrapper.vm.animationSpeed).to.equal('fast');
    expect(wrapper.vm.displayUserKickButton).to.equal(true);
    expect(wrapper.find('#display_ai_supplement').exists()).to.equal(false);
  });

  it('読み上げ速度はrange操作時に数値として保持する', async () => {
    const wrapper = createWrapper();

    await wrapper.get('#speech_speed').setValue('1.8');

    expect(wrapper.vm.speechSpeed).to.equal(1.8);
    expect(typeof wrapper.vm.speechSpeed).to.equal('number');
  });

  it('保存完了後に確定済みの設定をsuccessイベントで通知して閉じる', async () => {
    const dispatchCalls = [];
    const getters = {
      speechSpeed: 1,
      displayName: true,
      displayDate: true,
      displayTag: true,
      displaySupplement: true,
      displayActionButton: true,
      enableTextAnimation: true,
      animationSpeed: 'normal',
      displayUserKickButton: true,
      userRole: 'User',
      roomRole: 'User',
    };
    const committedSnapshot = {
      speechSpeed: 1.8,
      displayName: true,
      displayDate: false,
      displayTag: true,
      displaySupplement: false,
      displayActionButton: true,
      enableTextAnimation: false,
      animationSpeed: 'very_fast',
      displayUserKickButton: false,
    };
    let resolveDispatch;
    const wrapper = createWrapper({
      store: {
        getters,
        dispatch: (...args) => {
          dispatchCalls.push(args);
          return new Promise((resolve) => {
            resolveDispatch = () => {
              Object.assign(getters, committedSnapshot);
              resolve();
            };
          });
        },
      },
    });

    await wrapper.setData({
      speechSpeed: 1.5,
      displayName: false,
      displayDate: false,
      displayTag: false,
      displaySupplement: false,
      displayActionButton: false,
      enableTextAnimation: false,
      animationSpeed: 'slow',
      displayUserKickButton: false,
      visible: true,
    });

    const savePromise = wrapper.vm.onPressDoneButton();

    expect(dispatchCalls[0][0]).to.equal('doUpdateTimeLineSetting');
    expect(dispatchCalls[0][1]).to.deep.equal({
      speechSpeed: 1.5,
      displayName: false,
      displayDate: false,
      displayTag: false,
      displaySupplement: false,
      displayActionButton: false,
      enableTextAnimation: false,
      animationSpeed: 'slow',
      displayUserKickButton: false,
    });
    expect(wrapper.emitted().success).to.equal(undefined);
    expect(wrapper.vm.visible).to.equal(true);
    expect(wrapper.vm.sending).to.equal(true);

    const duplicateSavePromise = wrapper.vm.onPressDoneButton();
    await duplicateSavePromise;
    expect(dispatchCalls).to.have.lengthOf(1);

    resolveDispatch();
    await savePromise;

    expect(wrapper.emitted().success).to.deep.equal([[committedSnapshot]]);
    expect(wrapper.vm.visible).to.equal(false);
    expect(wrapper.vm.sending).to.equal(false);
    wrapper.unmount();
  });

  it('保存に失敗した場合はsuccessイベントを通知せず、閉じない', async () => {
    const dispatchError = new Error('setting update failed');
    const wrapper = createWrapper({
      store: {
        getters: {
          speechSpeed: 1,
          displayName: true,
          displayDate: true,
          displayTag: true,
          displaySupplement: true,
          displayActionButton: true,
          enableTextAnimation: true,
          animationSpeed: 'normal',
          displayUserKickButton: true,
          userRole: 'User',
          roomRole: 'User',
        },
        dispatch: () => Promise.reject(dispatchError),
      },
    });
    await wrapper.setData({ visible: true });

    let caughtError;
    try {
      await wrapper.vm.onPressDoneButton();
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).to.equal(dispatchError);
    expect(wrapper.emitted().success).to.equal(undefined);
    expect(wrapper.vm.visible).to.equal(true);
    expect(wrapper.vm.sending).to.equal(false);
    wrapper.unmount();
  });

  it('キャンセル操作でダイアログを閉じる', () => {
    const wrapper = createWrapper();
    wrapper.setData({ visible: true });

    wrapper.vm.onPressCancelButton();

    expect(wrapper.vm.visible).to.equal(false);
    expect(wrapper.emitted().success).to.equal(undefined);
    wrapper.unmount();
  });

  it('編集後のキャンセルでは破棄確認を経て閉じる', () => {
    const wrapper = createWrapper();
    wrapper.vm.openedDialog();
    wrapper.vm.displayDate = false;

    wrapper.vm.onPressCancelButton();
    expect(wrapper.vm.discardConfirmVisible).to.equal(true);
    expect(wrapper.vm.visible).to.equal(true);

    wrapper.vm.confirmDiscard();
    wrapper.vm.closedDiscardConfirm();
    expect(wrapper.vm.visible).to.equal(false);
  });

  it('closedDialog は値を初期化して close を通知する', () => {
    const wrapper = createWrapper();
    wrapper.setData({
      speechSpeed: 1.3,
      displayName: true,
      displayDate: true,
      displayTag: true,
      displaySupplement: true,
      displayActionButton: true,
      enableTextAnimation: true,
      animationSpeed: 'fast',
      displayUserKickButton: false,
    });

    wrapper.vm.closedDialog();

    expect(wrapper.vm.speechSpeed).to.equal(null);
    expect(wrapper.vm.displayName).to.equal(null);
    expect(wrapper.vm.displayDate).to.equal(null);
    expect(wrapper.vm.displayTag).to.equal(null);
    expect(wrapper.vm.displaySupplement).to.equal(null);
    expect(wrapper.vm.displayActionButton).to.equal(null);
    expect(wrapper.vm.enableTextAnimation).to.equal(null);
    expect(wrapper.vm.animationSpeed).to.equal('normal');
    expect(wrapper.vm.displayUserKickButton).to.equal(true);
    expect(wrapper.emitted().close).to.have.lengthOf(1);
  });

  it('管理者またはフロア作成者ならユーザキック設定を表示する', () => {
    const adminWrapper = createWrapper({
      store: {
        getters: {
          speechSpeed: 1,
          displayName: true,
          displayDate: true,
          displayTag: true,
          displaySupplement: true,
          displayActionButton: true,
          enableTextAnimation: true,
          animationSpeed: 'normal',
          displayUserKickButton: true,
          userRole: 'Administrator',
          roomRole: 'User',
        },
        dispatch: () => {},
      },
    });
    expect(adminWrapper.find('#display_user_kick_button').exists()).to.equal(true);

    const editorWrapper = createWrapper({
      store: {
        getters: {
          speechSpeed: 1,
          displayName: true,
          displayDate: true,
          displayTag: true,
          displaySupplement: true,
          displayActionButton: true,
          enableTextAnimation: true,
          animationSpeed: 'normal',
          displayUserKickButton: true,
          userRole: 'User',
          roomRole: 'FloorEditor',
        },
        dispatch: () => {},
      },
    });
    expect(editorWrapper.find('#display_user_kick_button').exists()).to.equal(true);
  });

  it('一般権限ではユーザキック設定を表示しない', () => {
    const wrapper = createWrapper({
      store: {
        getters: {
          speechSpeed: 1,
          displayName: true,
          displayDate: true,
          displayTag: true,
          displaySupplement: true,
          displayActionButton: true,
          enableTextAnimation: true,
          animationSpeed: 'normal',
          displayUserKickButton: true,
          userRole: 'User',
          roomRole: 'User',
        },
        dispatch: () => {},
      },
    });

    expect(wrapper.find('#display_user_kick_button').exists()).to.equal(false);
  });
});
