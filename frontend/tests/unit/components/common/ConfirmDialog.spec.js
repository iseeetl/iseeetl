import { expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { shallowMount } from '../../helpers/testUtils';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';

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
    '<section v-bind="$attrs" role="dialog" :aria-labelledby="titleId" :aria-describedby="descriptionIds"><header><slot name="title" /></header><main><slot /></main><footer><slot name="actions" /></footer><aside><slot name="status" /></aside></section>',
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

const factory = (props = {}, slots = undefined, attrs = undefined) =>
  shallowMount(ConfirmDialog, {
    stubs: {
      UiButton: UiButtonStub,
      UiDialog: UiDialogStub,
      UiIcon: UiIconStub,
      UiProgress: UiProgressStub,
    },
    props: {
      dialogVisible: true,
      title: 'Title',
      message: 'Message',
      confirmLabel: 'OK',
      cancelLabel: 'Cancel',
      sending: false,
      ...props,
    },
    ...(attrs ? { attrs } : {}),
    ...(slots ? { slots } : {}),
  });

const findAllById = (wrapper, id) =>
  wrapper.findAll('[id]').filter((element) => element.attributes('id') === id);

describe('確認ダイアログ（ConfirmDialog）', () => {
  it('dialogVisibleをUiDialogのopenへ同期する', async () => {
    const wrapper = factory({ dialogVisible: false });
    const dialog = wrapper.findComponent(UiDialogStub);
    expect(wrapper.vm.visible).to.equal(false);
    expect(dialog.props('open')).to.equal(false);

    await wrapper.setProps({ dialogVisible: true });
    expect(wrapper.vm.visible).to.equal(true);
    expect(dialog.props('open')).to.equal(true);
  });

  it('個別のタイトルと説明を関連付け、利用者操作による閉鎖を無効にする', () => {
    const wrapper = factory();
    const dialog = wrapper.findComponent(UiDialogStub);
    const titleId = dialog.props('titleId');
    const descriptionId = dialog.props('descriptionIds');

    expect(dialog.props()).to.include({
      closeOnEscape: false,
      closeOnBackdrop: false,
    });
    expect(titleId.startsWith('confirm-dialog-')).to.equal(true);
    expect(titleId.endsWith('-title')).to.equal(true);
    expect(descriptionId.startsWith('confirm-dialog-')).to.equal(true);
    expect(descriptionId.endsWith('-description')).to.equal(true);
    expect(dialog.attributes('aria-labelledby')).to.equal(titleId);
    expect(dialog.attributes('aria-describedby')).to.equal(descriptionId);
    expect(findAllById(wrapper, titleId)).to.have.length(1);
    expect(findAllById(wrapper, titleId)[0].text()).to.equal('Title');
    expect(findAllById(wrapper, descriptionId)).to.have.length(1);
    expect(findAllById(wrapper, descriptionId)[0].text()).to.equal('Message');
    expect(dialog.attributes('data-testid')).to.equal('confirm-dialog');
  });

  it('指定されたダイアログのセレクタをUiDialogのルート要素へ引き継ぐ', () => {
    const wrapper = factory({}, undefined, { 'data-testid': 'dialog-delete-post' });

    expect(wrapper.findComponent(UiDialogStub).attributes('data-testid')).to.equal('dialog-delete-post');
  });

  it('スマートフォン専用テスト用IDを指定した場合もPC操作のテスト用IDを維持する', () => {
    const wrapper = factory({
      cancelLabel: 'キャンセル',
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

  it('2つのダイアログのARIA IDを一意にし、それぞれ自身の要素を参照する', () => {
    const host = mount(
      {
        components: { ConfirmDialog },
        template: `
          <div>
            <ConfirmDialog :dialog-visible="true" title="First" message="First message" />
            <ConfirmDialog :dialog-visible="true" title="Second" message="Second message" />
          </div>
        `,
      },
      {
        global: {
          stubs: {
            UiButton: UiButtonStub,
            UiDialog: UiDialogStub,
            UiIcon: UiIconStub,
            UiProgress: UiProgressStub,
          },
        },
      }
    );
    const instances = host.findAllComponents(ConfirmDialog);
    const references = instances.map((instance) => {
      const dialog = instance.findComponent(UiDialogStub);
      return {
        instance,
        dialog,
        titleId: dialog.props('titleId'),
        descriptionId: dialog.props('descriptionIds'),
      };
    });
    const ids = references.flatMap(({ titleId, descriptionId }) => [titleId, descriptionId]);

    expect(instances).to.have.length(2);
    expect(new Set(ids).size).to.equal(ids.length);
    references.forEach(({ instance, dialog, titleId, descriptionId }) => {
      expect(dialog.attributes('aria-labelledby')).to.equal(titleId);
      expect(dialog.attributes('aria-describedby')).to.equal(descriptionId);
      expect(findAllById(instance, titleId)).to.have.length(1);
      expect(findAllById(instance, descriptionId)).to.have.length(1);
      expect(findAllById(host, titleId)).to.have.length(1);
      expect(findAllById(host, descriptionId)).to.have.length(1);
    });
  });

  it('明示したtitleIdを見出しとUiDialogの関連付けに使用する', () => {
    const wrapper = factory({ titleId: 'custom-confirm-title' });
    const dialog = wrapper.findComponent(UiDialogStub);

    expect(dialog.props('titleId')).to.equal('custom-confirm-title');
    expect(wrapper.get('#custom-confirm-title').text()).to.equal('Title');
  });

  it('visibleがfalseになった時にcloseを通知する', async () => {
    const wrapper = factory();
    await wrapper.setData({ visible: false });
    expect(wrapper.emitted().close).to.have.lengthOf(1);
  });

  it('既定ではconfirmでconfirmをemitして自動で閉じる', async () => {
    const wrapper = factory();
    await wrapper.find('button[aria-label="OK"]').trigger('click');

    expect(wrapper.props('closeOnConfirm')).to.equal(true);
    expect(wrapper.emitted().confirm).to.have.lengthOf(1);
    expect(wrapper.emitted().close).to.have.lengthOf(1);
  });

  it('closeOnConfirm=falseではconfirm後も開いたままにして親の指定で閉じる', async () => {
    const wrapper = factory({ closeOnConfirm: false });
    await wrapper.find('button[aria-label="OK"]').trigger('click');

    expect(wrapper.emitted().confirm).to.have.lengthOf(1);
    expect(wrapper.emitted().close).to.equal(undefined);
    expect(wrapper.vm.visible).to.equal(true);

    await wrapper.setProps({ dialogVisible: false });
    expect(wrapper.vm.visible).to.equal(false);
    expect(wrapper.emitted().close).to.have.lengthOf(1);
  });

  it('cancelでcancelとcloseを通知する', async () => {
    const wrapper = factory();
    await wrapper.find('button[aria-label="Cancel"]').trigger('click');

    expect(wrapper.emitted().cancel).to.have.lengthOf(1);
    expect(wrapper.emitted().close).to.have.lengthOf(1);
  });

  it('UiDialogのclosedイベントとデータを転送し、closeイベントも維持する', async () => {
    const wrapper = factory();
    const payload = { returnFocus: true };

    wrapper.findComponent(UiDialogStub).vm.$emit('closed', payload);
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted().closed).to.deep.equal([[payload]]);
    expect(wrapper.emitted().close).to.have.lengthOf(1);
  });

  it('送信中はすべてのボタンを無効にする', () => {
    const wrapper = factory({ sending: true });
    wrapper.findAll('button').forEach((button) => {
      expect(button.element.disabled).to.equal(true);
    });
    expect(wrapper.findComponent(UiDialogStub).attributes('aria-busy')).to.equal('true');
    expect(wrapper.findComponent(UiProgressStub).props('mode')).to.equal('indeterminate');
  });

  it('明示した場合は送信中以外のEscapeと背景操作をキャンセルとして扱う', async () => {
    const wrapper = factory({ closeOnEscape: true, closeOnBackdrop: true });
    const dialog = wrapper.findComponent(UiDialogStub);

    expect(dialog.props('closeOnEscape')).to.equal(true);
    expect(dialog.props('closeOnBackdrop')).to.equal(true);

    dialog.vm.$emit('request-close', { reason: 'escape' });
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted().cancel).to.have.lengthOf(1);
    expect(wrapper.emitted().close).to.have.lengthOf(1);
  });

  it('送信中は閉じる要求とコードからの確定操作を無視する', async () => {
    const wrapper = factory({
      sending: true,
      closeOnEscape: true,
      closeOnBackdrop: true,
    });
    const dialog = wrapper.findComponent(UiDialogStub);

    expect(dialog.props('closeOnEscape')).to.equal(false);
    expect(dialog.props('closeOnBackdrop')).to.equal(false);
    dialog.vm.$emit('request-close', { reason: 'escape' });
    wrapper.vm.onConfirm();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted().cancel).to.equal(undefined);
    expect(wrapper.emitted().confirm).to.equal(undefined);
  });

  it('既定の操作配置とdoneアイコンを維持する', () => {
    const wrapper = factory();

    expect(wrapper.props('actionsAdjacent')).to.equal(false);
    expect(wrapper.props('closeOnConfirm')).to.equal(true);
    expect(wrapper.props('confirmIcon')).to.equal('done');
    expect(wrapper.find('.common-dialog-actions').classes()).to.not.include(
      'common-dialog-actions--adjacent'
    );
    expect(wrapper.find('.ui-dialog__header-end i').attributes('data-name')).to.equal('done');
  });

  it('明示時だけ操作を隣接配置し、スマートフォン確認アイコンを差し替える', () => {
    const wrapper = factory({
      actionsAdjacent: true,
      confirmIcon: 'delete',
      confirmTone: 'primary',
      initialFocus: '[data-testid="confirm-dialog-cancel"]',
      progressMode: 'determinate',
      progressAmount: 45,
    });

    expect(wrapper.findComponent(UiDialogStub).classes()).to.include(
      'confirm-dialog--actions-adjacent'
    );
    expect(wrapper.find('.common-dialog-actions').classes()).to.include(
      'common-dialog-actions--adjacent'
    );
    expect(wrapper.find('.ui-dialog__header-end i').attributes('data-name')).to.equal('delete');
    expect(wrapper.findComponent(UiDialogStub).props('initialFocus')).to.equal(
      '[data-testid="confirm-dialog-cancel"]'
    );
    expect(wrapper.findAllComponents(UiButtonStub).at(1).props('tone')).to.equal('primary');
    expect(wrapper.findComponent(UiProgressStub).props()).to.include({
      mode: 'determinate',
      value: 45,
    });
  });

  it('操作ボタンのテスト用IDを利用側から指定できる', () => {
    const wrapper = factory({
      cancelTestId: 'custom-cancel',
      confirmTestId: 'custom-confirm',
    });

    expect(wrapper.findAll('[data-testid="custom-cancel"]')).to.have.length(2);
    expect(wrapper.findAll('[data-testid="custom-confirm"]')).to.have.length(2);
  });

  it('cancelLabel未指定の場合はキャンセルボタンを描画しない', () => {
    const wrapper = factory({ cancelLabel: null });
    expect(wrapper.findAll('button')).to.have.lengthOf(2);
    expect(wrapper.find('button[aria-label="Cancel"]').exists()).to.equal(false);
  });

  it('スロット指定時はmessageの代わりにスロット内容を表示する', () => {
    const wrapper = factory(
      { message: 'Message' },
      {
        default: '<p class="slot-content">Slot</p>',
      }
    );

    expect(wrapper.find('.slot-content').exists()).to.equal(true);
    expect(wrapper.text()).to.not.contain('Message');
  });
});
