const { PassThrough, Writable } = require('node:stream');
const { readPassword } = require('../../../scripts/_shared/readPassword');

function terminal(answers) {
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = jest.fn();
  const displayed = [];
  const output = new Writable({
    write(chunk, _encoding, callback) {
      const text = chunk.toString();
      displayed.push(text);
      if (text.endsWith(': ')) {
        const answer = answers.shift();
        setImmediate(() => { if (answer === null) input.end(); else input.write(answer); });
      }
      callback();
    },
  });
  output.isTTY = true;
  return { input, output, displayed };
}

test('2回の入力を表示せず読み取り、端末の入力モードを戻す', async () => {
  const tty = terminal(['DummyPass123\n', 'DummyPass123\n']);
  expect(await readPassword(tty)).toBe('DummyPass123');
  expect(tty.displayed.join('')).not.toContain('DummyPass123');
  expect(tty.input.setRawMode).toHaveBeenLastCalledWith(false);
  tty.input.destroy();
  tty.output.destroy();
});

test.each([
  [['DummyPass123\n', 'Different123\n'], 'PASSWORD_MISMATCH'],
  [['\u0003'], 'INPUT_CANCELLED'],
  [[null], 'INPUT_CANCELLED'],
])('不一致・中断時にも端末の入力モードを戻す', async (answers, code) => {
  const tty = terminal(answers);
  await expect(readPassword(tty)).rejects.toMatchObject({ code });
  expect(tty.input.setRawMode).toHaveBeenLastCalledWith(false);
  expect(tty.displayed.join('')).not.toContain('DummyPass123');
  tty.input.destroy();
  tty.output.destroy();
});

test('リダイレクトされた入力ではパスワードを読まない', async () => {
  await expect(readPassword({ input: { isTTY: false }, output: { isTTY: true } })).rejects.toMatchObject({ code: 'TERMINAL_REQUIRED' });
});
