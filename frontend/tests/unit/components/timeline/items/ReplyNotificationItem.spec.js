import { expect } from 'vitest';
import { shallowMount } from '../../../helpers/testUtils';
import DateUtil from '@/utils/dateUtil';
import ReplyNotificationItem from '@/components/timeline/items/ReplyNotificationItem.vue';

const baseStubs = {
  UiAvatar: true,
  UiButton: { template: '<button v-bind="$attrs"><slot/></button>' },
  UiIcon: true,
};

const createWrapper = (overrides = {}) =>
  shallowMount(ReplyNotificationItem, {
    stubs: baseStubs,
    props: {
      post: {
        _id: 'post-1',
        floor: 'floor-1',
        room: 'room-1',
        created_at: '2024-01-01T00:00:00Z',
        image_name: null,
        video_name: null,
        content: null,
      },
      reply: {
        _id: 'reply-1',
        created_at: '2024-01-01T00:00:00Z',
        user: { _id: 'user-1' },
        image_name: null,
        audio_name: null,
        video_name: null,
        content: null,
      },
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

describe('返信通知の表示', () => {
  it('通知カードに不要なDOM IDを付けない', () => {
    const wrapper = createWrapper({
      props: {
        post: {
          _id: 'post-1:reply-notification:event-1',
          floor: 'floor-1',
          room: 'room-1',
          created_at: '2024-01-01T00:00:00Z',
          image_name: null,
          video_name: null,
          content: null,
        },
      },
    });

    expect(wrapper.find('article.notification').attributes('id')).to.equal(undefined);
    wrapper.unmount();
  });

  it('通知クリックで親へ通知する', () => {
    const wrapper = createWrapper();
    wrapper.vm.onPressNotification({ _id: 'post-1' });

    expect(wrapper.emitted().onPressNotification[0][0]).to.deep.equal({ _id: 'post-1' });
    wrapper.unmount();
  });

  it('専用の移動ボタンを表示せず、通知見出しをキーボードとポインタ操作の入口にする', async () => {
    const wrapper = createWrapper();
    const button = wrapper.get('button.notification-heading');

    expect(wrapper.text()).not.toContain('対象の返信へ移動');
    expect(button.attributes('aria-label')).toBe('対象の返信へ移動');
    expect(button.attributes('type')).toBe('button');
    await button.trigger('click');
    expect(wrapper.emitted().onPressNotification).to.have.lengthOf(1);
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
          image_name: 'post.png',
          video_name: null,
          content: 'post',
          room_tags: ['tag-1'],
          user: { _id: 'user-1' },
        },
        reply: {
          _id: 'reply-1',
          created_at: '2024-01-01T00:00:00Z',
          user: { _id: 'user-1' },
          image_name: 'reply.png',
          audio_name: null,
          video_name: null,
          content: 'reply',
          room_tags: ['tag-1'],
        },
        tags: [{ _id: 'tag-1', name: 'tag1' }],
      },
    });

    const replyContainer = wrapper.find('.reply .container').element;
    const replyTextEl = replyContainer.querySelector('.text');
    const replyTagsEl = replyContainer.querySelector('.tags');
    const replyImageEl = replyContainer.querySelector('.image');
    const replyChildren = Array.from(replyContainer.children);

    expect(replyTextEl).to.not.equal(null);
    expect(replyTagsEl).to.not.equal(null);
    expect(replyImageEl).to.not.equal(null);
    expect(replyChildren.indexOf(replyTextEl)).to.be.lessThan(replyChildren.indexOf(replyTagsEl));
    expect(replyChildren.indexOf(replyTagsEl)).to.be.lessThan(replyChildren.indexOf(replyImageEl));

    const postContainer = wrapper.find('.post .container').element;
    const postTextEl = postContainer.querySelector('.text');
    const postTagsEl = postContainer.querySelector('.tags');
    const postImageEl = postContainer.querySelector('.image');
    const postChildren = Array.from(postContainer.children);

    expect(postTextEl).to.not.equal(null);
    expect(postTagsEl).to.not.equal(null);
    expect(postImageEl).to.not.equal(null);
    expect(postChildren.indexOf(postTextEl)).to.be.lessThan(postChildren.indexOf(postTagsEl));
    expect(postChildren.indexOf(postTagsEl)).to.be.lessThan(postChildren.indexOf(postImageEl));

    wrapper.unmount();
  });
});
