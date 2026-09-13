const AppError = require('../../utils/appError');
const createOpenAIAudioClient = require('../../integrations/openai/audio.client');
const { DEFAULT_CODE_BY_STATUS } = require('../../utils/errorResponse');
const { getOpenAIConfig, isOpenAITranscriptionEnabled } = require('../../config/featureFlags');

const { authorizeRoomAccess } = require('../room/roomAccess.service');

let audioClient = null;

const getAudioClient = () => {
  if (!isOpenAITranscriptionEnabled()) {
    throw new AppError({
      code: 'EXTERNAL_FEATURE_DISABLED',
      details: { feature: 'openaiTranscription' },
    });
  }
  if (!audioClient) {
    const config = getOpenAIConfig();
    audioClient = createOpenAIAudioClient({
      apiKey: config.apiKey,
      model: config.models.speech,
    });
  }
  return audioClient;
};

// memoryStorageで受け取った音声のbuffer・mimetype・originalnameを使い、文字起こし結果を文字列で返す。
// bodyで対象ルームと任意の音声言語を指定し、jwtPayloadでルームへのアクセス権を確認する。
exports.transcribeBuffer = async (file, body, jwtPayload) => {
  if (!isOpenAITranscriptionEnabled()) {
    throw new AppError({
      code: 'EXTERNAL_FEATURE_DISABLED',
      details: { feature: 'openaiTranscription' },
    });
  }

  const roomId = body.room_id;
  const lang = body.lang;
  const decodedUserId = jwtPayload.user_id;
  const decodedUserRole = jwtPayload.user_role;

  await authorizeRoomAccess(
    decodedUserId,
    decodedUserRole,
    roomId,
    {
      errors: {
        user: { code: 'INVALID_PERMISSION' },
        room: { code: 'INVALID_PARAMS' },
        floor: { code: 'INVALID_PARAMS' },
        kicked: { code: 'INVALID_PERMISSION' },
        permission: { code: 'INVALID_PERMISSION' },
      },
    }
  );
  const client = getAudioClient();

  try {
    const text = await client.transcribeFromBuffer({
      buffer: file.buffer,
      mimetype: file.mimetype,
      filename: file.originalname,
      language: lang,
    });

    return text;
  } catch (err) {
    if (err instanceof AppError) throw err;
    const status = err?.status;
    const code = status && status !== 500 && DEFAULT_CODE_BY_STATUS[status] ? DEFAULT_CODE_BY_STATUS[status] : 'TRANSCRIPTION_FAILED';
    throw new AppError({ code });
  }
};
