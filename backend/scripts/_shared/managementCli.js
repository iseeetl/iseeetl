const fs = require('node:fs');
const { parseArgs } = require('node:util');
const dotenv = require('dotenv');

class CliError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function parseOptions(args, requiredNames) {
  try {
    const { values, tokens } = parseArgs({
      args,
      options: {
        ...Object.fromEntries(requiredNames.map((name) => [name, { type: 'string' }])),
        help: { type: 'boolean', short: 'h' },
      },
      strict: true,
      allowPositionals: false,
      tokens: true,
    });
    const names = tokens.map((token) => token.name);
    if (new Set(names).size !== names.length) throw new Error();
    if (values.help) {
      if (tokens.length !== 1) throw new Error();
      return values;
    }
    if (requiredNames.some((name) => !values[name]?.trim())) throw new Error();
    return values;
  } catch (_error) {
    // 引数には認証情報が混入する可能性があるため、解析エラーの原文を表示しない。
    throw new CliError('INVALID_ARGUMENTS', '引数が不正です。--helpで指定方法を確認してください。');
  }
}

function readEnvironmentValue(filePath, name) {
  let settings;
  try {
    if (!fs.statSync(filePath).isFile()) throw new Error();
    settings = dotenv.parse(fs.readFileSync(filePath));
  } catch (_error) {
    throw new CliError('ENV_FILE_UNREADABLE', '指定した環境ファイルを読み取れません。');
  }
  const value = settings[name];
  if (typeof value !== 'string' || !value.trim()) {
    throw new CliError('ENV_VALUE_REQUIRED', `指定した環境ファイルに${name}が必要です。`);
  }
  return value;
}

async function runCli(operation, { stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const result = await operation();
    stdout.write(`${result}\n`);
    return 0;
  } catch (error) {
    const failure = error instanceof CliError
      ? error
      : new CliError('COMMAND_FAILED', '処理に失敗しました。設定と実行環境を確認してください。');
    stderr.write(`${failure.code}: ${failure.message}\n`);
    return 1;
  }
}

module.exports = { CliError, parseOptions, readEnvironmentValue, runCli };
