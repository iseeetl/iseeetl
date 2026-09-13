const nodemailer = require('nodemailer');
const { getMailDeliveryConfig } = require('../../config/featureFlags');

function createMailTransport(timeouts = {}) {
  const config = getMailDeliveryConfig();
  return nodemailer.createTransport({
    ...timeouts,
    host: config.host,
    port: config.port,
    secure: false,
    // 管理された内部SMTP向けに、認証とTLS証明書検証を行わない設定。
    // 外部SMTPへ切り替える際は、認証とTLS設定を見直して検証する。
    tls: { rejectUnauthorized: false },
  });
}

module.exports = {
  createMailTransport,
};
