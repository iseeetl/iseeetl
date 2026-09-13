const {
  areRoomTagSetsEqual,
  buildNestedRevisionGuard,
  buildRevisionGuard,
  hasAnalysisSourceChanged,
  readAnalysisSourceRevision,
} = require('../../../../../services/timeline/shared/analysisSourceRevision');

describe('AI解析対象のリビジョン管理', () => {
  const source = {
    content: '本文',
    lang: 'ja',
    room_tags: [{ _id: 'tag-b' }, 'tag-a'],
    image_name: 'image.jpg',
    video_name: null,
    audio_name: null,
    image_thumbnail_name: 'thumb.jpg',
  };

  test('AI 外部サービス入力6要素の実変更だけを検出する', () => {
    expect(hasAnalysisSourceChanged(source, { ...source, content: '変更' })).toBe(true);
    expect(hasAnalysisSourceChanged(source, { ...source, lang: 'en' })).toBe(true);
    expect(hasAnalysisSourceChanged(source, { ...source, room_tags: ['tag-a', 'tag-c'] })).toBe(true);
    expect(hasAnalysisSourceChanged(source, { ...source, image_name: 'other.jpg' })).toBe(true);
    expect(hasAnalysisSourceChanged(source, { ...source, video_name: 'movie.mp4' })).toBe(true);
    expect(hasAnalysisSourceChanged(source, { ...source, audio_name: 'voice.mp3' })).toBe(true);
  });

  test('タグ順序・重複とthumbnail/caption等の表示用項目差は無視する', () => {
    expect(areRoomTagSetsEqual(source.room_tags, ['tag-a', 'tag-b', 'tag-a'])).toBe(true);
    expect(
      hasAnalysisSourceChanged(source, {
        ...source,
        room_tags: ['tag-a', 'tag-b'],
        image_thumbnail_name: 'other-thumb.jpg',
        image_caption: 'caption',
        video_thumbnail_name: 'video-thumb.jpg',
        audio_title: 'title',
        audio_description: 'description',
      })
    ).toBe(false);
  });

  test('旧レコードのリビジョン欠落は0として読む', () => {
    expect(readAnalysisSourceRevision({})).toBe(0);
    expect(readAnalysisSourceRevision({ analysis_source_revision: 4 })).toBe(4);
    expect(() => readAnalysisSourceRevision({ analysis_source_revision: 1.5 })).toThrow(RangeError);
    expect(() =>
      readAnalysisSourceRevision({ analysis_source_revision: Number.MAX_SAFE_INTEGER + 1 })
    ).toThrow(RangeError);
  });

  test('リビジョンの一括増加は未設定またはMAX_SAFE_INTEGER未満の場合だけ許可する', () => {
    expect(buildRevisionGuard()).toEqual({
      $or: [
        { analysis_source_revision: { $exists: false } },
        {
          analysis_source_revision: {
            $type: 'number',
            $gte: 0,
            $lt: Number.MAX_SAFE_INTEGER,
            $mod: [1, 0],
          },
        },
      ],
    });
    expect(buildNestedRevisionGuard('reply')).toEqual({
      $or: [
        { 'reply.analysis_source_revision': { $exists: false } },
        {
          'reply.analysis_source_revision': {
            $type: 'number',
            $gte: 0,
            $lt: Number.MAX_SAFE_INTEGER,
            $mod: [1, 0],
          },
        },
      ],
    });
  });
});
