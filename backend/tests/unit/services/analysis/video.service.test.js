const path = require('path');

const mockCommand = Object.fromEntries(
  ['seekInput', 'videoFilters', 'videoCodec', 'outputOptions', 'format', 'output']
    .map((name) => [name, jest.fn()])
);
Object.values(mockCommand).forEach((method) => method.mockReturnValue(mockCommand));
jest.mock('fluent-ffmpeg', () => jest.fn(() => mockCommand));
jest.mock('../../../../services/analysis/provider.service', () => ({ analyzeWithProvider: jest.fn() }));
jest.mock('../../../../services/analysis/image.service', () => ({
  convertImageBufferForAnalysis: jest.fn(),
}));
jest.mock('../../../../services/analysis/mediaPath', () => ({
  ...jest.requireActual('../../../../services/analysis/mediaPath'),
  copySafeRegularFile: jest.fn(),
  readSafeRegularFile: jest.fn(),
}));
jest.mock('../../../../services/analysis/ffmpegRunner', () => ({
  probeMediaFile: jest.fn(),
  runFfmpegCommand: jest.fn(),
}));

const { copySafeRegularFile, readSafeRegularFile } = require('../../../../services/analysis/mediaPath');
const { probeMediaFile, runFfmpegCommand } = require('../../../../services/analysis/ffmpegRunner');
const { convertImageBufferForAnalysis } = require('../../../../services/analysis/image.service');
const {
  VIDEO_MAX_BYTES,
  extractVideoFramesForAnalysis,
  prepareVideoSource,
  validateVideoProbe,
} = require('../../../../services/analysis/video.service');

const stream = (index, codecType, extra = {}) => ({ index, codec_type: codecType, ...extra });
const probe = (streams, format = {}) => ({
  format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '30', ...format },
  streams,
});
const fixtureRoot = path.join(process.cwd(), 'fixture');

describe('AI解析用の動画検証', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    copySafeRegularFile.mockResolvedValue(undefined);
    readSafeRegularFile.mockResolvedValue(Buffer.from('frame'));
    convertImageBufferForAnalysis.mockResolvedValue(Buffer.from('jpeg'));
    runFfmpegCommand.mockResolvedValue(undefined);
  });

  test('mebx・字幕・添付情報と複数の音声があっても映像を選択できる', () => {
    expect(validateVideoProbe(probe([
      stream(0, 'video', { codec_name: 'h264' }),
      stream(1, 'audio', { codec_name: 'aac' }),
      stream(2, 'audio'),
      stream(3, 'data', { codec_tag_string: 'mebx', duration: '60' }),
      stream(4, 'subtitle'),
      stream(5, 'attachment'),
    ]), { streamType: 'video' })).toMatchObject({ streamIndex: 0, duration: 30, skip: false });
  });

  test.each(['hevc', 'vp9', undefined])('映像コーデックを限定しない: %s', (codecName) => {
    expect(validateVideoProbe(probe([
      stream(0, 'video', { codec_name: codecName }),
      stream(1, 'audio', { codec_name: 'opus' }),
    ]), { streamType: 'video' }).streamIndex).toBe(0);
  });

  test.each(['video', 'audio'])('複数の%sトラックでは既定を優先する', (streamType) => {
    expect(validateVideoProbe(probe([
      stream(0, streamType),
      stream(3, streamType, { disposition: { default: 1 } }),
    ]), { streamType }).streamIndex).toBe(3);
  });

  test.each([0, 1])('既定トラックがない場合や複数ある場合は先頭の番号を選ぶ: %s', (isDefault) => {
    expect(validateVideoProbe(probe([
      stream(5, 'audio', { disposition: { default: isDefault } }),
      stream(2, 'audio', { disposition: { default: isDefault } }),
    ]), { streamType: 'audio' }).streamIndex).toBe(2);
  });

  test('既定のサムネイル画像を除外して映像本体を選ぶ', () => {
    expect(validateVideoProbe(probe([
      stream(0, 'video', { disposition: { default: 1, attached_pic: 1 } }),
      stream(1, 'video'),
    ]), { streamType: 'video' }).streamIndex).toBe(1);
  });

  test.each([
    [stream(0, 'video', { codec_name: 'hevc' }), stream(1, 'audio')],
    [stream(0, 'video'), stream(1, 'audio'), stream(2, 'video')],
    [stream(1, 'audio'), stream(2, 'data', { codec_tag_string: 'mebx' })],
  ])('音声の取り出しでは映像の有無・本数・コーデックを制限しない: %j', (...streams) => {
    expect(validateVideoProbe(probe(streams), { streamType: 'audio' }).streamIndex).toBe(1);
  });

  test.each([
    ['video', []],
    ['video', [stream(0, 'audio')]],
    ['video', [stream(0, 'video', { disposition: { attached_pic: 1 } })]],
    ['audio', [stream(0, 'video')]],
  ])('必要な%sトラックがなければ解析を省く', (streamType, streams) => {
    expect(validateVideoProbe(probe(streams), { streamType })).toEqual({ skip: true, reason: 'no_stream' });
  });

  test('選択したトラックの長さを検査し、他のトラックの長さを使わない', () => {
    expect(validateVideoProbe(probe([
      stream(0, 'video', { duration: '30' }),
      stream(1, 'audio', { duration: '60' }),
      stream(2, 'data', { duration: '90' }),
    ], { duration: '90' }), { streamType: 'video' }).duration).toBe(30);
  });

  test('トラックの長さを取得できない場合はコンテナの長さで検査する', () => {
    expect(validateVideoProbe(probe([stream(0, 'video', { duration: 'N/A' })]), {
      streamType: 'video',
    }).duration).toBe(30);
  });

  test.each(['video', 'audio'])('%sの選択トラックが30秒を超えたら拒否する', (streamType) => {
    expect(() => validateVideoProbe(probe([
      stream(0, streamType, { duration: '30.001' }),
    ], { duration: '29' }), { streamType })).toThrow(
      expect.objectContaining({ code: 'AI_ANALYSIS_VIDEO_INVALID' })
    );
  });

  test.each([0, -1, 'N/A', undefined, 30.001])('有効な再生時間を確認できない動画は拒否する: %s', (duration) => {
    expect(() => validateVideoProbe(probe([stream(0, 'video')], { duration }), {
      streamType: 'video',
    })).toThrow(expect.objectContaining({ code: 'AI_ANALYSIS_VIDEO_INVALID' }));
  });

  test.each([-1, undefined, '0', 0.5])('選択トラックの番号が不正な場合は拒否する: %s', (index) => {
    expect(() => validateVideoProbe(probe([stream(index, 'video')]), {
      streamType: 'video',
    })).toThrow(expect.objectContaining({ code: 'AI_ANALYSIS_VIDEO_INVALID' }));
  });

  test('対象コンテナとOggの扱いは維持する', () => {
    expect(validateVideoProbe(probe([stream(0, 'video')], { format_name: 'matroska,webm' }), {
      streamType: 'video',
    }).streamIndex).toBe(0);
    expect(() => validateVideoProbe(probe([stream(0, 'video')], { format_name: 'avi' }), {
      streamType: 'video',
    })).toThrow(expect.objectContaining({ code: 'AI_ANALYSIS_VIDEO_INVALID' }));
    expect(validateVideoProbe(probe([stream(0, 'video')], { format_name: 'ogg' }), {
      streamType: 'video',
    })).toEqual({ skip: true, reason: 'ogg' });
  });

  test('容量制限付きで元ファイルを複製し、要求した音声トラックを返す', async () => {
    const signal = new AbortController().signal;
    probeMediaFile.mockResolvedValueOnce(probe([
      stream(0, 'video'), stream(1, 'audio'), stream(2, 'data', { codec_tag_string: 'mebx' }),
    ]));
    const filePath = path.join(fixtureRoot, 'input.mov');
    const workspace = path.join(fixtureRoot, 'workspace');
    const videoPath = path.join(workspace, 'source-video.mov');
    await expect(prepareVideoSource({ filePath, workspace, streamType: 'audio', signal })).resolves.toMatchObject({
      videoPath, streamIndex: 1, duration: 30,
    });
    expect(copySafeRegularFile).toHaveBeenCalledWith({ filePath, destination: videoPath, maxBytes: VIDEO_MAX_BYTES, signal });
    expect(probeMediaFile).toHaveBeenCalledWith(videoPath, { signal });
  });

  test('選択した映像から25%・50%・75%の3フレームだけを取り出す', async () => {
    const signal = new AbortController().signal;
    const result = await extractVideoFramesForAnalysis({
      videoPath: path.join(fixtureRoot, 'input.mov'),
      streamIndex: 2,
      duration: 20,
      workspace: fixtureRoot,
      signal,
    });
    expect(mockCommand.seekInput.mock.calls).toEqual([[5], [10], [15]]);
    expect(mockCommand.outputOptions).toHaveBeenCalledWith([
      '-map', '0:2', '-frames:v', '1', '-q:v', '3', '-map_metadata', '-1', '-an', '-sn', '-dn',
    ]);
    expect(runFfmpegCommand).toHaveBeenCalledTimes(3);
    expect(runFfmpegCommand).toHaveBeenCalledWith(mockCommand, { signal });
    expect(result.frameBase64s).toEqual(Array(3).fill(Buffer.from('jpeg').toString('base64')));
  });

  test('選択した映像を抽出できなければ失敗を呼び出し元に伝える', async () => {
    const error = new Error('decoder failed');
    runFfmpegCommand.mockRejectedValueOnce(error);
    await expect(extractVideoFramesForAnalysis({
      videoPath: path.join(fixtureRoot, 'invalid.mov'), streamIndex: 0, duration: 10, workspace: fixtureRoot,
    })).rejects.toBe(error);
    expect(convertImageBufferForAnalysis).not.toHaveBeenCalled();
  });
});
