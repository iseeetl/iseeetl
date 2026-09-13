const crypto = require('crypto');

let lastTimestamp = 0;
let sequence = 0;

// 既存の「数字列_ユーザID」というファイル名を保ちながら、同時アップロード時の名前の衝突を避ける。
// 同一ミリ秒内の連番と乱数を組み合わせ、複数プロセスからの生成にも備える。
function createMediaToken() {
  const now = Date.now();
  if (now === lastTimestamp) sequence += 1;
  else {
    lastTimestamp = now;
    sequence = 0;
  }

  const entropy = BigInt(`0x${crypto.randomBytes(16).toString('hex')}`)
    .toString(10)
    .padStart(39, '0');
  return `${now}${String(sequence).padStart(6, '0')}${entropy}`;
}

const createMediaBaseName = (userId) => `${createMediaToken()}_${userId}`;

module.exports = {
  createMediaBaseName,
  createMediaToken,
};
