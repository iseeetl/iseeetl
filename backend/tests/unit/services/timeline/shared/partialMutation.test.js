const {
  buildMediaSnapshotMatch,
  buildSupplementMutation,
  mergeTimelinePatch,
} = require('../../../../../services/timeline/shared/partialMutation');

describe('タイムラインの部分更新の統合', () => {
  test('省略項目を現在値から補い、明示nullは保持する', () => {
    const current = { content: 'before', image_name: 'old.jpg', image_thumbnail_name: 'old_thumbnail.jpg' };
    const result = mergeTimelinePatch(current, { content: 'after', image_name: null, image_thumbnail_name: null });

    expect(result.content).toBe('after');
    expect(result.image_name).toBeNull();
    expect(result.image_thumbnail_name).toBeNull();
    expect(result.lang).toBeNull();
  });

  test('undefinedは省略として扱う', () => {
    expect(mergeTimelinePatch({ content: 'before' }, { content: undefined }).content).toBe('before');
  });
});

describe('付加情報の部分更新データ生成', () => {
  test('指定項目と翻訳の消去だけを入れ子の$setへ含める', () => {
    const updatedAt = 1_725_408_000_000;
    const current = {
      content: 'before',
      lang: 'ja',
      reactions: [{ type: 'like' }],
      translations: [{ lang: 'en', content: 'before' }],
      image_name: 'old.jpg',
    };
    const updated = {
      ...current,
      content: 'after',
      translations: [],
      updated_at: updatedAt,
    };

    const result = buildSupplementMutation({
      current,
      patch: { content: 'after' },
      updated,
      targetPath: 'supplementaries.$[supplement]',
      derivedFields: ['translations'],
    });

    expect(result.set).toEqual({
      'supplementaries.$[supplement].updated_at': updatedAt,
      'supplementaries.$[supplement].content': 'after',
      'supplementaries.$[supplement].translations': [],
    });
    expect(result.snapshotMatch).toEqual({ content: 'before', lang: 'ja' });
    expect(Object.keys(result.set)).not.toContain('supplementaries.$[supplement].reactions');
    expect(Object.keys(result.set)).not.toContain('supplementaries.$[supplement].lang');
    expect(Object.keys(result.set)).not.toContain('supplementaries.$[supplement].image_name');
  });

  test('メディア更新に伴う消去を保存し、組み合わせを検証したファイル項目を競合条件へ含める', () => {
    const current = {
      image_name: 'old.jpg',
      image_thumbnail_name: 'old_thumbnail.jpg',
      video_name: null,
      video_thumbnail_name: null,
      video_subtitle_originalname: null,
      video_subtitle_name: null,
      audio_name: null,
    };
    const updated = {
      ...current,
      image_name: null,
      image_thumbnail_name: null,
      image_caption: null,
      updated_at: 123,
    };

    const result = buildSupplementMutation({
      current,
      patch: {
        image_name: null,
        image_thumbnail_name: null,
        image_caption: null,
      },
      updated,
      targetPath: 'replies.$[reply].supplementaries.$[supplement]',
    });

    expect(result.set).toEqual({
      'replies.$[reply].supplementaries.$[supplement].updated_at': 123,
      'replies.$[reply].supplementaries.$[supplement].image_name': null,
      'replies.$[reply].supplementaries.$[supplement].image_thumbnail_name': null,
      'replies.$[reply].supplementaries.$[supplement].image_caption': null,
    });
    expect(result.snapshotMatch).toEqual({
      image_name: 'old.jpg',
      image_thumbnail_name: 'old_thumbnail.jpg',
      image_caption: null,
      video_name: null,
      video_thumbnail_name: null,
      video_subtitle_originalname: null,
      video_subtitle_name: null,
      audio_name: null,
    });
  });

  test('undefinedと未指定項目を更新・競合条件へ含めない', () => {
    const result = buildSupplementMutation({
      current: { content: 'before', lang: 'ja' },
      patch: { content: undefined, lang: 'en' },
      updated: { content: 'before', lang: 'en', updated_at: 456 },
      targetPath: 'supplementaries.$[supplement]',
    });

    expect(result.set).toEqual({
      'supplementaries.$[supplement].updated_at': 456,
      'supplementaries.$[supplement].lang': 'en',
    });
    expect(result.snapshotMatch).toEqual({ lang: 'ja' });
  });
});

describe('メディア更新の競合条件生成', () => {
  test('メディア更新時は検証した全グループ状態を競合条件へ含める', () => {
    const current = {
      image_name: 'old.jpg',
      image_thumbnail_name: 'old_thumbnail.jpg',
      image_caption: 'old caption',
      video_name: null,
      video_thumbnail_name: null,
      video_subtitle_originalname: null,
      video_subtitle_name: null,
      audio_name: null,
      audio_title: null,
      audio_description: null,
    };

    expect(buildMediaSnapshotMatch(current, { image_caption: 'new caption' })).toEqual(current);
  });

  test('メディアを更新しない場合は競合条件を追加しない', () => {
    expect(buildMediaSnapshotMatch({ image_name: 'old.jpg' }, { content: 'new' })).toEqual({});
  });
});
