import { expect } from 'vitest';
import {
  appendNotificationCardToConditionless,
  buildReactionNotificationCard,
  buildReplyNotificationCard,
  shouldNotifyReaction,
  shouldNotifyReply,
} from '@/features/timeline/notifications';

describe('タイムラインの返信・リアクション通知', () => {
  it('appendNotificationCardToConditionless は対象列にカードを追加する', () => {
    const filters = [{ posts: [] }, { posts: [] }];
    const baseCard = { _id: 'n1' };

    appendNotificationCardToConditionless({
      filters,
      indexes: [0, 1],
      baseCard,
      ensurePostsArray: (i) => {
        if (!Array.isArray(filters[i].posts)) filters[i].posts = [];
      },
      isParentVisible: () => false,
      getHideParent: (i) => i === 1,
    });

    expect(filters[0].posts[0]).to.deep.equal({ _id: 'n1', hideParent: false });
    expect(filters[1].posts[0]).to.deep.equal({ _id: 'n1', hideParent: true });
  });

  it('appendNotificationCardToConditionless は親が可視ならスキップする', () => {
    const filters = [{ posts: [] }, { posts: [] }];
    const baseCard = { _id: 'n2' };

    appendNotificationCardToConditionless({
      filters,
      indexes: [0, 1],
      baseCard,
      ensurePostsArray: (i) => {
        if (!Array.isArray(filters[i].posts)) filters[i].posts = [];
      },
      isParentVisible: (i) => i === 0,
      getHideParent: () => false,
    });

    expect(filters[0].posts).to.have.length(0);
    expect(filters[1].posts).to.have.length(1);
  });

  it('appendNotificationCardToConditionless は明示通知なら親が可視でも追加する', () => {
    const filters = [{ posts: [] }];
    const baseCard = { _id: 'n-explicit' };

    appendNotificationCardToConditionless({
      filters,
      indexes: [0],
      baseCard,
      ensurePostsArray: () => {},
      isParentVisible: () => true,
      getHideParent: () => false,
      skipIfParentVisible: false,
    });

    expect(filters[0].posts).to.deep.equal([{ _id: 'n-explicit', hideParent: false }]);
  });

  it('appendNotificationCardToConditionless は既存カードを重複追加しない', () => {
    const filters = [{ posts: [{ _id: 'n3' }] }];
    const baseCard = { _id: 'n3' };

    appendNotificationCardToConditionless({
      filters,
      indexes: [0],
      baseCard,
      ensurePostsArray: () => {},
      isParentVisible: () => false,
      getHideParent: () => false,
    });

    expect(filters[0].posts).to.have.length(1);
  });

  it('shouldNotifyReply は通知オフの場合にfalseを返す', () => {
    const result = shouldNotifyReply({
      post: { _id: 'p1' },
      reply: { _id: 'r1' },
      userId: 'u1',
      guestId: 'g1',
      roomNotification: false,
    });

    expect(result).to.equal(false);
  });

  it('shouldNotifyReply は自分の返信を通知しない', () => {
    const result = shouldNotifyReply({
      post: { _id: 'p1' },
      reply: { _id: 'r1', user: { _id: 'u1' } },
      userId: 'u1',
      guestId: 'g1',
      roomNotification: true,
    });

    expect(result).to.equal(false);
  });

  it('shouldNotifyReply は自分の投稿への返信を通知する', () => {
    const result = shouldNotifyReply({
      post: { _id: 'p1', user: { _id: 'u1' } },
      reply: { _id: 'r1', user: { _id: 'u2' } },
      userId: 'u1',
      guestId: 'g1',
      roomNotification: true,
    });

    expect(result).to.equal(true);
  });

  it('shouldNotifyReply はnotify_allなら関連がなくても通知する', () => {
    const result = shouldNotifyReply({
      post: { _id: 'p1', user: { _id: 'u2' }, replies: [] },
      reply: { _id: 'r1', user: { _id: 'u3' }, notify_all: true },
      userId: 'u1',
      guestId: 'g1',
      roomNotification: true,
    });

    expect(result).to.equal(true);
  });

  it('shouldNotifyReply はアニメーション付き返信を通知しない', () => {
    const result = shouldNotifyReply({
      post: { _id: 'p1', user: { _id: 'u1' } },
      reply: { _id: 'r1', user: { _id: 'u2' }, animation: 'shake' },
      userId: 'u1',
      guestId: 'g1',
      roomNotification: true,
    });

    expect(result).to.equal(false);
  });

  it('自分の付加情報がある投稿への返信を通知する', () => {
    const result = shouldNotifyReply({
      post: {
        _id: 'p1',
        user: { _id: 'u2' },
        supplementaries: [{ _id: 's1', user: { _id: 'u1' } }],
        replies: [],
      },
      reply: { _id: 'r1', user: { _id: 'u3' } },
      userId: 'u1',
      guestId: 'g1',
      roomNotification: true,
    });

    expect(result).to.equal(true);
  });

  it('自分の付加情報がある返信を通知する', () => {
    const result = shouldNotifyReply({
      post: {
        _id: 'p1',
        user: { _id: 'u2' },
        replies: [
          { _id: 'r0', supplementaries: [{ _id: 's1', user: { _id: 'u1' } }] },
          { _id: 'r1', supplementaries: [] },
        ],
      },
      reply: { _id: 'r1', user: { _id: 'u3' } },
      userId: 'u1',
      guestId: 'g1',
      roomNotification: true,
    });

    expect(result).to.equal(true);
  });

  it('shouldNotifyReaction は自分の投稿へのリアクションのみ通知する', () => {
    const result = shouldNotifyReaction({
      post: { _id: 'p1', user: { _id: 'u1' } },
      reaction: { _id: 're1', user: { _id: 'u2' } },
      userId: 'u1',
      guestId: 'g1',
      roomNotification: true,
    });

    expect(result).to.equal(true);
  });

  it('shouldNotifyReaction は自分のリアクションを通知しない', () => {
    const result = shouldNotifyReaction({
      post: { _id: 'p1', user: { _id: 'u1' } },
      reaction: { _id: 're1', user: { _id: 'u1' } },
      userId: 'u1',
      guestId: 'g1',
      roomNotification: true,
    });

    expect(result).to.equal(false);
  });

  it('shouldNotifyReaction は自分以外の投稿なら通知しない', () => {
    const result = shouldNotifyReaction({
      post: { _id: 'p1', user: { _id: 'u2' } },
      reaction: { _id: 're1', user: { _id: 'u3' } },
      userId: 'u1',
      guestId: 'g1',
      roomNotification: true,
    });

    expect(result).to.equal(false);
  });

  it('buildReplyNotificationCard は返信通知カードを構築する', () => {
    const post = {
      _id: 'p1',
      user: { _id: 'u1' },
      guest_name: 'guest',
      content: 'post',
      room_tags: ['tag-1'],
      created_at: '2024-01-01',
      image_name: 'img',
      audio_name: 'aud',
      video_name: 'vid',
      floor: { _id: 'f1' },
      room: { _id: 'r1' },
      replies: [],
      lang: 'ja',
    };
    const reply = { _id: 'r1', notification_event_id: 'event-1' };

    const card = buildReplyNotificationCard(post, reply);

    expect(card.origin_id).to.equal('p1');
    expect(card._id).to.equal('p1:reply-notification:event-1');
    expect(card.replyNotification).to.equal(reply);
    expect(card.content).to.equal('post');
    expect(card.room_tags).to.deep.equal(['tag-1']);
  });

  it('buildReplyNotificationCard は同じ返信でも通知操作が異なれば別カードIDを構築する', () => {
    const post = { _id: 'p1', replies: [] };

    const first = buildReplyNotificationCard(post, { _id: 'r1', notification_event_id: 'event-1' });
    const replay = buildReplyNotificationCard(post, { _id: 'r1', notification_event_id: 'event-1' });
    const second = buildReplyNotificationCard(post, { _id: 'r1', notification_event_id: 'event-2' });

    expect(replay._id).to.equal(first._id);
    expect(second._id).not.to.equal(first._id);
  });

  it('buildReplyNotificationCard は旧イベント形式でも更新日時を通知操作の識別に使う', () => {
    const post = { _id: 'p1', replies: [] };

    const first = buildReplyNotificationCard(post, { _id: 'r1', updated_at: '2026-07-18T00:00:01.000Z' });
    const second = buildReplyNotificationCard(post, { _id: 'r1', updated_at: '2026-07-18T00:00:02.000Z' });

    expect(first._id).to.equal('p1:reply-notification:2026-07-18T00:00:01.000Z');
    expect(second._id).to.equal('p1:reply-notification:2026-07-18T00:00:02.000Z');
  });

  it('buildReactionNotificationCard はリアクション通知カードを構築する', () => {
    const post = {
      _id: 'p1',
      user: { _id: 'u1' },
      guest_name: 'guest',
      content: 'post',
      room_tags: ['tag-1'],
      created_at: '2024-01-01',
      image_name: 'img',
      audio_name: 'aud',
      video_name: 'vid',
      floor: { _id: 'f1' },
      room: { _id: 'r1' },
      reactions: [],
    };
    const reaction = { _id: 're1' };

    const card = buildReactionNotificationCard(post, reaction);

    expect(card.origin_id).to.equal('p1');
    expect(card._id).to.equal('p1re1');
    expect(card.reactionNotification).to.equal(reaction);
    expect(card.content).to.equal('post');
    expect(card.room_tags).to.deep.equal(['tag-1']);
  });
});
