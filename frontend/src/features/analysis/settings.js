const ANALYSIS_KINDS = Object.freeze([
  'vision',
  'audioScene',
  'speech',
  'video',
  'conversation',
]);

const MAX_ADDITIONAL_PROMPT_CODE_POINTS = 2000;
const MAX_ADDITIONAL_PROMPT_BYTES = 8000;
const MAX_SPEECH_PROMPT_BYTES = 224;

const utf8ByteLength = (value) => new TextEncoder().encode(value).length;

const normalizeAdditionalPrompt = (value) => {
  if (typeof value !== 'string') return value;
  return value.normalize('NFC').trim();
};

const validateAnalysisKind = (value) => ANALYSIS_KINDS.includes(value);

const validateAdditionalPrompt = (value, analysisKind) => {
  const normalized = normalizeAdditionalPrompt(value);
  if (typeof normalized !== 'string') {
    return {
      valid: false,
      value: normalized,
      codePoints: 0,
      bytes: 0,
      error: 'invalidType',
    };
  }

  const codePoints = [...normalized].length;
  const bytes = utf8ByteLength(normalized);
  let error = null;
  if (codePoints > MAX_ADDITIONAL_PROMPT_CODE_POINTS) {
    error = 'tooManyCodePoints';
  } else if (bytes > MAX_ADDITIONAL_PROMPT_BYTES) {
    error = 'tooManyBytes';
  } else if (analysisKind === 'speech' && bytes > MAX_SPEECH_PROMPT_BYTES) {
    error = 'speechTooManyBytes';
  }

  return {
    valid: error === null,
    value: normalized,
    codePoints,
    bytes,
    error,
  };
};

const buildSettingPayload = ({
  scope,
  form,
  floorId,
  roomId,
}) => {
  if (!['common', 'floor', 'room'].includes(scope)) {
    throw new TypeError(`Unsupported AI analysis setting scope: ${scope}`);
  }
  if (!form || typeof form !== 'object') {
    throw new TypeError('AI analysis setting form is required');
  }

  const payload = {};
  if (form._id) {
    payload._id = form._id;
  }
  if (scope === 'floor' || scope === 'room') {
    payload.floor_id = floorId;
  }
  if (scope === 'room') {
    payload.room_id = roomId;
  }
  const tagField = scope === 'common' ? 'category_tag' : scope === 'floor' ? 'floor_tag' : 'room_tag';
  payload[tagField] = form.tagId;
  payload.analysis_kind = form.analysisKind;
  payload.additional_prompt = normalizeAdditionalPrompt(form.additionalPrompt);
  payload.result_user = form.resultUserId;
  if (form._id) {
    payload.revision = form.revision;
  }
  return payload;
};

const isRevisionConflict = (error) => {
  const status = error?.response?.status;
  const code = error?.response?.data?.error?.code || error?.response?.data?.code;
  return status === 409 || code === 'CONFLICT';
};

export {
  ANALYSIS_KINDS,
  MAX_ADDITIONAL_PROMPT_BYTES,
  MAX_ADDITIONAL_PROMPT_CODE_POINTS,
  MAX_SPEECH_PROMPT_BYTES,
  buildSettingPayload,
  isRevisionConflict,
  normalizeAdditionalPrompt,
  utf8ByteLength,
  validateAdditionalPrompt,
  validateAnalysisKind,
};
