import { expect } from 'vitest';
import { shallowMount } from '../../../helpers/testUtils';
import DateUtil from '@/utils/dateUtil';
import ReactionNotificationItem from '@/components/timeline/items/ReactionNotificationItem.vue';

const baseStubs = {
  UiAvatar: true,
  UiButton: { template: '<button v-bind="$attrs"><slot/></button>' },
  UiIcon: true,
};

const createWrapper = (overrides = {}) =>
  shallowMount(ReactionNotificationItem, {
    stubs: baseStubs,
    props: {
      post: {
        _id: 'post-1',
        floor: 'floor-1',
        room: 'room-1',
        created_at: '2024-01-01T00:00:00Z',
        reactions: [{ type: 'いいね' }, { type: 'いいね' }],
        user: { _id: 'user-1', image_name: 'u.png' },
        image_name: null,
        video_name: null,
        content: null,
      },
      reaction: { _id: 'r1', type: 'いいね', created_at: '2024-01-01T00:00:00Z', user: { _id: 'user-1' } },
      tags: [],
      hideParent: false,
      ...(overrides.props || {}),
    },
    mocks: {
      $store: { getters: { displayTag: true } },
      $t: (key) => key,
      $i18n: { locale: 'ja' },
      ...(overrides.mocks || {}),
    },
  });

describe('リアクション通知の表示', () => {
  it('通知カードに不要なDOM IDを付けず、表示中のボタンから1回だけ通知する', async () => {
    const wrapper = createWrapper();
    expect(wrapper.find('article.notification').attributes('id')).to.equal(undefined);
    const button = wrapper.get('[data-testid="timeline-reaction-notification-target-r1"]');
    expect(button.text()).to.equal('対象の投稿へ移動');

    await button.trigger('click');
    expect(wrapper.emitted().onPressNotification).to.have.lengthOf(1);
  });

  it('リアクション件数を集計する', () => {
    const wrapper = createWrapper();
    expect(wrapper.vm.reactionCountInPost).to.equal(2);
    wrapper.unmount();
  });

  it('リアクションアイコンを返す', () => {
    const wrapper = createWrapper();
    expect(wrapper.vm.reactionIcon).to.be.a('string');
    wrapper.unmount();
  });

  it('通知クリックで親へ通知する', () => {
    const wrapper = createWrapper();
    wrapper.vm.onPressNotification({ _id: 'post-1' });

    expect(wrapper.emitted().onPressNotification[0][0]).to.deep.equal({ _id: 'post-1' });
    wrapper.unmount();
  });

  it('日付整形はDateUtilで行う', () => {
    const original = DateUtil.getLocalDate;
    DateUtil.getLocalDate = (date, locale, type) => `${date}-${locale}-${type}`;

    try {
      const wrapper = createWrapper();
      const value = wrapper.vm.getLocalDateTime('2024-01-01T00:00:00Z');
      expect(value).to.equal('2024-01-01T00:00:00Z-ja-dateTime');
      wrapper.unmount();
    } finally {
      DateUtil.getLocalDate = original;
    }
  });

  it('本文とタグはメディアより先に表示される', () => {
    const wrapper = createWrapper({
      props: {
        post: {
          _id: 'post-1',
          floor: 'floor-1',
          room: 'room-1',
          created_at: '2024-01-01T00:00:00Z',
          reactions: [],
          user: { _id: 'user-1', image_name: 'u.png' },
          image_name: 'img.png',
          video_name: null,
          content: 'hello',
          room_tags: ['tag-1'],
        },
        tags: [{ _id: 'tag-1', name: 'tag1' }],
      },
    });

    const container = wrapper.find('.post .container').element;
    const textEl = container.querySelector('.text');
    const tagsEl = container.querySelector('.tags');
    const imageEl = container.querySelector('.image');
    const children = Array.from(container.children);

    expect(textEl).to.not.equal(null);
    expect(tagsEl).to.not.equal(null);
    expect(imageEl).to.not.equal(null);
    expect(children.indexOf(textEl)).to.be.lessThan(children.indexOf(tagsEl));
    expect(children.indexOf(tagsEl)).to.be.lessThan(children.indexOf(imageEl));

    wrapper.unmount();
  });
});
