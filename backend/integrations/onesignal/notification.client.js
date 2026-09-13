const https = require('https');
const { getOneSignalConfig } = require('../../config/featureFlags');

const dispatchNotification = (data) => {
  const config = getOneSignalConfig();
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    Authorization: `Basic ${config.restApiKey}`,
  };

  const options = {
    host: config.host,
    port: config.port,
    path: config.path,
    method: 'POST',
    headers,
  };

  const req = https.request(options, (res) => {
    res.resume();
  });

  // 通知の通信エラーはAPI応答の失敗にしない。
  req.on('error', () => {});

  req.write(JSON.stringify(data));
  req.end();
};

module.exports = { dispatchNotification };
