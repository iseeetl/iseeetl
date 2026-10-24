const path = require('path');

const mockCommand = {
  audioBitrate: jest.fn(),
  audioChannels: jest.fn(),
  audioCodec: jest.fn(),
  audioFrequency: jest.fn(),
  format: jest.fn(),
  noVideo: jest.fn(),
  output: jest.fn(),
  outputOptions: jest.fn(),
};
Object.values(mockCommand).forEach((method) => method.mockReturnValue(mockCommand));
const mockFfmpeg = jest.fn(() => mockCommand);
jest.mock('fluent-ffmpeg', () => mockFfmpeg);

const mockRunFfmpegCommand = jest.fn().mockResolvedValue(undefined);
const mockProbeMediaFile = jest.fn();
jest.mock('../../../../services/analysis/ffmpegRunner', () => ({
  probeMediaFile: mockProbeMediaFile,
  runFfmpegCommand: mockRunFfmpegCommand,
}));
const mockAnalyzeWithProvider = jest.fn();
jest.mock('../../../../services/analysis/provider.service', () => ({
  analyzeWithProvider: mockAnalyzeWithProvider,
}));
const mockCopySafeRegularFile = jest.fn();
const mockReadSafeRegularFile = jest.fn();
jest.mock('../../../../services/analysis/mediaPath', () => ({
  copySafeRegularFile: mockCopySafeRegularFile,
  mediaError: (code) => Object.assign(new Error(code), { code }),
  readSafeRegularFile: mockReadSafeRegularFile,
}));
const mockLstat = jest.fn();
jest.mock('fs', () => ({ promises: { lstat: mockLstat }, constants: {} }));

const {
  AUDIO_BIT_RATE,
  AUDIO_MAX_BYTES,
  AUDIO_SAMPLE_RATE,
  describePreparedAudioScene,
  extractVideoAudioForAnalysis,
  prepareAudioFileForAnalysis,
  transcodeToAnalysisMp3,
  validateMp3Probe,
} = require('../../../../services/analysis/audio.service');

const FIXTURE_ROOT = path.join(process.cwd(), 'fixture');
const INPUT_PATH = path.join(FIXTURE_ROOT, 'input.mp3');
const OUTPUT_PATH = path.join(FIXTURE_ROOT, 'output.mp3');
const WORKSPACE = path.join(FIXTURE_ROOT, 'workspace');
const PROFILE_PATH = path.join(WORKSPACE, 'analysis-profile.pcm');

const validProbe = (overrides = {}) => ({
  format: { format_name: 'mp3', ...(overrides.format || {}) },
  streams: overrides.streams || [
    { codec_type: 'audio', codec_name: 'mp3', sample_rate: '16000', channels: 1 },
  ],
});

describe('AI解析用の音声変換と波形判定', () => {
  const mp3Buffer = Buffer.from('synthetic encoded mp3');
  const silentPcm = Buffer.alloc(2 * 16000 * 2);

  beforeEach(() => {
    jest.clearAllMocks();
    mockCopySafeRegularFile.mockResolvedValue(undefined);
    mockProbeMediaFile.mockResolvedValue(validProbe());
    mockLstat.mockResolvedValue({ isSymbolicLink: () => false, isFile: () => true, size: mp3Buffer.length });
    mockReadSafeRegularFile.mockImplementation(async ({ filePath }) =>
      (filePath.endsWith('.pcm') ? silentPcm : mp3Buffer));
    mockAnalyzeWithProvider.mockResolvedValue('provider text');
  });

  test('音解析向けには解析用MP3をs16le PCMへ復号し、波形判定を付ける', async () => {
    const controller = new AbortController();
    const media = await prepareAudioFileForAnalysis({
      filePath: INPUT_PATH, workspace: WORKSPACE, signal: controller.signal, includeAcousticProfile: true,
    });

    expect(media).toEqual({
      audioBuffer: mp3Buffer,
      audioFileName: 'audio.mp3',
      acousticProfile: { kind: 'digital-silence', peakDbfs: -200, rmsDbfs: -200, lowLevel: true },
    });
    expect(mockRunFfmpegCommand).toHaveBeenCalledTimes(2);
    expect(mockFfmpeg).toHaveBeenLastCalledWith(path.join(WORKSPACE, 'analysis-audio.mp3'));
    expect(mockCommand.audioCodec).toHaveBeenLastCalledWith('pcm_s16le');
    expect(mockCommand.audioChannels).toHaveBeenLastCalledWith(1);
    expect(mockCommand.audioFrequency).toHaveBeenLastCalledWith(AUDIO_SAMPLE_RATE);
    expect(mockCommand.format).toHaveBeenLastCalledWith('s16le');
    expect(mockCommand.output).toHaveBeenLastCalledWith(PROFILE_PATH);
    expect(mockCommand.outputOptions).toHaveBeenLastCalledWith(['-map', '0:a:0', '-map_metadata', '-1', '-vn', '-sn', '-dn']);
    expect(mockReadSafeRegularFile).toHaveBeenCalledWith({
      filePath: PROFILE_PATH, maxBytes: AUDIO_MAX_BYTES * 4, signal: controller.signal,
    });
  });

  test('既定（文字起こし）ではPCMへ復号せず、波形判定を付けない', async () => {
    const media = await prepareAudioFileForAnalysis({ filePath: INPUT_PATH, workspace: WORKSPACE });
    expect(media).toEqual({ audioBuffer: mp3Buffer, audioFileName: 'audio.mp3' });
    expect(media).not.toHaveProperty('acousticProfile');
    expect(mockRunFfmpegCommand).toHaveBeenCalledTimes(1);
    expect(mockCommand.audioCodec).not.toHaveBeenCalledWith('pcm_s16le');
    expect(mockReadSafeRegularFile).not.toHaveBeenCalledWith(expect.objectContaining({ filePath: PROFILE_PATH }));
  });

  test.each([true, false])('動画音声の抽出でもincludeAcousticProfile=%sに従う', async (includeAcousticProfile) => {
    const media = await extractVideoAudioForAnalysis({
      videoPath: path.join(WORKSPACE, 'source-video.mp4'), streamIndex: 2, workspace: WORKSPACE, includeAcousticProfile,
    });
    expect(media.audioBuffer).toBe(mp3Buffer);
    if (includeAcousticProfile) {
      expect(media.acousticProfile).toEqual(expect.objectContaining({ kind: 'digital-silence' }));
      expect(mockRunFfmpegCommand).toHaveBeenCalledTimes(2);
      expect(mockFfmpeg).toHaveBeenLastCalledWith(path.join(WORKSPACE, 'analysis-video-audio.mp3'));
    } else {
      expect(media).not.toHaveProperty('acousticProfile');
      expect(mockRunFfmpegCommand).toHaveBeenCalledTimes(1);
    }
  });

  test('音解析の説明生成では波形判定をmediaに含めて渡す', async () => {
    const acousticProfile = { kind: 'unknown', peakDbfs: -20, rmsDbfs: -30, lowLevel: false };
    const controller = new AbortController();
    await expect(describePreparedAudioScene(
      { audioBuffer: mp3Buffer, acousticProfile },
      { additionalPrompt: 'trusted', signal: controller.signal }
    )).resolves.toBe('provider text');
    expect(mockAnalyzeWithProvider).toHaveBeenCalledWith({
      kind: 'audioScene',
      additionalPrompt: 'trusted',
      media: { audioBuffer: mp3Buffer, audioFileName: 'audio.mp3', acousticProfile },
      signal: controller.signal,
    });
  });

  test('音声ストリームが1本だけのMP3を許可する', () => {
    expect(validateMp3Probe(validProbe())).toBeDefined();
    expect(() =>
      validateMp3Probe(
        validProbe({
          streams: [
            { codec_type: 'audio', codec_name: 'mp3' },
            { codec_type: 'data', codec_name: 'bin_data' },
          ],
        })
      )
    ).toThrow(expect.objectContaining({ code: 'AI_ANALYSIS_AUDIO_INVALID' }));
    expect(() =>
      validateMp3Probe(validProbe({ format: { format_name: 'wav' } }))
    ).toThrow(expect.objectContaining({ code: 'AI_ANALYSIS_AUDIO_INVALID' }));
  });

  test('変換後の音声にモノラル・16kHzのMP3を要求する', () => {
    expect(() => validateMp3Probe(validProbe(), { transcoded: true })).not.toThrow();
    expect(() =>
      validateMp3Probe(
        validProbe({
          streams: [{ codec_type: 'audio', codec_name: 'mp3', sample_rate: '48000', channels: 2 }],
        }),
        { transcoded: true }
      )
    ).toThrow(expect.objectContaining({ code: 'AI_ANALYSIS_AUDIO_INVALID' }));
  });

  test('動画からは選択した音声トラックだけを取り出す', async () => {
    await transcodeToAnalysisMp3({ inputPath: INPUT_PATH, outputPath: OUTPUT_PATH, streamIndex: 3 });
    expect(mockCommand.outputOptions).toHaveBeenCalledWith([
      '-map', '0:3', '-map_metadata', '-1', '-vn', '-sn', '-dn',
    ]);
  });

  test('ffmpegをモノラル・16kHz・64kbpsで1回実行し、メタデータと他のストリームを除去して中断信号を渡す', async () => {
    const controller = new AbortController();
    await transcodeToAnalysisMp3({
      inputPath: INPUT_PATH,
      outputPath: OUTPUT_PATH,
      signal: controller.signal,
    });

    expect(mockFfmpeg).toHaveBeenCalledWith(INPUT_PATH);
    expect(mockCommand.noVideo).toHaveBeenCalled();
    expect(mockCommand.audioChannels).toHaveBeenCalledWith(1);
    expect(mockCommand.audioFrequency).toHaveBeenCalledWith(AUDIO_SAMPLE_RATE);
    expect(mockCommand.audioCodec).toHaveBeenCalledWith('libmp3lame');
    expect(mockCommand.audioBitrate).toHaveBeenCalledWith(AUDIO_BIT_RATE);
    expect(mockCommand.outputOptions).toHaveBeenCalledWith([
      '-map',
      '0:a:0',
      '-map_metadata',
      '-1',
      '-vn',
      '-sn',
      '-dn',
    ]);
    expect(mockCommand.output).toHaveBeenCalledWith(OUTPUT_PATH);
    expect(mockRunFfmpegCommand).toHaveBeenCalledWith(mockCommand, { signal: controller.signal });
  });
});
