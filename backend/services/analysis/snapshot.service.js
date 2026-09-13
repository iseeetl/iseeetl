const Chat = require('../../models/Chat');
const Floor = require('../../models/Floor');
const Room = require('../../models/Room');
const RoomAIAnalysisSetting = require('../../models/RoomAIAnalysisSetting');
const RoomTag = require('../../models/RoomTag');
const User = require('../../models/User');
const { ANALYSIS_KINDS } = require('../../constants/aiAnalysisSettings');
const { readAnalysisSourceRevision } = require('../timeline/shared/analysisSourceRevision');

const normalizeId = (value) => String(value?._id || value || '');

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
};

const findReply = (chat, replyId) =>
  (chat?.replies || []).find((reply) => normalizeId(reply) === normalizeId(replyId));

const resolveSourceState = (chat, { sourceType, replyId }) => {
  if (!chat || chat.delete_flg) return null;
  if (sourceType === 'post') return { chat, source: chat };
  if (sourceType !== 'reply') return null;
  const reply = findReply(chat, replyId);
  if (!reply || reply.delete_flg) return null;
  return { chat, source: reply };
};

const sourceSupportsKind = (source, kind) => {
  if (kind === 'vision') return !!source?.image_name;
  if (kind === 'video') return !!source?.video_name;
  if (kind === 'audioScene' || kind === 'speech') {
    return !!source?.audio_name || !!source?.video_name;
  }
  if (kind === 'conversation') {
    return typeof source?.content === 'string' && source.content.trim() !== '';
  }
  return false;
};

const readSafeSourceRevision = (source) => {
  try {
    return readAnalysisSourceRevision(source);
  } catch {
    return null;
  }
};

const loadSource = async ({ chatId, sourceType, replyId }) => {
  const chat = await Chat.findOne({ _id: chatId, delete_flg: false }).lean();
  return resolveSourceState(chat, { sourceType, replyId });
};

const listMatchingAnalysisSettingIds = async ({
  chatId,
  sourceType,
  replyId = null,
  kinds = null,
}) => {
  const resolved = await loadSource({ chatId, sourceType, replyId });
  if (!resolved) return [];
  const tagIds = (resolved.source.room_tags || []).map(normalizeId).filter(Boolean);
  if (tagIds.length === 0) return [];

  const filter = {
    floor: resolved.chat.floor,
    room: resolved.chat.room,
    room_tag: { $in: tagIds },
    delete_flg: false,
  };
  if (Array.isArray(kinds)) filter.analysis_kind = { $in: kinds };
  const settings = await RoomAIAnalysisSetting.find(filter)
    .sort({ room_tag: 1, analysis_kind: 1, _id: 1 })
    .select('_id')
    .lean();
  return settings.map((setting) => normalizeId(setting)).filter(Boolean);
};

const buildAnalysisSnapshot = async ({ chatId, sourceType, replyId = null, settingId }) => {
  const [resolved, setting] = await Promise.all([
    loadSource({ chatId, sourceType, replyId }),
    RoomAIAnalysisSetting.findOne({ _id: settingId, delete_flg: false }).lean(),
  ]);
  if (!resolved || !setting || !ANALYSIS_KINDS.includes(setting.analysis_kind)) return null;
  if (!Number.isSafeInteger(setting.revision) || setting.revision < 1) return null;

  const { chat, source } = resolved;
  const sourceRevision = readSafeSourceRevision(source);
  if (sourceRevision === null || !sourceSupportsKind(source, setting.analysis_kind)) return null;

  const sourceTagIds = new Set((source.room_tags || []).map(normalizeId));
  if (!sourceTagIds.has(normalizeId(setting.room_tag))) return null;
  if (
    normalizeId(setting.floor) !== normalizeId(chat.floor) ||
    normalizeId(setting.room) !== normalizeId(chat.room)
  ) {
    return null;
  }

  const [tag, resultUser, room, floor] = await Promise.all([
    RoomTag.findOne({
      _id: setting.room_tag,
      floor: chat.floor,
      room: chat.room,
      delete_flg: false,
    }).lean(),
    User.findOne({ _id: setting.result_user, delete_flg: false }).select('_id').lean(),
    Room.findOne({ _id: chat.room, floor: chat.floor, delete_flg: false }).select('_id floor').lean(),
    Floor.findOne({ _id: chat.floor, delete_flg: false }).select('_id target_langs').lean(),
  ]);
  if (!tag || !resultUser || !room || !floor || normalizeId(room.floor) !== normalizeId(floor)) {
    return null;
  }

  const sourceLang = source.lang || chat.lang || 'ja';
  const snapshot = {
    sourceType,
    chatId: normalizeId(chat),
    replyId: sourceType === 'reply' ? normalizeId(source) : null,
    sourceRevision,
    settingId: normalizeId(setting),
    settingRevision: setting.revision,
    kind: setting.analysis_kind,
    prompt: setting.additional_prompt || '',
    resultUserId: normalizeId(resultUser),
    triggerTag: {
      _id: normalizeId(tag),
      name: tag.name,
      lang: tag.lang || null,
      translations: (tag.translations || []).map((translation) => ({
        lang: translation.lang,
        name: translation.name,
      })),
    },
    targetLangs: [...new Set((floor.target_langs || []).filter((lang) => typeof lang === 'string' && lang))],
    source: {
      _id: normalizeId(source),
      floor: normalizeId(chat.floor),
      room: normalizeId(chat.room),
      content: source.content || '',
      lang: sourceLang,
      image_name: source.image_name || null,
      video_name: source.video_name || null,
      audio_name: source.audio_name || null,
    },
  };
  return deepFreeze(snapshot);
};

module.exports = {
  buildAnalysisSnapshot,
  deepFreeze,
  listMatchingAnalysisSettingIds,
  normalizeId,
  resolveSourceState,
  sourceSupportsKind,
};
