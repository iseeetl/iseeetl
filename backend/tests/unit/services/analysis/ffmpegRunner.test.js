const { EventEmitter } = require('events');
const path = require('path');
const { PassThrough } = require('stream');

const FFPROBE_PATH = path.join(process.cwd(), 'bin', 'ffprobe');
const MEDIA_SOURCE_PATH = path.join(process.cwd(), 'media', 'source.mp4');

const mockSpawn = jest.fn();
jest.mock('child_process', () => ({ spawn: mockSpawn }));

const mockGetFfprobePath = jest.fn((callback) => callback(null, FFPROBE_PATH));
const mockFfmpeg = jest.fn(() => ({ _getFfprobePath: mockGetFfprobePath }));
jest.mock('fluent-ffmpeg', () => mockFfmpeg);

const {
  FFPROBE_TIMEOUT_MS,
  abortActiveMediaProcesses,
  getActiveFfmpegCommandCount,
  probeMediaFile,
  runFfmpegCommand,
} = require('../../../../services/analysis/ffmpegRunner');

const createChild = () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = jest.fn();
  return child;
};

const closeChild = (child, code = 0, signal = null) => {
  child.stdout.end();
  child.stderr.end();
  child.emit('close', code, signal);
};

const createCommand = () => {
  const command = new EventEmitter();
  command.run = jest.fn();
  command.kill = jest.fn();
  return command;
};

const waitForCall = async (mock) => {
  for (let attempt = 0; attempt < 5 && mock.mock.calls.length === 0; attempt += 1) {
    await Promise.resolve();
  }
  expect(mock).toHaveBeenCalled();
};

describe('AI解析用のffmpeg実行', () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  afterEach(() => jest.useRealTimers());

  test('ffprobeをJSON固定引数で起動し結果を返す', async () => {
    const child = createChild();
    mockSpawn.mockReturnValue(child);
    const result = probeMediaFile(MEDIA_SOURCE_PATH);
    await waitForCall(mockSpawn);
    child.stdout.write(JSON.stringify({ format: { duration: 1 }, streams: [] }));
    closeChild(child);

    await expect(result).resolves.toEqual({ format: { duration: 1 }, streams: [] });
    expect(mockSpawn).toHaveBeenCalledWith(
      FFPROBE_PATH,
      [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_streams',
        '-show_format',
        MEDIA_SOURCE_PATH,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    expect(getActiveFfmpegCommandCount()).toBe(0);
  });

  test('ffprobeの中断ではSIGKILL後の終了を待ってAbortErrorを返す', async () => {
    const child = createChild();
    mockSpawn.mockReturnValue(child);
    const controller = new AbortController();
    let settled = false;
    const result = probeMediaFile(MEDIA_SOURCE_PATH, { signal: controller.signal })
      .finally(() => {
        settled = true;
      });

    await waitForCall(mockSpawn);
    controller.abort();
    await Promise.resolve();
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(settled).toBe(false);
    closeChild(child, null, 'SIGKILL');
    await expect(result).rejects.toMatchObject({ name: 'AbortError', code: 'ABORT_ERR' });
    expect(getActiveFfmpegCommandCount()).toBe(0);
  });

  test('ffprobeは所定の時間で停止させ、終了を待ってタイムアウトエラーを返す', async () => {
    jest.useFakeTimers();
    const child = createChild();
    mockSpawn.mockReturnValue(child);
    const result = probeMediaFile(MEDIA_SOURCE_PATH);
    const assertion = expect(result).rejects.toMatchObject({
      code: 'AI_ANALYSIS_MEDIA_PROBE_TIMEOUT',
    });

    await waitForCall(mockSpawn);
    await jest.advanceTimersByTimeAsync(FFPROBE_TIMEOUT_MS);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    closeChild(child, null, 'SIGKILL');
    await assertion;
  });

  test('ffmpeg変換の中断では停止後のエラーイベントを待つ', async () => {
    const command = createCommand();
    const controller = new AbortController();
    let settled = false;
    const result = runFfmpegCommand(command, { signal: controller.signal })
      .finally(() => {
        settled = true;
      });
    controller.abort();
    await Promise.resolve();
    expect(command.kill).toHaveBeenCalledWith('SIGKILL');
    expect(settled).toBe(false);
    command.emit('error', new Error('killed'));
    await expect(result).rejects.toMatchObject({ name: 'AbortError', code: 'ABORT_ERR' });
  });

  test('終了時の後処理では実行中のffmpegとffprobeの終了イベントを待つ', async () => {
    const child = createChild();
    mockSpawn.mockReturnValue(child);
    const probeResult = probeMediaFile(MEDIA_SOURCE_PATH).catch(() => null);
    const command = createCommand();
    const commandResult = runFfmpegCommand(command).catch(() => null);
    await waitForCall(mockSpawn);
    let finished = false;
    const abort = abortActiveMediaProcesses().then(() => {
      finished = true;
    });

    await Promise.resolve();
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(command.kill).toHaveBeenCalledWith('SIGKILL');
    expect(finished).toBe(false);
    child.emit('error', new Error('killed'));
    command.emit('error', new Error('killed'));
    await abort;
    await Promise.all([probeResult, commandResult]);
    expect(finished).toBe(true);
    expect(getActiveFfmpegCommandCount()).toBe(0);
  });
});
