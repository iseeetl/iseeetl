const MESSAGES = {
  INVALID_PARAMS: '入力内容が正しくありません',
  INVALID_PERMISSION: 'この操作を行う権限がありません',
  UNAUTHORIZED: '認証が必要です',
  VALIDATION_ERROR: '入力内容に誤りがあります',
  RATE_LIMIT_EXCEEDED: 'リクエストが多すぎます',
  PAYLOAD_TOO_LARGE: '送信データが大きすぎます',
  INTERNAL_SERVER_ERROR: 'サーバーでエラーが発生しました',
  NO_UPDATABLE_FIELD: '更新できる項目が指定されていません',
  PARAMETERS_ARE_WRONG: '入力内容が正しくありません',
  LINE_LOGIN_NOT_CONFIGURED: 'LINEログインを利用できません',
  GOOGLE_LOGIN_NOT_CONFIGURED: 'Googleログインを利用できません',
  OPENAI_NOT_CONFIGURED: 'AI機能を利用できません',
  EXTERNAL_FEATURE_DISABLED: 'この機能は現在利用できません',
  TRANSCRIPTION_FAILED: '文字起こしに失敗しました',
  FILE_UPLOAD_ERROR: 'ファイルをアップロードできませんでした',
  FILE_ACCESS_SOURCE_ERROR: 'ファイルの読み込みに失敗しました',
  FILE_UNLINK_SOURCE_ERROR: 'ファイルの削除に失敗しました',
  FILE_ACCESS_DESTINATION_ERROR: '保存先の確認に失敗しました',
  FILE_RENAME_ERROR: 'ファイルの保存に失敗しました',
  FILE_ACCESS_OUTPUT_ERROR: '処理済みファイルの確認に失敗しました',

  // 投稿
  NOT_FOUND_POST: '指定された投稿は存在しません',

  CONFLICT: '既に登録されているため処理できません',
  NOT_FOUND: '対象が見つかりません',
  FORBIDDEN: 'この操作を行う権限がありません',

  // 認証
  USER_EMAIL_ALREADY_USED: '既に登録されているメールアドレスです',
  TOKEN_NOT_FOUND: 'トークンが存在しません',
  SIGNUP_TOKEN_EXPIRED: '仮登録の有効期限が切れました。もう一度ユーザー登録を行ってください',
  USER_ALREADY_EXISTS: 'このメールアドレスは既に登録されています',
  CSRF_INVALID: '認証情報が無効です',
  TOKEN_INVALID: '認証情報が無効です',
  TOKEN_EXPIRED: '認証の有効期限が切れています',

  // ユーザ
  RESET_TOKEN_EXPIRED: 'パスワード再設定の有効期限が切れています。再度、パスワード再設定を行ってください',

  // フロアメンバー
  DONT_NEED_FLOOR_MEMBER: 'フロア編集者はフロアメンバーとして登録する必要はありません',
  INVITE_EXPIRED: '招待の有効期限が切れています',
  ALREADY_FLOOR_MEMBER: '既にフロアメンバーです',

  // ルームメンバー
  FLOOR_EDITOR_NOT_REQUIRD: 'フロア編集者はルームメンバーとして登録する必要はありません',
  FLOOR_MEMBER_NOT_REQUIRD: 'フロアメンバーはルームメンバーとして登録する必要はありません',
  ALREADY_ROOM_MEMBER: '既にルームメンバーです',

  // キック
  ALREADY_KICKED: 'このユーザーは既にアクセスを制限されています',
  CANT_KICK: 'このユーザーのアクセスを制限することはできません',

  // ファイルのアップロード
  INVALID_FILE_TYPE: '不正なファイル形式です',
  FILE_TOO_LARGE: 'アップロード可能なサイズを超えています',
  INVALID_FILE: '不正なファイルです',
  FILE_REQUIRED: 'ファイルは必須です',
};

module.exports = MESSAGES;
