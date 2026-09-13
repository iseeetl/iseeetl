jest.mock('../../../../models/Chat', () => ({}));
jest.mock('../../../../utils/logger', () => ({ warn: jest.fn(), error: jest.fn(), info: jest.fn() }));
jest.mock('../../../../services/timeline/shared/timelineSerializer', () => jest.fn((value) => value));

const {
  classifyCurrentResult,
  classifyResultHistory,
  findCurrentResult,
  inspectAnalysisResult,
  resultKeyMatches,
  persistAnalysisResult,
} = require('../../../../services/analysis/result.service');

const snapshot = (overrides = {}) => ({
  sourceType: 'post',
  chatId: 'post-1',
  replyId: null,
  sourceRevision: 4,
  settingId: 'setting-1',
  settingRevision: 2,
  kind: 'conversation',
  triggerTag: { _id: 'tag-1' },
  ...overrides,
});

describe.each(['post', 'reply'])('%sの解析結果保存と通知', (sourceType) => {
  const Chat = require('../../../../models/Chat');
  const serializer = require('../../../../services/timeline/shared/timelineSerializer');
  const logger = require('../../../../utils/logger');

  test.each(['create', 'update'].flatMap((action) => ['populate', 'serialize', 'to', 'emit'].map((stage) => [action, stage])))(
    '%sの保存後に%sが失敗しても保存済み状態を返す', async (action, stage) => {
      const previous = supplement();
      previous.meta.analysis_source_revision = 3;
      const before = { room: 'room1', supplementaries: action === 'create' ? [] : [previous] };
      before.replies = [{ _id: 'reply-1', supplementaries: before.supplementaries }];
      Chat.findById = jest.fn(() => ({ lean: jest.fn().mockResolvedValue(before) }));
      const saved = { ...before, _id: 'post-1' };
      saved.populate = jest.fn().mockResolvedValue(saved);
      const fail = () => { throw new Error('publication failed'); };
      const emit = jest.fn();
      const io = { to: jest.fn(() => ({ emit })) };
      if (stage === 'populate') saved.populate.mockImplementation(fail);
      if (stage === 'serialize') serializer.mockImplementationOnce(fail);
      if (stage === 'to') io.to.mockImplementation(fail);
      if (stage === 'emit') emit.mockRejectedValue(new Error('publication failed'));
      Chat.findOneAndUpdate = jest.fn().mockResolvedValue(saved);
      const result = await persistAnalysisResult({
        snapshot: snapshot({ sourceType, replyId: sourceType === 'reply' ? 'reply-1' : null }),
        supplement: supplement(), io,
      });
      expect(result.status).toBe(action === 'create' ? 'created' : 'updated');
      expect(Chat.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith('[SOCKET] publication failed', {
        event: `${sourceType === 'reply' ? 'REPLY_' : ''}SUPPLEMENT_${action.toUpperCase()}`,
      });
    }
  );

  test('結果の保存自体が失敗した場合はエラーを返す', async () => {
    Chat.findById = jest.fn(() => ({ lean: jest.fn().mockResolvedValue({ supplementaries: [], replies: [{ _id: 'reply-1', supplementaries: [] }] }) }));
    Chat.findOneAndUpdate = jest.fn().mockRejectedValue(new Error('save failed'));
    const io = { to: jest.fn() };
    await expect(persistAnalysisResult({ snapshot: snapshot({ sourceType, replyId: 'reply-1' }), supplement: supplement(), io })).rejects.toThrow('save failed');
    expect(io.to).not.toHaveBeenCalled();
  });
});

const supplement = (overrides = {}) => ({
  _id: 'supplement-1',
  delete_flg: false,
  meta: {
    analysis_kind: 'conversation',
    analysis_trigger_tag: 'tag-1',
    analysis_setting: 'setting-1',
    analysis_setting_revision: 2,
    analysis_source_revision: 4,
  },
  ...overrides,
});

describe('AI解析結果の更新判定', () => {
  test('解析結果は種別と実行元のルームタグで識別し、結果ユーザや固定名は使わない', () => {
    expect(resultKeyMatches(supplement(), snapshot())).toBe(true);
    expect(resultKeyMatches(supplement(), snapshot({ kind: 'speech' }))).toBe(false);
    expect(resultKeyMatches(supplement(), snapshot({ triggerTag: { _id: 'tag-2' } }))).toBe(false);
  });

  test('解析対象と設定のリビジョンが同じなら重ねて更新しない', () => {
    expect(classifyCurrentResult(supplement(), snapshot())).toBe('idempotent');
  });

  test('削除済みの結果があれば自動で再作成しない', () => {
    const deleted = supplement({ delete_flg: true });
    expect(resultKeyMatches(deleted, snapshot())).toBe(true);
    expect(classifyCurrentResult(deleted, snapshot())).toBe('deleted');
    expect(findCurrentResult({ supplementaries: [deleted] }, snapshot())).toBe(deleted);
  });

  test('重複する履歴に新しい対象リビジョンがあれば、古い応答を採用しない', () => {
    const active = supplement();
    active.meta.analysis_source_revision = 2;
    const deletedNewer = supplement({ _id: 'deleted-1', delete_flg: true });
    deletedNewer.meta.analysis_source_revision = 5;

    expect(classifyResultHistory([active, deletedNewer], snapshot({ sourceRevision: 3 }))).toBe('stale');
  });

  test('古い削除履歴があっても有効な結果を更新する', () => {
    const active = supplement();
    active.meta.analysis_source_revision = 3;
    const deleted = supplement({ _id: 'deleted-1', delete_flg: true });
    deleted.meta.analysis_source_revision = 2;

    expect(classifyResultHistory([active, deleted], snapshot({ sourceRevision: 4 }))).toBe('update');
  });

  test('有効な結果が重複して特定できなければ更新を拒否する', () => {
    expect(classifyResultHistory([supplement(), supplement({ _id: 'supplement-2' })], snapshot())).toBe(
      'conflict'
    );
  });

  test('保存済みの対象リビジョンが新しい場合だけ受信した応答を古いと判定する', () => {
    const current = supplement();
    current.meta.analysis_source_revision = 5;
    expect(classifyCurrentResult(current, snapshot())).toBe('stale');

    current.meta.analysis_source_revision = 3;
    expect(classifyCurrentResult(current, snapshot())).toBe('update');
  });

  test('同じ解析対象で設定のリビジョンだけが異なる場合は後に届いた応答を採用する', () => {
    const current = supplement();
    current.meta.analysis_setting_revision = 3;
    expect(classifyCurrentResult(current, snapshot())).toBe('update');
  });

  test('投稿と返信それぞれの付加情報から現在の解析結果を取得する', () => {
    const hit = supplement();
    expect(findCurrentResult({ supplementaries: [hit] }, snapshot())).toBe(hit);
    expect(
      findCurrentResult(
        { replies: [{ _id: 'reply-1', supplementaries: [hit] }] },
        snapshot({ sourceType: 'reply', replyId: 'reply-1' })
      )
    ).toBe(hit);
  });

  test('保存済みの解析結果の状態を取得する', async () => {
    const Chat = require('../../../../models/Chat');
    Chat.findById = jest.fn(() => ({
      lean: jest.fn(async () => ({ supplementaries: [supplement()] })),
    }));
    await expect(inspectAnalysisResult(snapshot())).resolves.toBe('idempotent');
  });
});
