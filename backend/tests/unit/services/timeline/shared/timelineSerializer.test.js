const serializeTimeline = require('../../../../../services/timeline/shared/timelineSerializer');
const { serializeTimelineForPublic } = serializeTimeline;

describe('タイムラインの公開データ変換', () => {
  const makeData = () => ({
    id: 1,
    analysis_source_revision: 8,
    replies: [
      {
        id: 11,
        delete_flg: false,
        analysis_source_revision: 3,
        supplementaries: [
          {
            id: 111,
            delete_flg: false,
            meta: {
              analysis_kind: 'vision',
              analysis_setting: 'setting-1',
              analysis_setting_revision: 2,
              analysis_trigger_tag: 'tag-1',
              analysis_source_revision: 3,
            },
          },
        ],
      },
      { id: 12, delete_flg: true, supplementaries: [{ id: 121, delete_flg: false }] },
      {
        id: 13,
        delete_flg: false,
        supplementaries: [
          { id: 131, delete_flg: true },
          { id: 132, delete_flg: false, meta: { analysis_kind: 'speech' } },
        ],
      },
    ],
    supplementaries: [
      { id: 21, delete_flg: false, meta: { analysis_kind: 'conversation' } },
      { id: 22, delete_flg: true },
    ],
  });

  test('削除済みの子データとAI内部項目を公開データから除外する', () => {
    const result = serializeTimeline(makeData());

    expect(result.analysis_source_revision).toBeUndefined();
    expect(result.replies.map((reply) => reply.id)).toEqual([11, 13]);
    expect(result.replies[0].analysis_source_revision).toBeUndefined();
    expect(result.replies[0].supplementaries[0].meta).toBeUndefined();
    expect(result.replies[1].supplementaries).toEqual([
      expect.objectContaining({ id: 132, delete_flg: false }),
    ]);
    expect(result.replies[1].supplementaries[0].meta).toBeUndefined();
    expect(result.supplementaries).toEqual([
      expect.objectContaining({ id: 21, delete_flg: false }),
    ]);
    expect(result.supplementaries[0].meta).toBeUndefined();
  });

  test('通常のオブジェクトを変更せず、独立した公開データを返す', () => {
    const source = makeData();
    const snapshot = structuredClone(source);
    const result = serializeTimeline(source);

    expect(result).not.toBe(source);
    expect(result.replies[0]).not.toBe(source.replies[0]);
    expect(source).toEqual(snapshot);
  });

  test('Mongoose形式のデータはtoObjectの結果だけを変換し、元データを変更しない', () => {
    const plain = makeData();
    const document = {
      marker: 'document',
      toObject: jest.fn(() => plain),
    };

    const result = serializeTimeline(document);

    expect(document.toObject).toHaveBeenCalledWith({ depopulate: false, flattenMaps: true });
    expect(document).toEqual(expect.objectContaining({ marker: 'document' }));
    expect(plain.replies).toHaveLength(3);
    expect(result.replies).toHaveLength(2);
  });

  test('管理画面用の変換は削除状態を維持し、内部項目だけを除外する', () => {
    const source = makeData();
    const result = serializeTimelineForPublic(source, { preserveDeleted: true });

    expect(result.replies).toHaveLength(3);
    expect(result.replies[1].delete_flg).toBe(true);
    expect(result.replies[2].supplementaries).toHaveLength(2);
    expect(result.analysis_source_revision).toBeUndefined();
    expect(result.replies[0].supplementaries[0].meta).toBeUndefined();
    expect(source.analysis_source_revision).toBe(8);
  });

  test('配列と対象プロパティがないデータも安全に変換する', () => {
    expect(serializeTimeline([{ id: 1 }, { id: 2 }])).toEqual([{ id: 1 }, { id: 2 }]);
    expect(serializeTimeline(null)).toBeNull();
  });
});
