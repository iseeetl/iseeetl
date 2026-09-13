const Chat = require('../../../models/Chat');
const AppError = require('../../../utils/appError');
const {
  ANALYSIS_SOURCE_FIELDS,
  hasAnalysisSourceChanged,
  readAnalysisSourceRevision,
} = require('./analysisSourceRevision');
const {
  withAIAnalysisIntegrityLock,
} = require('../../analysis/settings/referenceIntegrity');

const MAX_CAS_ATTEMPTS = 5;

const invalidParams = () => new AppError({ code: 'INVALID_PARAMS' });

const findReply = (chat, replyId) =>
  (chat?.replies || []).find((reply) => String(reply?._id) === String(replyId));

const splitAnalysisSourceSet = (fields = {}) => {
  const sourceSet = {};
  const auxiliarySet = {};
  Object.entries(fields).forEach(([field, value]) => {
    if (ANALYSIS_SOURCE_FIELDS.includes(field)) sourceSet[field] = value;
    else auxiliarySet[field] = value;
  });
  return { sourceSet, auxiliarySet };
};

const assertStoredRevision = (source) => {
  const raw = source?.analysis_source_revision;
  let value;
  try {
    value = readAnalysisSourceRevision(source);
  } catch {
    throw invalidParams();
  }
  if (value >= Number.MAX_SAFE_INTEGER) throw invalidParams();
  return { value, missing: raw === undefined };
};

const buildExpectedRevisionCondition = (source, path = 'analysis_source_revision') => {
  const revision = assertStoredRevision(source);
  return revision.missing ? { [path]: { $exists: false } } : { [path]: revision.value };
};

const buildSetUpdate = (setFields) =>
  Object.keys(setFields).length ? { $set: setFields } : null;

const buildSourceCandidate = (latest, sourceSet) =>
  Object.fromEntries(
    ANALYSIS_SOURCE_FIELDS.map((field) => [
      field,
      Object.prototype.hasOwnProperty.call(sourceSet, field) ? sourceSet[field] : latest?.[field],
    ])
  );

const applyPostAuxiliarySet = async ({ baseQuery, auxiliarySet, fallbackDocument = null }) => {
  const update = buildSetUpdate(auxiliarySet);
  const document = update
    ? await Chat.findOneAndUpdate(baseQuery, update, { new: true, runValidators: true })
    : fallbackDocument || (await Chat.findOne(baseQuery));
  if (!document) throw invalidParams();
  return { document, sourceChanged: false };
};

const persistPostAnalysisSourceMutationUnlocked = async ({
  baseQuery,
  initialSource,
  desiredSource,
  setFields,
}) => {
  const { sourceSet, auxiliarySet } = splitAnalysisSourceSet(setFields);
  if (!hasAnalysisSourceChanged(initialSource, desiredSource)) {
    return applyPostAuxiliarySet({ baseQuery, auxiliarySet });
  }

  let latest = initialSource;
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    if (!latest) throw invalidParams();
    const expectedRevision = buildExpectedRevisionCondition(latest);
    if (!hasAnalysisSourceChanged(latest, buildSourceCandidate(latest, sourceSet))) {
      return applyPostAuxiliarySet({ baseQuery, auxiliarySet, fallbackDocument: latest });
    }

    const document = await Chat.findOneAndUpdate(
      { ...baseQuery, ...expectedRevision },
      {
        $set: { ...sourceSet, ...auxiliarySet },
        $inc: { analysis_source_revision: 1 },
      },
      { new: true, runValidators: true }
    );
    if (document) return { document, sourceChanged: true };
    latest = await Chat.findOne(baseQuery);
  }
  throw invalidParams();
};

const persistPostAnalysisSourceMutation = (options) =>
  withAIAnalysisIntegrityLock(() => persistPostAnalysisSourceMutationUnlocked(options));

const prefixSetFields = (fields, prefix) =>
  Object.fromEntries(Object.entries(fields).map(([field, value]) => [`${prefix}.${field}`, value]));

const applyReplyAuxiliarySet = async ({
  baseQuery,
  replyId,
  replyMatch = {},
  auxiliarySet,
  fallbackDocument = null,
}) => {
  const prefixedSet = prefixSetFields(auxiliarySet, 'replies.$[reply]');
  const update = buildSetUpdate(prefixedSet);
  if (!update) {
    const chat =
      fallbackDocument ||
      (await Chat.findOne({
        ...baseQuery,
        replies: { $elemMatch: { _id: replyId, delete_flg: false, ...replyMatch } },
      }));
    if (!chat) throw invalidParams();
    return { document: chat, sourceChanged: false };
  }
  const document = await Chat.findOneAndUpdate(
    {
      ...baseQuery,
      replies: { $elemMatch: { _id: replyId, delete_flg: false, ...replyMatch } },
    },
    update,
    {
      arrayFilters: [{
        'reply._id': replyId,
        'reply.delete_flg': false,
        ...prefixSetFields(replyMatch, 'reply'),
      }],
      new: true,
      runValidators: true,
    }
  );
  if (!document) throw invalidParams();
  return { document, sourceChanged: false };
};

const persistReplyAnalysisSourceMutationUnlocked = async ({
  baseQuery,
  replyId,
  initialSource,
  desiredSource,
  setFields,
  replyMatch = {},
}) => {
  const { sourceSet, auxiliarySet } = splitAnalysisSourceSet(setFields);
  if (!hasAnalysisSourceChanged(initialSource, desiredSource)) {
    return applyReplyAuxiliarySet({
      baseQuery,
      replyId,
      replyMatch,
      auxiliarySet,
    });
  }

  let latestReply = initialSource;
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    if (!latestReply || latestReply.delete_flg) throw invalidParams();
    const expectedRevision = buildExpectedRevisionCondition(latestReply);
    if (!hasAnalysisSourceChanged(
      latestReply,
      buildSourceCandidate(latestReply, sourceSet)
    )) {
      return applyReplyAuxiliarySet({ baseQuery, replyId, replyMatch, auxiliarySet });
    }

    const replyElemMatch = {
      _id: replyId,
      delete_flg: false,
      ...replyMatch,
      ...expectedRevision,
    };
    const arrayFilterRevision = buildExpectedRevisionCondition(
      latestReply,
      'reply.analysis_source_revision'
    );
    const document = await Chat.findOneAndUpdate(
      { ...baseQuery, replies: { $elemMatch: replyElemMatch } },
      {
        $set: {
          ...prefixSetFields(sourceSet, 'replies.$[reply]'),
          ...prefixSetFields(auxiliarySet, 'replies.$[reply]'),
        },
        $inc: { 'replies.$[reply].analysis_source_revision': 1 },
      },
      {
        arrayFilters: [
          {
            'reply._id': replyId,
            'reply.delete_flg': false,
            ...prefixSetFields(replyMatch, 'reply'),
            ...arrayFilterRevision,
          },
        ],
        new: true,
        runValidators: true,
      }
    );
    if (document) return { document, sourceChanged: true };
    const latestChat = await Chat.findOne({
      ...baseQuery,
      replies: { $elemMatch: { _id: replyId, delete_flg: false, ...replyMatch } },
    });
    if (!latestChat) throw invalidParams();
    latestReply = findReply(latestChat, replyId);
  }
  throw invalidParams();
};

const persistReplyAnalysisSourceMutation = (options) =>
  withAIAnalysisIntegrityLock(() => persistReplyAnalysisSourceMutationUnlocked(options));

module.exports = {
  assertStoredRevision,
  buildExpectedRevisionCondition,
  persistPostAnalysisSourceMutation,
  persistReplyAnalysisSourceMutation,
  splitAnalysisSourceSet,
};
