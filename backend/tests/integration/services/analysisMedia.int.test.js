const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const sharp = require('sharp');

const { createTestRuntime } = require('../../_helpers/testRuntime');
const { probeMediaFile } = require('../../../services/analysis/ffmpegRunner');
const {
  abortAndCleanupAnalysisMedia,
  getAnalysisMediaRuntimeState,
  withPreparedAnalysisInput,
} = require('../../../services/analysis/media.service');

const execFileAsync = promisify(execFile);
const runtime = createTestRuntime('backend/analysis-media-integration');
const source = { floor: '64b000000000000000000001', room: '64b000000000000000000002' };

const runFfmpeg = (args) => execFileAsync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', ...args], {
  timeout: 20000,
  maxBuffer: 2 * 1024 * 1024,
  encoding: 'buffer',
});

describe('動画からAI解析用の映像・音声を抽出する', () => {
  let mediaRoot;
  let roomDir;
  let originalVideo;

  const prepare = (kind, videoName, callback) => withPreparedAnalysisInput({
    kind, mediaRoot, source: { ...source, video_name: videoName },
  }, callback);

  beforeAll(async () => {
    mediaRoot = runtime.createTestTempDir('media');
    roomDir = await runtime.ensureDir(path.join(mediaRoot, source.floor, source.room));
    const multiPath = path.join(roomDir, 'multi.mov');
    await runFfmpeg([
      '-f', 'lavfi', '-i', 'color=c=red:s=32x32:r=4',
      '-f', 'lavfi', '-i', 'color=c=blue:s=32x32:r=4',
      '-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono',
      '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=16000',
      '-map', '0:v', '-map', '1:v', '-map', '2:a', '-map', '3:a',
      '-t', '1', '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
      '-disposition:v:0', '0', '-disposition:v:1', 'default',
      '-disposition:a:0', '0', '-disposition:a:1', 'default',
      '-timecode', '00:00:00:00', multiPath,
    ]);
    originalVideo = await fs.promises.readFile(multiPath);
    for (const [name, filter] of [
      ['tone', 'sine=frequency=880:sample_rate=16000:duration=3'],
      ['zero', 'anullsrc=r=16000:cl=mono'],
      ['mixed-tones', 'aevalsrc=0.1*sin(2*PI*880*t)+0.1*sin(2*PI*521*t):s=16000:d=3'],
    ]) {
      await runFfmpeg(['-f', 'lavfi', '-i', filter, '-t', '3', '-c:a', 'libmp3lame', '-b:a', '128k', path.join(roomDir, `${name}.mp3`)]);
    }

    await runFfmpeg([
      '-f', 'lavfi', '-i', 'color=c=green:s=32x32:r=4',
      '-f', 'lavfi', '-i', 'sine=frequency=500:sample_rate=16000',
      '-t', '1', '-c:v', 'libx265', '-threads', '1',
      '-x265-params', 'pools=none:frame-threads=1:log-level=error', '-tag:v', 'hvc1',
      '-c:a', 'aac', path.join(roomDir, 'hevc.mov'),
    ]);
    await runFfmpeg(['-i', multiPath, '-map', '0:v:0', '-c', 'copy', path.join(roomDir, 'silent.mov')]);
    await runFfmpeg(['-i', multiPath, '-map', '0:a:1', '-c', 'copy', path.join(roomDir, 'audio-only.mov')]);
  }, 60000);

  afterEach(async () => {
    expect(getAnalysisMediaRuntimeState()).toEqual({ activeFfmpegCommands: 0, activeTempWorkspaces: 0 });
    const workspaces = await fs.promises.readdir(path.join(mediaRoot, '.ai-analysis-tmp'));
    expect(workspaces).toEqual([]);
    expect(await fs.promises.readFile(path.join(roomDir, 'multi.mov'))).toEqual(originalVideo);
  });

  afterAll(async () => {
    await abortAndCleanupAnalysisMedia();
    if (mediaRoot) await runtime.removeDirSafe(mediaRoot);
  });

  test('補助データ付きの複数トラック動画から、既定の青い映像だけを取り出す', async () => {
    const probe = await probeMediaFile(path.join(roomDir, 'multi.mov'));
    expect(probe.streams.filter((stream) => stream.codec_type === 'video')).toHaveLength(2);
    expect(probe.streams.filter((stream) => stream.codec_type === 'audio')).toHaveLength(2);
    expect(probe.streams.some((stream) => stream.codec_type === 'data')).toBe(true);

    const callback = jest.fn(async ({ frameBase64s }) => {
      expect(frameBase64s).toHaveLength(3);
      for (const frame of frameBase64s) {
        const { channels } = await sharp(Buffer.from(frame, 'base64')).stats();
        expect(channels[2].mean).toBeGreaterThan(200);
        expect(channels[0].mean).toBeLessThan(30);
      }
      return 'prepared';
    });
    await expect(prepare('video', 'multi.mov', callback)).resolves.toBe('prepared');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test.each(['audioScene', 'speech'])('%sでは先頭の無音ではなく、既定の有声音声をMP3に変換する', async (kind) => {
    const callback = jest.fn(async ({ audioBuffer, audioFileName }) => {
      expect(audioFileName).toBe('audio.mp3');
      const outputPath = path.join(mediaRoot, `prepared-${kind}.mp3`);
      await fs.promises.writeFile(outputPath, audioBuffer);
      const probe = await probeMediaFile(outputPath);
      expect(probe.streams).toHaveLength(1);
      expect(probe.streams[0]).toMatchObject({ codec_type: 'audio', codec_name: 'mp3', sample_rate: '16000', channels: 1 });
      const { stdout } = await runFfmpeg(['-i', outputPath, '-f', 's16le', '-acodec', 'pcm_s16le', 'pipe:1']);
      let squareSum = 0;
      for (let offset = 0; offset < stdout.length; offset += 2) squareSum += stdout.readInt16LE(offset) ** 2;
      expect(Math.sqrt(squareSum / (stdout.length / 2))).toBeGreaterThan(100);
      return 'prepared';
    });
    await expect(prepare(kind, 'multi.mov', callback)).resolves.toBe('prepared');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test.each(['video', 'audioScene', 'speech'])('HEVC動画でも%sに必要なデータを取り出せる', async (kind) => {
    const callback = jest.fn(async (media) => {
      if (kind === 'video') expect(media.frameBase64s).toHaveLength(3);
      else expect(media.audioBuffer.length).toBeGreaterThan(0);
      return 'prepared';
    });
    await expect(prepare(kind, 'hevc.mov', callback)).resolves.toBe('prepared');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test.each(['audioScene', 'speech'])('%sに必要な音声がなければ解析を省く', async (kind) => {
    const callback = jest.fn();
    await expect(prepare(kind, 'silent.mov', callback)).resolves.toBeNull();
    expect(callback).not.toHaveBeenCalled();
  });

  test('映像がないMOVでも音声を取り出し、動画解析だけを省く', async () => {
    const callback = jest.fn().mockResolvedValue('prepared');
    await expect(prepare('speech', 'audio-only.mov', callback)).resolves.toBe('prepared');
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ audioBuffer: expect.any(Buffer) }));
    callback.mockClear();
    await expect(prepare('video', 'audio-only.mov', callback)).resolves.toBeNull();
    expect(callback).not.toHaveBeenCalled();
  });

  test.each([
    ['tone.mp3', { kind: 'steady-tone', frequencyHz: 880 }],
    ['zero.mp3', { kind: 'digital-silence' }],
    ['mixed-tones.mp3', { kind: 'unknown' }],
  ])('MP3の実変換後に%sの波形を確認する', async (audioName, expected) => {
    const before = await fs.promises.readFile(path.join(roomDir, audioName));
    await withPreparedAnalysisInput({
      kind: 'audioScene', mediaRoot, source: { ...source, audio_name: audioName },
    }, async (media) => {
      expect(media.acousticProfile).toEqual(expected);
      expect(media.audioBuffer.length).toBeGreaterThan(0);
    });
    expect(await fs.promises.readFile(path.join(roomDir, audioName))).toEqual(before);
  });

  test('文字起こしは波形による説明へ置き換えない', async () => {
    await withPreparedAnalysisInput({
      kind: 'speech', mediaRoot, source: { ...source, audio_name: 'tone.mp3' },
    }, async (media) => { expect(media.acousticProfile).toBeUndefined(); });
  });

  test('破損した動画を処理できなければ失敗を返し、一時ファイルを残さない', async () => {
    await fs.promises.writeFile(path.join(roomDir, 'broken.mov'), 'invalid video fixture');
    const callback = jest.fn();
    await expect(prepare('video', 'broken.mov', callback)).rejects.toThrow();
    expect(callback).not.toHaveBeenCalled();
  });
});
