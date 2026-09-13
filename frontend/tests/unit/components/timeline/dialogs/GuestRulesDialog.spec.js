import { expect } from 'vitest';
import { shallowMount } from '../../../helpers/testUtils';
import GuestRulesDialog from '@/components/timeline/dialogs/GuestRulesDialog.vue';
import { createApplicationI18n } from '@/i18n.js';

const GUEST_CONSENT_MESSAGE =
  'ゲストとして投稿、返信またはリアクションを行うことで、利用許諾・著作権・禁止事項・免責事項、プライバシーポリシー及びCookieポリシーに同意したものとみなされます。';

const BaseEditDialogStub = {
  name: 'BaseEditDialog',
  props: ['visible', 'titleText', 'cancelLabel', 'confirmLabel', 'actionsAdjacent'],
  template: '<div><slot/></div>',
};

const baseStubs = {
  BaseEditDialog: BaseEditDialogStub,
  RouterLink: {
    name: 'RouterLink',
    props: ['to'],
    template: '<a><slot /></a>',
  },
  'i18n-t': false,
};

const createWrapper = (overrides = {}) => {
  const route = (overrides.mocks && overrides.mocks.$route) || { params: {} };
  const mocks = {
    $store: { dispatch: () => {} },
    $route: route,
    $t: (key) => key,
    ...(overrides.mocks || {}),
  };
  return shallowMount(GuestRulesDialog, {
    stubs: baseStubs,
    props: { dialogVisible: true, ...(overrides.props || {}) },
    global: {
      plugins: [createApplicationI18n({ locale: 'ja' })],
    },
    mocks,
  });
};

describe('ゲストの利用ルールへの同意', () => {
  it('共通編集ダイアログへ同意操作を渡す', () => {
    const wrapper = createWrapper();
    const dialog = wrapper.findComponent(BaseEditDialogStub);

    expect(dialog.props()).to.include({
      visible: true,
      titleText: 'ゲストでの利用ルール',
      cancelLabel: 'キャンセル',
      confirmLabel: '同意する',
      actionsAdjacent: true,
    });
  });

  it('同意操作でsuccessを通知する', () => {
    const wrapper = createWrapper({
      mocks: { $route: { params: { floor_id: 'floor-1', room_id: 'room-1' } } },
    });

    wrapper.vm.onPressDoneButton();

    expect(wrapper.emitted().success).to.have.lengthOf(1);
  });

  it('roomContextQueryはルートパラメータから構築する', () => {
    const wrapper = createWrapper({
      mocks: { $route: { params: { floor_id: 'floor-1', room_id: 'room-1' } } },
    });

    expect(wrapper.vm.roomContextQuery).to.deep.equal({ floor_id: 'floor-1', room_id: 'room-1' });
  });

  it('キャンセル操作でダイアログが閉じる', async () => {
    const wrapper = createWrapper({ mocks: { $route: { params: {} } } });

    wrapper.setData({ visible: true });
    wrapper.vm.onPressCancelButton();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.visible).to.equal(false);
  });

  it('同意文中に規約・ポリシーへの3リンクを重複なく表示する', () => {
    const wrapper = createWrapper({
      mocks: { $route: { params: { floor_id: 'floor-1', room_id: 'room-1' } } },
    });
    const description = wrapper.get('#guest_rules_dialog_description');
    const expectedQuery = { floor_id: 'floor-1', room_id: 'room-1' };
    const expectedLinks = [
      {
        testId: 'guest-rules-terms-link',
        text: '利用許諾・著作権・禁止事項・免責事項',
        routeName: 'Terms',
      },
      {
        testId: 'guest-rules-privacy-link',
        text: 'プライバシーポリシー',
        routeName: 'Privacy',
      },
      {
        testId: 'guest-rules-cookie-policy-link',
        text: 'Cookieポリシー',
        routeName: 'CookiePolicy',
      },
    ];

    expect(description.text()).to.equal(GUEST_CONSENT_MESSAGE);
    expectedLinks.forEach(({ testId, text, routeName }) => {
      const link = wrapper
        .findAllComponents({ name: 'RouterLink' })
        .find((candidate) => candidate.attributes('data-testid') === testId);
      expect(link, testId).not.to.equal(undefined);
      expect(link.text(), testId).to.equal(text);
      expect(link.props('to'), testId).to.deep.equal({ name: routeName, query: expectedQuery });
      expect(description.element.contains(link.element), testId).to.equal(true);
      expect(wrapper.findAll(`[data-testid="${testId}"]`), testId).to.have.lengthOf(1);
    });
    expect(description.findAllComponents({ name: 'RouterLink' })).to.have.lengthOf(3);
    expect(description.text()).not.to.include('ログインページへ');
  });
});
