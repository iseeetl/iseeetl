const {
  TIMELINE_POPULATE_WITH_REACTIONS,
  TIMELINE_POPULATE_WITH_REPLIES,
} = require('../../../../../services/timeline/shared/chatPopulate');

describe('chatPopulateの検証', () => {
  test('リアクションの取得ではユーザ情報も展開する', () => {
    expect(TIMELINE_POPULATE_WITH_REACTIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'reactions.user', select: 'username image_name delete_flg' }),
        expect.objectContaining({ path: 'user', select: 'username image_name delete_flg' }),
      ])
    );
  });

  test('返信の取得では返信者を展開し、リアクションのユーザ情報は展開しない', () => {
    expect(TIMELINE_POPULATE_WITH_REPLIES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'replies.user', select: 'username image_name delete_flg' }),
        expect.objectContaining({ path: 'user', select: 'username image_name delete_flg' }),
      ])
    );
    const hasReactions = TIMELINE_POPULATE_WITH_REPLIES.some((item) => item.path === 'reactions.user');
    expect(hasReactions).toBe(false);
  });
});
