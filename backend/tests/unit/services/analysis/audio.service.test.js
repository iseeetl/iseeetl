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
jest.mock('../../../../services/analysis/ffmpegRunner', () => ({
  probeMediaFile: jest.fn(),
  runFfmpegCommand: mockRunFfmpegCommand,
}));
jest.mock('../../../../services/analysis/provider.service', () => ({
  analyzeWithProvider: jest.fn(),
}));

const {
  AUDIO_BIT_RATE,
  AUDIO_SAMPLE_RATE,
  transcodeToAnalysisMp3,
  validateMp3Probe,
} = require('../../../../services/analysis/audio.service');

const FIXTURE_ROOT = path.join(process.cwd(), 'fixture');
const INPUT_PATH = path.join(FIXTURE_ROOT, 'input.mp3');
const OUTPUT_PATH = path.join(FIXTURE_ROOT, 'output.mp3');

const validProbe = (overrides = {}) => ({
  format: { format_name: 'mp3', ...(overrides.format || {}) },
  streams: overrides.streams || [
    { codec_type: 'audio', codec_name: 'mp3', sample_rate: '16000', channels: 1 },
  ],
});

describe('AI解析用の音声変換', () => {
  beforeEach(() => jest.clearAllMocks());

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
