// 開発用シェルの設定で外部サービスが有効にならないよう、すべて無効にする。
process.env.EXTERNAL_OPENAI_ENABLED = 'false';
process.env.EXTERNAL_GOOGLE_TRANSLATE_ENABLED = 'false';
process.env.EXTERNAL_GOOGLE_LOGIN_ENABLED = 'false';
process.env.EXTERNAL_LINE_LOGIN_ENABLED = 'false';
process.env.EXTERNAL_ONESIGNAL_ENABLED = 'false';
process.env.EXTERNAL_GOOGLE_ANALYTICS_ENABLED = 'false';
process.env.EXTERNAL_MAIL_DELIVERY_ENABLED = 'false';
