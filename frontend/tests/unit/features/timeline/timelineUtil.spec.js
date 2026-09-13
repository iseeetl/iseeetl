import { expect } from 'vitest';
import TimelineUtil from '@/features/timeline/timelineUtil';

describe('タイムラインの表示・検索の共通処理', () => {
  it('登録ユーザとゲストに応じて表示名を取得する', () => {
    expect(TimelineUtil.getUsernameOrGuestname({ user: { username: 'user' } })).to.equal('user');
    expect(TimelineUtil.getUsernameOrGuestname({ guest_name: 'guest' })).to.equal('guest');
  });

  it('isUserIconPresent は user.image_name を判定する', () => {
    expect(TimelineUtil.isUserIconPresent({ user: { image_name: 'img' } })).to.equal(true);
    expect(TimelineUtil.isUserIconPresent({ user: { image_name: '' } })).to.equal(false);
    expect(TimelineUtil.isUserIconPresent({})).to.equal(false);
  });

  it('constructImagePath はサムネイル優先でパスを生成する', () => {
    const img = TimelineUtil.constructImagePath('f1', 'r1', { image_thumbnail_name: 'thumb.jpg' });
    const org = TimelineUtil.constructImagePath('f1', 'r1', { image_name: 'orig.jpg' });

    expect(img).to.equal('/media/f1/r1/thumb.jpg');
    expect(org).to.equal('/media/f1/r1/orig.jpg');
  });

  it('tokenizeTimelineText は通常テキストと複数のhttp/https URLをトークン化する', () => {
    expect(TimelineUtil.tokenizeTimelineText('plain text')).to.deep.equal([{ type: 'text', value: 'plain text' }]);
    expect(TimelineUtil.tokenizeTimelineText('http://example.com と https://example.org/path')).to.deep.equal([
      { type: 'link', value: 'http://example.com', href: 'http://example.com' },
      { type: 'text', value: ' と ' },
      { type: 'link', value: 'https://example.org/path', href: 'https://example.org/path' },
    ]);
  });

  it('tokenizeTimelineText はURL直後の句読点と対応しない閉じ括弧をテキストへ残す', () => {
    expect(TimelineUtil.tokenizeTimelineText('（https://example.com/path）。')).to.deep.equal([
      { type: 'text', value: '（' },
      { type: 'link', value: 'https://example.com/path', href: 'https://example.com/path' },
      { type: 'text', value: '）。' },
    ]);
    expect(TimelineUtil.tokenizeTimelineText('https://example.com/a_(b).')).to.deep.equal([
      { type: 'link', value: 'https://example.com/a_(b)', href: 'https://example.com/a_(b)' },
      { type: 'text', value: '.' },
    ]);
  });

  it('tokenizeTimelineText は改行とHTMLらしい入力を通常テキストとして保持する', () => {
    const content = '<script>alert(1)</script>\nnext';

    expect(TimelineUtil.tokenizeTimelineText(content)).to.deep.equal([{ type: 'text', value: content }]);
  });

  it('tokenizeTimelineText はjavascript/data スキームをリンク化しない', () => {
    const content =
      'javascript:alert(1) data:text/html,test data:text/html,https://example.com javascript:https://example.org';

    expect(TimelineUtil.tokenizeTimelineText(content)).to.deep.equal([{ type: 'text', value: content }]);
  });

  it('tokenizeTimelineText は空文字列、null、undefinedを空トークンとして扱う', () => {
    expect(TimelineUtil.tokenizeTimelineText('')).to.deep.equal([]);
    expect(TimelineUtil.tokenizeTimelineText(null)).to.deep.equal([]);
    expect(TimelineUtil.tokenizeTimelineText(undefined)).to.deep.equal([]);
  });

  it('containsKeywords は or/and を判定する', () => {
    const data = { content: 'Hello world' };

    expect(TimelineUtil.containsKeywords(data, { keywordArray: ['hello', 'missing'], logicalOperator: 'or' })).to.equal(
      true
    );
    expect(TimelineUtil.containsKeywords(data, { keywordArray: ['hello', 'world'], logicalOperator: 'and' })).to.equal(
      true
    );
    expect(
      TimelineUtil.containsKeywords(data, { keywordArray: ['hello', 'missing'], logicalOperator: 'and' })
    ).to.equal(false);
  });

  it('登録ユーザとゲストに応じて名前の一致を判定する', () => {
    expect(TimelineUtil.isUserNameMatch({ user: { username: 'u' } }, { userName: 'u' })).to.equal(true);
    expect(TimelineUtil.isUserNameMatch({ guest_name: 'g' }, { userName: 'g' })).to.equal(true);
    expect(!!TimelineUtil.isUserNameMatch({}, { userName: 'u' })).to.equal(false);
  });

  it('hasTags は OR/AND の条件を判定する', () => {
    const data = { room_tags: ['t1', 't2'] };
    const orMatch = TimelineUtil.hasTags(data, { tags: ['t2', 't3'], tagSearchOperator: 'or' });
    const andMatch = TimelineUtil.hasTags(data, { tags: ['t1', 't2'], tagSearchOperator: 'and' });
    const andMiss = TimelineUtil.hasTags(data, { tags: ['t1', 't3'], tagSearchOperator: 'and' });

    expect(orMatch).to.equal(true);
    expect(andMatch).to.equal(true);
    expect(andMiss).to.equal(false);
  });

  it('hasNoTags は noTags フラグと空配列を判定する', () => {
    expect(TimelineUtil.hasNoTags({ room_tags: [] }, { noTags: true })).to.equal(true);
    expect(TimelineUtil.hasNoTags({ room_tags: ['t1'] }, { noTags: true })).to.equal(false);
  });

  it('hasAnimation はアニメーションの有無を判定する', () => {
    expect(TimelineUtil.hasAnimation({ animation: 'shake' }, { animation: true })).to.equal(true);
    expect(TimelineUtil.hasAnimation({ animation: null }, { animation: true })).to.equal(false);
  });

  it('doesDataMatchConditions はフィルタ条件と exclude を処理する', () => {
    const data = { content: 'hello', room_tags: [], animation: null };
    const hit = TimelineUtil.doesDataMatchConditions(data, { keywordArray: ['hello'], logicalOperator: 'or' });
    const excluded = TimelineUtil.doesDataMatchConditions(data, {
      keywordArray: ['hello'],
      logicalOperator: 'or',
      filterMode: 'exclude',
    });

    expect(hit).to.equal(true);
    expect(excluded).to.equal(false);
  });

  it('isPostOrReplyMatched は返信の一致を拾う', () => {
    const post = { content: 'post', replies: [{ content: 'reply' }] };
    const conditions = { keywordArray: ['reply'], logicalOperator: 'or' };

    expect(TimelineUtil.isPostOrReplyMatched(post, conditions)).to.equal(true);
  });

  it('isTagInRoomTags/getTagNameById はタグ情報を参照する', () => {
    const tags = [{ _id: 't1', name: 'Tag1' }];

    expect(TimelineUtil.isTagInRoomTags(tags, 't1')).to.equal(true);
    expect(TimelineUtil.getTagNameById(tags, 't1')).to.equal('Tag1');
    expect(TimelineUtil.getTagNameById(tags, 't2')).to.equal(null);
  });
});
