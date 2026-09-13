import { expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { shallowMount } from '../../../helpers/testUtils';
import LoginRequiredDialog from '@/components/timeline/dialogs/LoginRequiredDialog.vue';

const UiDialogStub = {
  name: 'UiDialog',
  props: ['open', 'titleId', 'descriptionIds'],
  template:
    '<div role="dialog" :aria-labelledby="titleId" :aria-describedby="descriptionIds"><slot name="title"/><slot/><slot name="actions"/></div>',
};

const baseStubs = {
  UiDialog: UiDialogStub,
  UiButton: true,
  UiIcon: true,
  UiProgress: true,
  'router-link': true,
};

const createWrapper = (overrides = {}) => {
  const route = (overrides.mocks && overrides.mocks.$route) || { params: { floor_id: 'floor-1', room_id: 'room-1' } };
  const mocks = {
    $store: { dispatch: () => {} },
    $route: route,
    $t: (key) => key,
    ...(overrides.mocks || {}),
  };
  return shallowMount(LoginRequiredDialog, {
    stubs: baseStubs,
    props: {
      dialogVisible: true,
      ...(overrides.props || {}),
    },
    mocks,
    ...(overrides.slots ? { slots: overrides.slots } : {}),
  });
};

const findAllById = (wrapper, id) =>
  wrapper.findAll('[id]').filter((element) => element.attributes('id') === id);

describe('ログインを求めるダイアログ', () => {
  it('roomContextQueryはルートパラメータから構築する', () => {
    const wrapper = createWrapper();
    expect(wrapper.vm.roomContextQuery).to.deep.equal({ floor_id: 'floor-1', room_id: 'room-1' });
  });

  it('未指定のタイトルと操作名を現在の言語で翻訳する', () => {
    const ctx = {
      title: '',
      confirmLabel: '',
      cancelLabel: '',
      $t: (key) => `translated:${key}`,
    };

    expect(LoginRequiredDialog.computed.resolvedTitle.call(ctx)).to.equal('translated:ログインが必要です');
    expect(LoginRequiredDialog.computed.resolvedConfirmLabel.call(ctx)).to.equal('translated:閉じる');
    expect(LoginRequiredDialog.computed.resolvedCancelLabel.call(ctx)).to.equal('translated:キャンセル');
  });

  it('確認操作でconfirmとcloseを通知する', async () => {
    const wrapper = createWrapper();

    wrapper.vm.onConfirm();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted().confirm).to.have.lengthOf(1);
    expect(wrapper.emitted().close).to.have.lengthOf(1);
  });

  it('ダイアログを開くとopenedを通知する', () => {
    const wrapper = createWrapper();

    wrapper.vm.openedDialog();

    expect(wrapper.emitted().opened).to.have.lengthOf(1);
  });

  it('送信中は確認操作と閉鎖要求を受け付けない', () => {
    const wrapper = createWrapper({ props: { sending: true } });

    wrapper.vm.onConfirm();
    wrapper.vm.requestClose();

    expect(wrapper.emitted().confirm).to.equal(undefined);
    expect(wrapper.vm.visible).to.equal(true);
  });

  it('既定の閉じる操作を中立色で表示する', () => {
    const wrapper = createWrapper();
    const mobileButton = wrapper.get('[data-testid="dialog-login-required-confirm-mobile"]');
    const desktopButton = wrapper.get('[data-testid="dialog-login-required-confirm-desktop"]');

    expect(mobileButton.attributes('tone')).to.equal('neutral');
    expect(mobileButton.attributes('aria-label')).to.equal('閉じる');
    expect(desktopButton.attributes('tone')).to.equal('neutral');
    expect(desktopButton.text()).to.equal('閉じる');
  });

  it('2つのダイアログのARIA IDを一意にし、それぞれ自身の要素を参照する', () => {
    const host = mount(
      {
        components: { LoginRequiredDialog },
        template: `
          <div>
            <LoginRequiredDialog :dialog-visible="true" title="First" />
            <LoginRequiredDialog :dialog-visible="true" title="Second" />
          </div>
        `,
      },
      {
        global: {
          stubs: baseStubs,
          mocks: {
            $store: { dispatch: () => {} },
            $route: { params: { floor_id: 'floor-1', room_id: 'room-1' } },
            $t: (key) => key,
          },
        },
      }
    );
    const instances = host.findAllComponents(LoginRequiredDialog);
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
      expect(titleId.startsWith('login-required-dialog-')).to.equal(true);
      expect(titleId.endsWith('-title')).to.equal(true);
      expect(descriptionId.startsWith('login-required-dialog-')).to.equal(true);
      expect(descriptionId.endsWith('-description')).to.equal(true);
      expect(dialog.attributes('aria-labelledby')).to.equal(titleId);
      expect(dialog.attributes('aria-describedby')).to.equal(descriptionId);
      expect(findAllById(instance, titleId)).to.have.length(1);
      expect(findAllById(instance, descriptionId)).to.have.length(1);
      expect(findAllById(host, titleId)).to.have.length(1);
      expect(findAllById(host, descriptionId)).to.have.length(1);
    });
  });

  it('message スロット差し替え時も説明参照先を維持する', () => {
    const wrapper = createWrapper({
      slots: {
        message: '<p class="custom-message">差し替え文面</p>',
      },
    });
    const dialog = wrapper.findComponent(UiDialogStub);
    const descriptionId = dialog.props('descriptionIds');
    const descriptionTargets = findAllById(wrapper, descriptionId);

    expect(descriptionTargets).to.have.length(1);
    expect(descriptionTargets[0].find('.custom-message').text()).to.equal('差し替え文面');
  });
});
