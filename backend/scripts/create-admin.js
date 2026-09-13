#!/usr/bin/env node

const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const ROLES = require('../constants/roles');
const { validateUserName } = require('../validates/base.validate');
const { validateMail, validatePassword } = require('../validates/user.validate');
const { CliError, parseOptions, readEnvironmentValue, runCli } = require('./_shared/managementCli');
const { readPassword } = require('./_shared/readPassword');

const HELP = `管理者（Administrator）を新規作成します。

使い方（リポジトリルートから）:
  node backend/scripts/create-admin.js --env-file <環境ファイル> --username <ユーザ名> --mail <メールアドレス>

指定ファイルのDB_CONNECTへ接続します。DB名を含む接続文字列が必要です。
ユーザ名は1～20文字、メールアドレスは100文字以内、パスワードは8～16文字です。
パスワードは対話端末で非表示入力します。同じメールの既存ユーザは変更しません。
詳細はdocs/manual/management/create-admin.mdを参照してください。`;

async function validateAccount(account, { includePassword = true } = {}) {
  const request = { body: { ...account } };
  const validators = [validateUserName('username'), validateMail('mail')];
  if (includePassword) validators.push(validatePassword('password'));
  for (const validate of validators) await validate.run(request);
  if (!validationResult(request).isEmpty()) {
    throw new CliError('INVALID_ACCOUNT', 'ユーザ名・メールアドレス・パスワードの入力条件を確認してください。');
  }
  return request.body;
}

async function createAdmin({ dbConnect, ...account }, {
  createConnection = () => mongoose.createConnection(),
} = {}) {
  const values = await validateAccount(account);
  if (!/^mongodb(?:\+srv)?:\/\/[^/]+\/[^?\s/]+(?:\?.*)?$/.test(dbConnect)) {
    throw new CliError('INVALID_DB_CONNECT', 'DB_CONNECTにはDB名を含むMongoDB接続文字列を指定してください。');
  }

  const connection = createConnection();
  let phase = 'connect';
  let failure;
  let userId;
  try {
    await connection.openUri(dbConnect, { serverSelectionTimeoutMS: 10000 });
    const User = connection.model('User', require('../models/User').schema);
    phase = 'indexes';
    await User.init();
    const indexes = await User.collection.indexes();
    if (!indexes.some((index) => index.name === 'uniq_users_mail_string'
      && index.unique === true && index.key.mail === 1
      && index.partialFilterExpression?.mail?.$type === 'string')) {
      throw new CliError('INDEX_INITIALIZATION_FAILED', 'ユーザメールの一意索引を確認できません。');
    }
    phase = 'create';
    if (await User.exists({ mail: values.mail })) {
      throw new CliError('USER_EMAIL_ALREADY_USED', '同じメールアドレスのユーザが既に存在します。');
    }
    // Userの新規保存ではハッシュ化されないため、保存前に一度だけ処理する。
    const passwordHash = await bcrypt.hash(values.password, 10);
    const user = await User.create({
      username: values.username,
      mail: values.mail,
      password: passwordHash,
      role: ROLES.ADMINISTRATOR,
      lang: 'ja',
      delete_flg: false,
    });
    userId = user._id.toString();
  } catch (error) {
    if (error instanceof CliError) {
      failure = error;
    } else if (phase === 'connect') {
      failure = new CliError('DB_CONNECTION_FAILED', '対象DBへ接続できません。DB_CONNECTと接続権限を確認してください。');
    } else if (phase === 'indexes') {
      failure = new CliError('INDEX_INITIALIZATION_FAILED', 'ユーザ索引を準備できません。既存データの重複や索引の競合を確認してください。');
    } else if (error.code === 11000) {
      failure = new CliError('USER_EMAIL_ALREADY_USED', '同じメールアドレスのユーザが既に存在します。');
    } else {
      failure = new CliError('USER_CREATION_FAILED', 'ユーザ作成を完了できません。再実行前に登録状況を確認してください。');
    }
  } finally {
    try {
      await connection.close();
    } catch (_error) {
      failure ??= new CliError('DB_DISCONNECTION_FAILED', 'DB接続を終了できません。再実行前に登録状況を確認してください。');
    }
  }
  if (failure) throw failure;
  return userId;
}

async function main(args = process.argv.slice(2), {
  stdout = process.stdout,
  stderr = process.stderr,
  promptPassword = readPassword,
  createUser = createAdmin,
} = {}) {
  return runCli(async () => {
    const options = parseOptions(args, ['env-file', 'username', 'mail']);
    if (options.help) return HELP;
    const account = await validateAccount({ username: options.username, mail: options.mail }, { includePassword: false });
    const dbConnect = readEnvironmentValue(options['env-file'], 'DB_CONNECT');
    const password = await promptPassword();
    const userId = await createUser({ ...account, password, dbConnect });
    return `管理者を作成しました。ユーザID: ${userId}`;
  }, { stdout, stderr });
}

if (require.main === module) {
  main().then((code) => { process.exitCode = code; });
}

module.exports = { createAdmin, main };
