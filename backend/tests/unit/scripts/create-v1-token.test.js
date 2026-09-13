jest.mock('node:fs', () => ({ statSync: jest.fn(), readFileSync: jest.fn() }));

const fs = require('node:fs');
const jwt = require('jsonwebtoken');
const { main } = require('../../../scripts/create-v1-token');

const SECRET = 'dummy-v1-cli-signing-secret';
const USER_ID = '6500000000000000000000AB';
const ARGS = ['--env-file', 'staging.env', '--user-id', USER_ID];
const output = () => ({ stdout: { write: jest.fn() }, stderr: { write: jest.fn() } });

beforeEach(() => {
  fs.statSync.mockReturnValue({ isFile: () => true });
  fs.readFileSync.mockReturnValue(Buffer.from(`JWT_DEV_SECRET="${SECRET}"\n`));
});

test('指定ファイルの秘密値で開発者用の無期限トークンだけを出力する', async () => {
  const io = output();
  expect(await main(ARGS, io)).toBe(0);
  const token = io.stdout.write.mock.calls[0][0].trim();
  const claims = jwt.verify(token, SECRET, { algorithms: ['HS256'], clockTimestamp: 4102444800 });
  expect(claims).toEqual({ user_id: USER_ID.toLowerCase(), user_role: 'developer', iat: expect.any(Number) });
  expect(io.stdout.write).toHaveBeenCalledTimes(1);
  expect(io.stderr.write).not.toHaveBeenCalled();
  expect(fs.readFileSync).toHaveBeenCalledWith('staging.env');
  expect(() => jwt.verify(token, 'different-dummy-secret')).toThrow();
});

test.each([
  [],
  ['--env-file', 'staging.env'],
  [...ARGS, '--user-role', 'Administrator'],
  [...ARGS, '--expires-in', '1h'],
  [...ARGS, '--env-file', 'production.env'],
  [...ARGS, '--password', 'not-for-output'],
  ['--help', ...ARGS],
].map((args) => [args]))('不正な引数を表示せず終了する: %j', async (args) => {
  const io = output();
  expect(await main(args, io)).toBe(1);
  expect(io.stdout.write).not.toHaveBeenCalled();
  expect(io.stderr.write).toHaveBeenCalledWith(expect.stringContaining('INVALID_ARGUMENTS:'));
  expect(io.stderr.write.mock.calls.flat().join('')).not.toContain('not-for-output');
  expect(fs.readFileSync).not.toHaveBeenCalled();
});

test.each(['invalid', '123', '65000000000000000000000g'])('ユーザIDの形式を検証する: %s', async (id) => {
  const io = output();
  expect(await main(['--env-file', 'staging.env', '--user-id', id], io)).toBe(1);
  expect(io.stderr.write).toHaveBeenCalledWith(expect.stringContaining('INVALID_USER_ID:'));
  expect(fs.readFileSync).not.toHaveBeenCalled();
});

test.each(['', 'JWT_DEV_SECRET=\n', 'JWT_DEV_SECRET="   "\n', 'JWT_SECRET=wrong-kind\n'])('未設定時にプロセス環境へ切り替えない', async (settings) => {
  const previous = process.env.JWT_DEV_SECRET;
  process.env.JWT_DEV_SECRET = 'inherited-dummy-secret';
  try {
    fs.readFileSync.mockReturnValue(Buffer.from(settings));
    const io = output();
    expect(await main(ARGS, io)).toBe(1);
    expect(io.stdout.write).not.toHaveBeenCalled();
    expect(io.stderr.write).toHaveBeenCalledWith(expect.stringContaining('ENV_VALUE_REQUIRED:'));
  } finally {
    if (previous === undefined) delete process.env.JWT_DEV_SECRET;
    else process.env.JWT_DEV_SECRET = previous;
  }
});

test('環境ファイルの他の設定をプロセスへ反映しない', async () => {
  const before = process.env.CLI_TEST_MARKER;
  fs.readFileSync.mockReturnValue(Buffer.from(`JWT_DEV_SECRET=${SECRET}\nCLI_TEST_MARKER=changed\nNODE_OPTIONS=--invalid\n`));
  expect(await main(ARGS, output())).toBe(0);
  expect(process.env.CLI_TEST_MARKER).toBe(before);
});

test.each(['missing', 'directory', 'read-error'])('読み取り失敗の原文やパスを出力しない: %s', async (kind) => {
  if (kind === 'missing') fs.statSync.mockImplementation(() => { throw new Error('private-path'); });
  if (kind === 'directory') fs.statSync.mockReturnValue({ isFile: () => false });
  if (kind === 'read-error') fs.readFileSync.mockImplementation(() => { throw new Error(SECRET); });
  const io = output();
  expect(await main(ARGS, io)).toBe(1);
  expect(io.stdout.write).not.toHaveBeenCalled();
  expect(io.stderr.write).toHaveBeenCalledWith('ENV_FILE_UNREADABLE: 指定した環境ファイルを読み取れません。\n');
});

test('ヘルプ表示では設定を読まない', async () => {
  const io = output();
  expect(await main(['--help'], io)).toBe(0);
  expect(io.stdout.write).toHaveBeenCalledWith(expect.stringContaining('--user-id'));
  expect(fs.readFileSync).not.toHaveBeenCalled();
});
