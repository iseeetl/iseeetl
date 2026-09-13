const { getMailDeliveryConfig } = require('../../config/featureFlags');
const { createMailTransport } = require('../../integrations/mail/mailer');
const { buildPasswordResetMail } = require('./localizedMail');

async function sendResetPasswordLink({ mail, lang, token }) {
  const config = getMailDeliveryConfig();
  await createMailTransport({ connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 30000 }).sendMail({
    ...buildPasswordResetMail({ locale: lang, appName: config.appName, noReplyMail: config.noReplyMail,
      resetUrl: `${config.appUrl}/user/resetpassword/${token}` }),
    to: mail,
  });
}

module.exports = { sendResetPasswordLink };
