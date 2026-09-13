export const API_ERROR_TRANSLATION_KEYS = Object.freeze({
  INVALID_PARAMS: '入力内容が正しくありません。',
  PARAMETERS_ARE_WRONG: '入力内容が正しくありません。',
  NO_UPDATABLE_FIELD: '変更する項目を指定してください。',
  VALIDATION_ERROR: '入力を確認してください',
  INVALID_PERMISSION: 'この操作を行う権限がありません。',
  FORBIDDEN: 'この操作を行う権限がありません。',
  UNAUTHORIZED: 'ログインが必要です',
  CSRF_INVALID: '認証情報が無効です。',
  TOKEN_INVALID: '認証情報が無効です。',
  TOKEN_EXPIRED: 'セッションが無効になりました。再度ログインしてください',
  USER_EMAIL_ALREADY_USED: 'このメールアドレスは既に登録されています。',
  SIGNUP_TOKEN_EXPIRED: '仮登録の有効期限が切れました。もう一度ユーザー登録を行ってください。',
  USER_ALREADY_EXISTS: 'このメールアドレスは既に登録されています。',
  RESET_TOKEN_EXPIRED:
    'パスワード再設定リンクが正しくないか、有効期限が切れています。新しいリンクを発行してください。',
  DONT_NEED_FLOOR_MEMBER: 'フロア編集者はフロアメンバーとして登録する必要はありません。',
  INVITE_EXPIRED: '招待の有効期限が切れています',
  ALREADY_FLOOR_MEMBER: '既にフロアメンバーです。',
  FLOOR_EDITOR_NOT_REQUIRD: 'フロア編集者はルームメンバーとして登録する必要はありません。',
  FLOOR_MEMBER_NOT_REQUIRD: 'フロアメンバーはルームメンバーとして登録する必要はありません。',
  ALREADY_ROOM_MEMBER: '既にルームメンバーです。',
  ALREADY_KICKED: 'このユーザーは既にアクセスを制限されています。',
  CANT_KICK: 'このユーザーのアクセスを制限することはできません。',
  INVALID_FILE_TYPE: '対象ファイルではありません',
  FILE_TOO_LARGE: 'メディアのファイルサイズが上限を超えています。',
  INVALID_FILE: '対象ファイルではありません',
  FILE_REQUIRED: '対象ファイルではありません',
});

export const DEFAULT_API_ERROR_TRANSLATION_KEY = '処理に失敗しました';

export const API_ERROR_REASON_TRANSLATION_KEYS = Object.freeze({
  ACTIVE_AI_ANALYSIS_REFERENCE:
    '有効なAI解析設定で使用されているため削除できません。先に関連するAI解析設定を削除してください',
});

const resolveConflictReasonTranslationKey = (code, details, status) => {
  if (status !== 409 || code !== 'CONFLICT' || !details || typeof details !== 'object') {
    return null;
  }
  const reason = details.reason;
  return (typeof reason === 'string' && API_ERROR_REASON_TRANSLATION_KEYS[reason]) || null;
};

export const resolveApiErrorTranslationKey = (code, details = null, status = null) =>
  resolveConflictReasonTranslationKey(code, details, status) ||
  (code && API_ERROR_TRANSLATION_KEYS[code]) ||
  DEFAULT_API_ERROR_TRANSLATION_KEY;
