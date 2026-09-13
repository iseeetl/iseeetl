const { isMailDeliveryEnabled, getMailDeliveryConfig } = require('../../config/featureFlags');
const { createMailTransport } = require('../../integrations/mail/mailer');
const { buildPasswordChangedMail, buildPasswordResetCompletedMail } = require('./localizedMail');
const logger = require('../../utils/logger');

// 通知は確定済みのパスワード変更を失敗にしない。未送信記録は保存しない。
async function deliverPasswordChangeNotice({ mail, lang, kind = 'change' }) {
  if (!isMailDeliveryEnabled()) return false;
  try {
    const config = getMailDeliveryConfig();
    const buildMail = kind === 'reset' ? buildPasswordResetCompletedMail : buildPasswordChangedMail;
    await createMailTransport({ connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 30000 }).sendMail({
      ...buildMail({ locale: lang, appName: config.appName, noReplyMail: config.noReplyMail }),
      to: mail,
    });
    return true;
  } catch (_error) {
    // SMTPの詳細は接続先・メール等を含み得るため出力しない。
    logger.warn('PASSWORD_CHANGE_NOTICE_FAILED');
    return false;
  }
}

module.exports = { deliverPasswordChangeNotice };
