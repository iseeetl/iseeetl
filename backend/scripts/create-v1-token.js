#!/usr/bin/env node

const jwt = require('jsonwebtoken');
const ROLES = require('../constants/roles');
const { CliError, parseOptions, readEnvironmentValue, runCli } = require('./_shared/managementCli');

const HELP = `v1 API用の無期限トークンを発行します。

使い方（リポジトリルートから）:
  node backend/scripts/create-v1-token.js --env-file <環境ファイル> --user-id <ユーザID>

指定ファイルのJWT_DEV_SECRETだけを使用し、トークンを標準出力へ表示します。
DBには接続しません。対象ユーザにはdeveloperロールとルームへのアクセス権が必要です。
無期限トークンの個別失効はできません。詳細はdocs/manual/api/v1-token.mdを参照してください。`;

async function main(args = process.argv.slice(2), io = {}) {
  return runCli(() => {
    const options = parseOptions(args, ['env-file', 'user-id']);
    if (options.help) return HELP;
    if (!/^[a-fA-F0-9]{24}$/.test(options['user-id'])) {
      throw new CliError('INVALID_USER_ID', 'ユーザIDは24桁の16進文字列で指定してください。');
    }
    const secret = readEnvironmentValue(options['env-file'], 'JWT_DEV_SECRET');
    return jwt.sign({
      user_id: options['user-id'].toLowerCase(),
      user_role: ROLES.DEVELOPER,
    }, secret, { algorithm: 'HS256' });
  }, io);
}

if (require.main === module) {
  main().then((code) => { process.exitCode = code; });
}

module.exports = { main };
