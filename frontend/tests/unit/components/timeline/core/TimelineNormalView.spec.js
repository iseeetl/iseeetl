import { expect } from 'vitest';
import { shallowMount } from '../../../helpers/testUtils';
import TimelineNormalView from '@/components/timeline/core/TimelineNormalView.vue';

const createWrapper = (overrides = {}) =>
  shallowMount(TimelineNormalView, {
    stubs: {
      TimelineHeader: true,
      TimelineTabs: true,
      TimelineMobilePostButtons: true,
      TimelineColumns: true,
    },
    props: {
      headerProps: {},
      headerEvents: {},
      isSocketConnect: false,
      isGuestReactionOnly: false,
      filters: [],
      currentTabIndex: 0,
      localTagIds: [],
      getTranslatedTagName: () => 'tag',
      isSpeechActive: () => false,
      onPressFilterTab: () => {},
      onToggleColumnSpeech: () => {},
      onShowFilterDialog: () => {},
      onDeleteFilter: () => {},
      onTabListKeydown: () => {},
      onShowEditPostDialog: () => {},
      currentFilterTagIds: [],
      isMobile: false,
      commonColumnProps: () => ({}),
      commonColumnEvents: {},
      onPaneResized: () => {},
      onDragEnd: () => {},
      onReconnect: () => {},
      showSocketStatus: false,
      ...(overrides.props || {}),
    },
    mocks: {
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });

describe('タイムラインの通常表示', () => {
  it('接続前でもバナー表示が無効なら表示しない', () => {
    const wrapper = createWrapper({ props: { isSocketConnect: false, showSocketStatus: false } });
    expect(wrapper.find('[data-testid="timeline-connected"]').exists()).to.equal(false);
    expect(wrapper.find('[data-testid="timeline-socket-status"]').exists()).to.equal(false);
  });

  it('接続前でバナー表示が有効なら表示する', () => {
    const wrapper = createWrapper({ props: { isSocketConnect: false, showSocketStatus: true } });
    expect(wrapper.find('[data-testid="timeline-socket-status"]').exists()).to.equal(true);
  });

  it('再接続ボタンをクリックするとonReconnectを呼ぶ', async () => {
    let reconnectCount = 0;
    const wrapper = createWrapper({
      props: {
        isSocketConnect: false,
        showSocketStatus: true,
        onReconnect: () => {
          reconnectCount += 1;
        },
      },
    });

    await wrapper.find('.socket-status__button').trigger('click');

    expect(reconnectCount).to.equal(1);
  });

  it('再接続ボタンを現在の言語で翻訳する', () => {
    const wrapper = createWrapper({
      props: { showSocketStatus: true },
      mocks: { $t: (key) => `translated:${key}` },
    });

    expect(wrapper.find('.socket-status__button').text()).to.equal('translated:再接続');
  });

  it('接続後は接続済みマーカーを描画する', () => {
    const wrapper = createWrapper({ props: { isSocketConnect: true } });
    expect(wrapper.find('[data-testid="timeline-connected"]').exists()).to.equal(true);
    expect(wrapper.find('[data-testid="timeline-socket-status"]').exists()).to.equal(false);
  });

  it('投稿ボタンへゲストのリアクション限定状態を渡す', () => {
    const wrapper = createWrapper({ props: { isGuestReactionOnly: true } });

    expect(wrapper.findComponent({ name: 'TimelineMobilePostButtons' }).props('isGuestReactionOnly')).to.equal(true);
  });

  it('ヘッダのルーム情報イベントを指定されたハンドラへ中継する', async () => {
    let callCount = 0;
    const wrapper = createWrapper({
      props: {
        headerEvents: {
          showRoomInfoDialog: () => {
            callCount += 1;
          },
        },
      },
    });

    wrapper.findComponent({ name: 'TimelineHeader' }).vm.$emit('showRoomInfoDialog');
    await wrapper.vm.$nextTick();

    expect(callCount).to.equal(1);
  });
});
