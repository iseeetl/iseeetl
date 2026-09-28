import { describe, test, expect, vi, beforeEach } from 'vitest';
import chatApi from '@/api/chat';
import { getEmptyTimelineMessage, refreshTimelineEmptyState, markTimelineHasPosts } from '@/features/timeline/emptyState';

vi.mock('@/api/chat', () => ({ default: { fetchPosts: vi.fn() } }));

describe('投稿がないタイムラインの案内', () => {
  const translate = (key) => `翻訳:${key}`;
  const defaultText = '翻訳:まだ投稿がありません。投稿されると、ここに表示されます。';
  beforeEach(() => vi.clearAllMocks());

  test.each([{}, { empty_message: null }, { empty_message: '' }, { empty_message: '  ' }])(
    '未設定のルームは表示言語の標準文を使う（%j）', (room) => {
      expect(getEmptyTimelineMessage(room, 'en', translate)).toBe(defaultText);
    }
  );
  test('独自の案内文は表示言語の翻訳を優先し、なければ原文を使う', () => {
    const room = { lang: 'ja', empty_message: 'ようこそ', empty_message_translations: [{ lang: 'en', content: 'Welcome' }] };
    expect(getEmptyTimelineMessage(room, 'en', translate)).toBe('Welcome');
    expect(getEmptyTimelineMessage(room, 'ja', translate)).toBe('ようこそ');
    expect(getEmptyTimelineMessage(room, 'fr', translate)).toBe('ようこそ');
  });

  const context = () => ({
    timeline: { isEmpty: null, emptyStateRequest: 0 },
    $store: { getters: { floorId: 'floor', roomId: 'room', userIsLogin: true } },
    captureTimelineLifecycle: () => 1,
    canApplyTimelineRequest: vi.fn(() => true),
  });
  test.each([true, false])('ログイン状態に応じたAPIで、絞り込みなしの投稿を確認する（%s）', async (loggedIn) => {
    const ctx = context();
    ctx.$store.getters.userIsLogin = loggedIn;
    chatApi.fetchPosts.mockResolvedValue({ data: [] });
    await refreshTimelineEmptyState(ctx);
    expect(ctx.timeline.isEmpty).toBe(true);
    expect(chatApi.fetchPosts).toHaveBeenCalledWith({ floor_id: 'floor', room_id: 'room', isGuest: !loggedIn });
  });
  test('表示中の列が空でも、ルーム内に投稿があれば案内を表示しない', async () => {
    const ctx = context();
    ctx.timeline.filters = [{ posts: [], conditions: { tag: '対象外' } }];
    chatApi.fetchPosts.mockResolvedValue({ data: [{ _id: 'post' }] });
    await refreshTimelineEmptyState(ctx);
    expect(ctx.timeline.isEmpty).toBe(false);
  });
  test('読み込み中と取得失敗時は案内を表示しない', async () => {
    const ctx = context();
    ctx.timeline.isEmpty = true;
    let reject;
    chatApi.fetchPosts.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
    const pending = refreshTimelineEmptyState(ctx);
    expect(ctx.timeline.isEmpty).toBe(null);
    reject(new Error('取得失敗'));
    await pending;
    expect(ctx.timeline.isEmpty).toBe(null);
  });
  test('取得中に新しい投稿を受信した場合、古い空の応答を反映しない', async () => {
    const ctx = context();
    let resolve;
    chatApi.fetchPosts.mockReturnValue(new Promise((done) => { resolve = done; }));
    const pending = refreshTimelineEmptyState(ctx);
    markTimelineHasPosts(ctx);
    resolve({ data: [] });
    await pending;
    expect(ctx.timeline.isEmpty).toBe(false);
  });
  test('最後の投稿の削除後に再取得すると案内を表示する', async () => {
    const ctx = context();
    markTimelineHasPosts(ctx);
    chatApi.fetchPosts.mockResolvedValue({ data: [] });
    await refreshTimelineEmptyState(ctx);
    expect(ctx.timeline.isEmpty).toBe(true);
  });
  test('画面を離れた後の応答を反映しない', async () => {
    const ctx = context();
    ctx.canApplyTimelineRequest.mockReturnValue(false);
    chatApi.fetchPosts.mockResolvedValue({ data: [] });
    await refreshTimelineEmptyState(ctx);
    expect(ctx.timeline.isEmpty).toBe(null);
  });
});
