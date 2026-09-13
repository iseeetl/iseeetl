const mongoose = require('mongoose');

const Chat = require('../../models/Chat');
const defaultLogger = require('../../utils/logger');
const { withKeyedLock } = require('../../utils/keyedLock');
const serializeTimeline = require('../timeline/shared/timelineSerializer');
const { publishSocketEvent } = require('../../socket/publication');

const MAX_CAS_ATTEMPTS = 3;
const POPULATE_FULL = [
  ['user', 'username image_name delete_flg'],
  ['replies.user', 'username image_name delete_flg'],
  ['replies.supplementaries.user', 'username image_name delete_flg'],
  ['supplementaries.user', 'username image_name delete_flg'],
];

const normalizeId = (value) => String(value?._id || value || '');

const resultKeyMatches = (supplement, snapshot) =>
  supplement?.meta?.analysis_kind === snapshot.kind &&
  normalizeId(supplement?.meta?.analysis_trigger_tag) === snapshot.triggerTag._id;

const findReply = (chat, replyId) =>
  (chat?.replies || []).find((reply) => normalizeId(reply) === normalizeId(replyId));

const findMatchingResults = (chat, snapshot) => {
  const source = snapshot.sourceType === 'reply' ? findReply(chat, snapshot.replyId) : chat;
  return (source?.supplementaries || []).filter((supplement) =>
    resultKeyMatches(supplement, snapshot)
  );
};

const findCurrentResult = (chat, snapshot) => {
  const matches = findMatchingResults(chat, snapshot);
  return matches.find((supplement) => !supplement.delete_flg) || matches[0] || null;
};

const classifyCurrentResult = (current, snapshot) => {
  if (!current) return 'create';
  if (current.delete_flg) return 'deleted';
  const sourceRevision = current.meta?.analysis_source_revision;
  if (!Number.isSafeInteger(sourceRevision) || sourceRevision < 0) return 'conflict';
  if (sourceRevision > snapshot.sourceRevision) return 'stale';
  if (
    sourceRevision === snapshot.sourceRevision &&
    current.meta?.analysis_setting_revision === snapshot.settingRevision &&
    normalizeId(current.meta?.analysis_setting) === snapshot.settingId
  ) {
    return 'idempotent';
  }
  return 'update';
};

const classifyResultHistory = (matches, snapshot) => {
  const savedRevisions = matches
    .map((supplement) => supplement?.meta?.analysis_source_revision)
    .filter((revision) => Number.isSafeInteger(revision) && revision >= 0);
  if (savedRevisions.some((revision) => revision > snapshot.sourceRevision)) return 'stale';
  const active = matches.filter((supplement) => !supplement.delete_flg);
  if (active.length === 0) return matches.length > 0 ? 'deleted' : 'create';
  if (active.length > 1) return 'conflict';
  return classifyCurrentResult(active[0], snapshot);
};

const inspectAnalysisResult = async (snapshot) => {
  const chat = await Chat.findById(snapshot.chatId).lean();
  if (!chat || (snapshot.sourceType === 'reply' && !findReply(chat, snapshot.replyId))) {
    return 'missing-source';
  }
  return classifyResultHistory(findMatchingResults(chat, snapshot), snapshot);
};

const buildStoredSupplement = (supplement) => ({
  _id: new mongoose.Types.ObjectId(),
  ...supplement,
  reactions: [],
  created_at: new Date(),
  updated_at: null,
  deleted_at: null,
  delete_flg: false,
});

const buildResultKeyQuery = (snapshot) => ({
  'meta.analysis_kind': snapshot.kind,
  'meta.analysis_trigger_tag': snapshot.triggerTag._id,
});

const createResult = async ({ snapshot, supplement }) => {
  const stored = buildStoredSupplement(supplement);
  const noCurrentResult = { $not: { $elemMatch: buildResultKeyQuery(snapshot) } };
  if (snapshot.sourceType === 'post') {
    const updated = await Chat.findOneAndUpdate(
      { _id: snapshot.chatId, supplementaries: noCurrentResult },
      { $push: { supplementaries: stored } },
      { new: true, runValidators: true }
    );
    return { updated, supplementId: normalizeId(stored) };
  }

  const updated = await Chat.findOneAndUpdate(
    {
      _id: snapshot.chatId,
      replies: {
        $elemMatch: {
          _id: snapshot.replyId,
          supplementaries: noCurrentResult,
        },
      },
    },
    { $push: { 'replies.$[reply].supplementaries': stored } },
    {
      arrayFilters: [{ 'reply._id': snapshot.replyId }],
      new: true,
      runValidators: true,
    }
  );
  return { updated, supplementId: normalizeId(stored) };
};

const buildCurrentResultFilter = (current, snapshot) => ({
  'result._id': current._id,
  'result.delete_flg': false,
  'result.meta.analysis_kind': snapshot.kind,
  'result.meta.analysis_trigger_tag': snapshot.triggerTag._id,
  'result.meta.analysis_setting': current.meta.analysis_setting,
  'result.meta.analysis_setting_revision': current.meta.analysis_setting_revision,
  'result.meta.analysis_source_revision': current.meta.analysis_source_revision,
});

const buildResultSet = (prefix, supplement) => ({
  [`${prefix}.user`]: supplement.user,
  [`${prefix}.lang`]: supplement.lang,
  [`${prefix}.content`]: supplement.content,
  [`${prefix}.translations`]: supplement.translations,
  [`${prefix}.meta`]: supplement.meta,
  [`${prefix}.updated_at`]: new Date(),
});

const updateResult = async ({ current, snapshot, supplement }) => {
  const resultFilter = buildCurrentResultFilter(current, snapshot);
  if (snapshot.sourceType === 'post') {
    return Chat.findOneAndUpdate(
      { _id: snapshot.chatId, supplementaries: { $elemMatch: { _id: current._id } } },
      { $set: buildResultSet('supplementaries.$[result]', supplement) },
      { arrayFilters: [resultFilter], new: true, runValidators: true }
    );
  }
  return Chat.findOneAndUpdate(
    {
      _id: snapshot.chatId,
      replies: { $elemMatch: { _id: snapshot.replyId } },
    },
    { $set: buildResultSet('replies.$[reply].supplementaries.$[result]', supplement) },
    {
      arrayFilters: [{ 'reply._id': snapshot.replyId }, resultFilter],
      new: true,
      runValidators: true,
    }
  );
};

const populateForPublic = async (chat) => {
  if (!chat) return null;
  if (typeof chat.populate !== 'function') return chat;
  let populated = chat;
  for (const [path, select] of POPULATE_FULL) populated = await populated.populate(path, select);
  return populated;
};

const emitResult = async ({ updated, supplementId, snapshot, io, eventType }) => {
  const event = `${snapshot.sourceType === 'post' ? '' : 'REPLY_'}SUPPLEMENT_${eventType === 'create' ? 'CREATE' : 'UPDATE'}`;
  let cleaned = null;
  await publishSocketEvent(event, async () => {
    const populated = await populateForPublic(updated);
    cleaned = serializeTimeline(populated);
    if (!io || !cleaned?.room) return cleaned;
    const roomId = normalizeId(cleaned.room);
    if (snapshot.sourceType === 'post') {
      return io.to(roomId).emit(event, cleaned);
    }
    if (eventType === 'create') {
      const reply = (cleaned.replies || []).find((entry) => normalizeId(entry) === snapshot.replyId);
      const created = (reply?.supplementaries || []).find((entry) => normalizeId(entry) === supplementId) || null;
      return io.to(roomId).emit(event, cleaned, created);
    } else {
      return io.to(roomId).emit(event, cleaned);
    }
  });
  return cleaned;
};

const persistAnalysisResult = async ({
  snapshot,
  supplement,
  io,
  logger = defaultLogger,
}) =>
  withKeyedLock(
    `analysis-result:${snapshot.sourceType}:${snapshot.chatId}:${snapshot.replyId || ''}:${snapshot.kind}:${snapshot.triggerTag._id}`,
    async () => {
      for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
        const chat = await Chat.findById(snapshot.chatId).lean();
        if (!chat || (snapshot.sourceType === 'reply' && !findReply(chat, snapshot.replyId))) {
          return { status: 'missing-source', value: null };
        }
        const matches = findMatchingResults(chat, snapshot);
        const current = matches.find((supplement) => !supplement.delete_flg) || null;
        const action = classifyResultHistory(matches, snapshot);
        if (action === 'stale') {
          logger.info('AI_ANALYSIS_RESULT_STALE', {
            source_type: snapshot.sourceType,
            source_id: snapshot.source._id,
            setting_id: snapshot.settingId,
            kind: snapshot.kind,
            source_revision: snapshot.sourceRevision,
          });
          return { status: 'stale', value: null };
        }
        if (action === 'idempotent') return { status: 'idempotent', value: null };
        if (action === 'deleted') return { status: 'deleted', value: null };
        if (action === 'conflict') return { status: 'conflict', value: null };

        if (action === 'create') {
          const created = await createResult({ snapshot, supplement });
          if (!created.updated) continue;
          const value = await emitResult({
            updated: created.updated,
            supplementId: created.supplementId,
            snapshot,
            io,
            eventType: 'create',
          });
          return { status: 'created', value };
        }

        const updated = await updateResult({ current, snapshot, supplement });
        if (!updated) continue;
        const value = await emitResult({
          updated,
          supplementId: normalizeId(current),
          snapshot,
          io,
          eventType: 'update',
        });
        return { status: 'updated', value };
      }
      return { status: 'conflict', value: null };
    }
  );

module.exports = {
  classifyCurrentResult,
  classifyResultHistory,
  findCurrentResult,
  findMatchingResults,
  inspectAnalysisResult,
  persistAnalysisResult,
  resultKeyMatches,
};
