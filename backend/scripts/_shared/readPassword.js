const { createInterface } = require('node:readline/promises');
const { Writable } = require('node:stream');
const { CliError } = require('./managementCli');

async function readPassword({ input = process.stdin, output = process.stderr } = {}) {
  if (!input.isTTY || !output.isTTY) {
    throw new CliError('TERMINAL_REQUIRED', 'パスワードは対話端末で入力してください。');
  }

  const mutedOutput = new Writable({
    write(_chunk, _encoding, callback) { callback(); },
  });
  const reader = createInterface({ input, output: mutedOutput, terminal: true, historySize: 0 });
  const cancellation = new AbortController();
  const cancel = () => cancellation.abort();
  reader.on('SIGINT', cancel);
  reader.on('close', cancel);

  const ask = async (label) => {
    output.write(label);
    const answer = await reader.question('', { signal: cancellation.signal });
    output.write('\n');
    return answer;
  };

  try {
    const password = await ask('パスワード: ');
    const confirmation = await ask('パスワード（確認）: ');
    if (password !== confirmation) {
      throw new CliError('PASSWORD_MISMATCH', '確認用パスワードが一致しません。');
    }
    return password;
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError('INPUT_CANCELLED', 'パスワードの入力を中止しました。');
  } finally {
    reader.off('SIGINT', cancel);
    reader.off('close', cancel);
    reader.close();
    mutedOutput.destroy();
  }
}

module.exports = { readPassword };
