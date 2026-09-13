const Messages = require('./messages');

const ERROR_CATALOG = {
  INVALID_PARAMS: { status: 400, message: Messages.INVALID_PARAMS },
  INVALID_PERMISSION: { status: 401, message: Messages.INVALID_PERMISSION },
  UNAUTHORIZED: { status: 401, message: Messages.UNAUTHORIZED },
  VALIDATION_ERROR: { status: 422, message: Messages.VALIDATION_ERROR },
  RATE_LIMIT_EXCEEDED: { status: 429, message: Messages.RATE_LIMIT_EXCEEDED },
  PAYLOAD_TOO_LARGE: { status: 413, message: Messages.PAYLOAD_TOO_LARGE },
  INTERNAL_SERVER_ERROR: { status: 500, message: Messages.INTERNAL_SERVER_ERROR },
  NO_UPDATABLE_FIELD: { status: 400, message: Messages.NO_UPDATABLE_FIELD },
  PARAMETERS_ARE_WRONG: { status: 400, message: Messages.PARAMETERS_ARE_WRONG },
  LINE_LOGIN_NOT_CONFIGURED: { status: 500, message: Messages.LINE_LOGIN_NOT_CONFIGURED },
  GOOGLE_LOGIN_NOT_CONFIGURED: { status: 500, message: Messages.GOOGLE_LOGIN_NOT_CONFIGURED },
  OPENAI_NOT_CONFIGURED: { status: 503, message: Messages.OPENAI_NOT_CONFIGURED },
  EXTERNAL_FEATURE_DISABLED: { status: 503, message: Messages.EXTERNAL_FEATURE_DISABLED },
  TRANSCRIPTION_FAILED: { status: 500, message: Messages.TRANSCRIPTION_FAILED },
  FILE_UPLOAD_ERROR: { status: 500, message: Messages.FILE_UPLOAD_ERROR },
  FILE_ACCESS_SOURCE_ERROR: { status: 500, message: Messages.FILE_ACCESS_SOURCE_ERROR },
  FILE_UNLINK_SOURCE_ERROR: { status: 500, message: Messages.FILE_UNLINK_SOURCE_ERROR },
  FILE_ACCESS_DESTINATION_ERROR: { status: 500, message: Messages.FILE_ACCESS_DESTINATION_ERROR },
  FILE_RENAME_ERROR: { status: 500, message: Messages.FILE_RENAME_ERROR },
  FILE_ACCESS_OUTPUT_ERROR: { status: 500, message: Messages.FILE_ACCESS_OUTPUT_ERROR },

  // 投稿
  NOT_FOUND_POST: { status: 404, message: Messages.NOT_FOUND_POST },

  CONFLICT: { status: 409, message: Messages.CONFLICT },
  NOT_FOUND: { status: 404, message: Messages.NOT_FOUND },
  FORBIDDEN: { status: 403, message: Messages.FORBIDDEN },

  // 認証
  USER_EMAIL_ALREADY_USED: { status: 409, message: Messages.USER_EMAIL_ALREADY_USED },
  TOKEN_NOT_FOUND: { status: 404, message: Messages.TOKEN_NOT_FOUND },
  SIGNUP_TOKEN_EXPIRED: { status: 410, message: Messages.SIGNUP_TOKEN_EXPIRED },
  USER_ALREADY_EXISTS: { status: 409, message: Messages.USER_ALREADY_EXISTS },

  // ユーザ
  RESET_TOKEN_EXPIRED: { status: 400, message: Messages.RESET_TOKEN_EXPIRED },

  // フロアメンバー
  DONT_NEED_FLOOR_MEMBER: { status: 400, message: Messages.DONT_NEED_FLOOR_MEMBER },
  INVITE_EXPIRED: { status: 400, message: Messages.INVITE_EXPIRED },
  ALREADY_FLOOR_MEMBER: { status: 400, message: Messages.ALREADY_FLOOR_MEMBER },

  // ルームメンバー
  FLOOR_EDITOR_NOT_REQUIRD: { status: 400, message: Messages.FLOOR_EDITOR_NOT_REQUIRD },
  FLOOR_MEMBER_NOT_REQUIRD: { status: 400, message: Messages.FLOOR_MEMBER_NOT_REQUIRD },
  ALREADY_ROOM_MEMBER: { status: 400, message: Messages.ALREADY_ROOM_MEMBER },

  // キック
  ALREADY_KICKED: { status: 400, message: Messages.ALREADY_KICKED },
  CANT_KICK: { status: 400, message: Messages.CANT_KICK },

  // ファイルのアップロード
  INVALID_FILE_TYPE: { status: 400, message: Messages.INVALID_FILE_TYPE },
  FILE_TOO_LARGE: { status: 413, message: Messages.FILE_TOO_LARGE },
  INVALID_FILE: { status: 400, message: Messages.INVALID_FILE },
  FILE_REQUIRED: { status: 400, message: Messages.FILE_REQUIRED },

  // 認証情報の検証
  CSRF_INVALID: { status: 401, message: Messages.CSRF_INVALID },
  TOKEN_INVALID: { status: 401, message: Messages.TOKEN_INVALID },
  TOKEN_EXPIRED: { status: 401, message: Messages.TOKEN_EXPIRED },
};

const getErrorEntry = (code) => (code && ERROR_CATALOG[code] ? ERROR_CATALOG[code] : null);

module.exports = { ERROR_CATALOG, getErrorEntry };
