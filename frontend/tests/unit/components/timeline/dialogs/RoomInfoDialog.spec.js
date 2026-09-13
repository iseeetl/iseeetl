import { expect } from 'vitest';
import { shallowMount } from '../../../helpers/testUtils';
import DateUtil from '@/utils/dateUtil';
import RoomInfoDialog from '@/components/timeline/dialogs/RoomInfoDialog.vue';

const baseStubs = {
  UiDialog: { template: '<div><slot name="title"/><slot/><slot name="actions"/></div>' },
  UiButton: true,
  UiIcon: true,
};

const createWrapper = (overrides = {}) =>
  shallowMount(RoomInfoDialog, {
    stubs: baseStubs,
    props: {
      dialogVisible: true,
      roomTitle: 'Room',
      roomDescription: 'Desc',
      roomCreator: 'User',
      roomCreatedAt: '2024-01-01T00:00:00Z',
      ...(overrides.props || {}),
    },
    mocks: {
      $store: { getters: { floorTitle: 'Floor' } },
      $t: (key) => key,
      $i18n: { locale: 'ja' },
      ...(overrides.mocks || {}),
    },
  });

describe('ルーム情報の表示', () => {
  it('dialogVisible の初期値と変更を visible に同期する', async () => {
    const wrapper = createWrapper({ props: { dialogVisible: false } });

    expect(wrapper.vm.visible).to.equal(false);
    await wrapper.setProps({ dialogVisible: true });
    expect(wrapper.vm.visible).to.equal(true);
  });

  it('フロア名を先頭にし、各項目のラベルと値を順に表示する', async () => {
    const wrapper = createWrapper({ props: { roomDescription: '一行目\n二行目' } });
    expect(wrapper.get('.room-info-title').text()).to.equal('Room');
    expect(wrapper.get('.room-info-floor dd').text()).to.equal('Floor');
    expect(wrapper.get('.room-info-description dd').element.textContent).to.equal('一行目\n二行目');
    expect(wrapper.findAll('.room-info-details dt').map((item) => item.text())).to.deep.equal([
      'フロアタイトル', 'ルームタイトル', 'ルーム説明', 'ルーム作成者', 'ルーム作成日',
    ]);
    expect(wrapper.findAll('.room-info-details dd').slice(0, 4).map((item) => item.element.textContent)).to.deep.equal([
      'Floor', 'Room', '一行目\n二行目', 'User',
    ]);
    await wrapper.setProps({ roomDescription: '', roomCreatedAt: null });
    expect(wrapper.find('.room-info-description').exists()).to.equal(false);
    expect(wrapper.findAll('.room-info-details dd').at(-1).text()).to.equal('');
  });

  it('日付整形はDateUtilで行う', () => {
    const original = DateUtil.getLocalDate;
    DateUtil.getLocalDate = (date, locale, type) => `${date}-${locale}-${type}`;

    try {
      const wrapper = createWrapper();
      const result = wrapper.vm.getLocalDateTime('2024-01-01T00:00:00Z');
      expect(result).to.equal('2024-01-01T00:00:00Z-ja-dateTime');
    } finally {
      DateUtil.getLocalDate = original;
    }
  });

  it('閉じる操作でダイアログが閉じる', () => {
    const wrapper = createWrapper();
    wrapper.setData({ visible: true });

    wrapper.vm.onPressDoneButton();

    expect(wrapper.vm.visible).to.equal(false);
  });

  it('スマートフォンとPCの操作を中立色の閉じるへ統一する', () => {
    const wrapper = createWrapper();
    const mobileButton = wrapper.get('[data-testid="dialog-room-info-close-mobile"]');
    const desktopButton = wrapper.get('[data-testid="dialog-room-info-close"]');

    expect(mobileButton.attributes('aria-label')).to.equal('閉じる');
    expect(mobileButton.attributes('tone')).to.equal('neutral');
    expect(desktopButton.attributes('tone')).to.equal('neutral');
    expect(desktopButton.text()).to.equal('閉じる');
  });

  it('roomDescription が空のときは説明欄を表示しない', () => {
    const wrapper = createWrapper({
      props: { roomDescription: '' },
    });

    expect(wrapper.text()).to.not.include('ルーム説明');
  });

  it('closedDialog で close を通知する', () => {
    const wrapper = createWrapper();

    wrapper.vm.closedDialog({ focusRestored: true });

    expect(wrapper.emitted().close).to.have.lengthOf(1);
    expect(wrapper.emitted().close[0][0]).to.deep.equal({ focusRestored: true });
  });

  it('roomCreatedAt が null のとき日付は表示しない', () => {
    const wrapper = createWrapper({
      props: { roomCreatedAt: null },
    });

    expect(wrapper.text()).to.include('ルーム作成日');
    expect(wrapper.text()).to.not.include('2024-01-01');
  });
});
