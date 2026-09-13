const path = require('path');

const mockAbortActiveMediaProcesses = jest.fn();
const mockGetActiveFfmpegCommandCount = jest.fn(() => 0);
jest.mock('../../../../services/analysis/ffmpegRunner', () => ({
  abortActiveMediaProcesses: mockAbortActiveMediaProcesses,
  getActiveFfmpegCommandCount: mockGetActiveFfmpegCommandCount,
}));

const mockCleanupAllTempWorkspaces = jest.fn();
const mockCleanupTempWorkspace = jest.fn();
const mockCreateTempWorkspace = jest.fn();
const mockGetActiveTempWorkspaceCount = jest.fn(() => 0);
const mockResolveSafeMediaFilePath = jest.fn();
jest.mock('../../../../services/analysis/mediaPath', () => ({
  cleanupAllTempWorkspaces: mockCleanupAllTempWorkspaces,
  cleanupTempWorkspace: mockCleanupTempWorkspace,
  createTempWorkspace: mockCreateTempWorkspace,
  getActiveTempWorkspaceCount: mockGetActiveTempWorkspaceCount,
  resolveSafeMediaFilePath: mockResolveSafeMediaFilePath,
}));

const mockPrepareImageForAnalysis = jest.fn();
jest.mock('../../../../services/analysis/image.service', () => ({
  prepareImageForAnalysis: mockPrepareImageForAnalysis,
}));

const mockExtractVideoAudioForAnalysis = jest.fn();
const mockPrepareAudioFileForAnalysis = jest.fn();
jest.mock('../../../../services/analysis/audio.service', () => ({
  extractVideoAudioForAnalysis: mockExtractVideoAudioForAnalysis,
  prepareAudioFileForAnalysis: mockPrepareAudioFileForAnalysis,
}));

const mockExtractVideoFramesForAnalysis = jest.fn();
const mockPrepareVideoSource = jest.fn();
jest.mock('../../../../services/analysis/video.service', () => ({
  extractVideoFramesForAnalysis: mockExtractVideoFramesForAnalysis,
  prepareVideoSource: mockPrepareVideoSource,
}));

const {
  abortAndCleanupAnalysisMedia,
  withPreparedAnalysisInput,
} = require('../../../../services/analysis/media.service');

const source = {
  floor: '64b000000000000000000001',
  room: '64b000000000000000000002',
  image_name: 'image.jpg',
  audio_name: 'audio.mp3',
  video_name: 'video.mp4',
};
const MEDIA_ROOT = path.join(process.cwd(), 'media');
const TEMP_WORKSPACE = path.join(MEDIA_ROOT, '.ai-analysis-tmp', 'task-fixture');
const SAFE_SOURCE_PATH = path.join(MEDIA_ROOT, 'floor', 'room', 'source');
const VIDEO_SOURCE_PATH = path.join(TEMP_WORKSPACE, 'source-video.mp4');

describe('AI解析用のメディア準備', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAbortActiveMediaProcesses.mockResolvedValue(undefined);
    mockCleanupAllTempWorkspaces.mockResolvedValue(undefined);
    mockCleanupTempWorkspace.mockResolvedValue(true);
    mockCreateTempWorkspace.mockResolvedValue(TEMP_WORKSPACE);
    mockResolveSafeMediaFilePath.mockResolvedValue(SAFE_SOURCE_PATH);
    mockPrepareImageForAnalysis.mockResolvedValue({ imageBase64: 'aW1hZ2U=' });
    mockPrepareAudioFileForAnalysis.mockResolvedValue({
      audioBuffer: Buffer.from('audio'),
      audioFileName: 'audio.mp3',
    });
    mockPrepareVideoSource.mockResolvedValue({
      videoPath: VIDEO_SOURCE_PATH,
      duration: 30,
      audioStreamCount: 1,
    });
    mockExtractVideoFramesForAnalysis.mockResolvedValue({ frameBase64s: ['ZjE=', 'ZjI=', 'ZjM='] });
    mockExtractVideoAudioForAnalysis.mockResolvedValue({
      audioBuffer: Buffer.from('video-audio'),
      audioFileName: 'audio.mp3',
    });
  });

  test('会話解析ではメディア処理をせずコールバックを1回だけ呼ぶ', async () => {
    const callback = jest.fn().mockResolvedValue('result');
    await expect(
      withPreparedAnalysisInput({ kind: 'conversation', mediaRoot: MEDIA_ROOT, source }, callback)
    ).resolves.toBe('result');
    expect(callback).toHaveBeenCalledWith(null);
    expect(mockResolveSafeMediaFilePath).not.toHaveBeenCalled();
    expect(mockCreateTempWorkspace).not.toHaveBeenCalled();
  });

  test('画像解析では実ファイルを検証・変換したJPEGだけをコールバックへ渡す', async () => {
    const controller = new AbortController();
    const callback = jest.fn().mockResolvedValue('result');
    await withPreparedAnalysisInput(
      { kind: 'vision', mediaRoot: MEDIA_ROOT, source, signal: controller.signal },
      callback
    );
    expect(mockResolveSafeMediaFilePath).toHaveBeenCalledWith({
      mediaRoot: MEDIA_ROOT,
      source,
      filename: 'image.jpg',
      signal: controller.signal,
    });
    expect(mockPrepareImageForAnalysis).toHaveBeenCalledWith({
      filePath: SAFE_SOURCE_PATH,
      signal: controller.signal,
    });
    expect(callback).toHaveBeenCalledWith({ imageBase64: 'aW1hZ2U=' });
  });

  test.each(['audioScene', 'speech'])('%sのMP3を変換し、処理終了時に作業ディレクトリを削除する', async (kind) => {
    const callback = jest.fn().mockResolvedValue('result');
    await expect(
      withPreparedAnalysisInput({ kind, mediaRoot: MEDIA_ROOT, source }, callback)
    ).resolves.toBe('result');
    expect(mockPrepareAudioFileForAnalysis).toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ audioBuffer: expect.any(Buffer), audioFileName: 'audio.mp3' })
    );
    expect(mockCleanupTempWorkspace).toHaveBeenCalledTimes(1);
  });

  test('動画解析は25/50/75% フレームをコールバックへ渡す', async () => {
    const callback = jest.fn().mockResolvedValue('result');
    await withPreparedAnalysisInput(
      {
        kind: 'video',
        mediaRoot: MEDIA_ROOT,
        source: { ...source, audio_name: null },
      },
      callback
    );
    expect(mockExtractVideoFramesForAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ duration: 30 })
    );
    expect(callback).toHaveBeenCalledWith({ frameBase64s: ['ZjE=', 'ZjI=', 'ZjM='] });
    expect(mockCleanupTempWorkspace).toHaveBeenCalledTimes(1);
  });

  test('Oggまたは音声ストリームがない動画ではコールバックを呼ばず後処理する', async () => {
    mockPrepareVideoSource.mockResolvedValueOnce(null);
    const callback = jest.fn();
    await expect(
      withPreparedAnalysisInput(
        {
          kind: 'speech',
          mediaRoot: MEDIA_ROOT,
          source: { ...source, audio_name: null },
        },
        callback
      )
    ).resolves.toBeNull();
    expect(callback).not.toHaveBeenCalled();
    expect(mockCleanupTempWorkspace).toHaveBeenCalledTimes(1);

    mockPrepareVideoSource.mockResolvedValueOnce({ videoPath: 'fixture', duration: 1, audioStreamCount: 0 });
    await expect(
      withPreparedAnalysisInput(
        {
          kind: 'audioScene',
          mediaRoot: MEDIA_ROOT,
          source: { ...source, audio_name: null },
        },
        callback
      )
    ).resolves.toBeNull();
    expect(callback).not.toHaveBeenCalled();
    expect(mockCleanupTempWorkspace).toHaveBeenCalledTimes(2);
  });

  test('外部サービスのエラーや中断でも作業ディレクトリを削除し、元のエラーを維持する', async () => {
    const error = Object.assign(new Error('aborted'), { name: 'AbortError', code: 'ABORT_ERR' });
    const callback = jest.fn().mockRejectedValue(error);
    await expect(
      withPreparedAnalysisInput({ kind: 'speech', mediaRoot: MEDIA_ROOT, source }, callback)
    ).rejects.toBe(error);
    expect(mockCleanupTempWorkspace).toHaveBeenCalledTimes(1);
  });

  test('後処理に失敗しても外部サービスのエラーを維持し、終了時の再処理対象へ残す', async () => {
    const providerError = new Error('provider failed');
    mockCleanupTempWorkspace.mockRejectedValueOnce(new Error('cleanup failed'));
    const callback = jest.fn().mockRejectedValue(providerError);
    await expect(
      withPreparedAnalysisInput({ kind: 'speech', mediaRoot: MEDIA_ROOT, source }, callback)
    ).rejects.toBe(providerError);
    expect(mockCleanupTempWorkspace).toHaveBeenCalledTimes(1);
  });

  test('処理成功後の後処理失敗は成功扱いにせずエラーを返す', async () => {
    const cleanupError = new Error('cleanup failed');
    mockCleanupTempWorkspace.mockRejectedValueOnce(cleanupError);
    const callback = jest.fn().mockResolvedValue('provider result');
    await expect(
      withPreparedAnalysisInput({ kind: 'speech', mediaRoot: MEDIA_ROOT, source }, callback)
    ).rejects.toBe(cleanupError);
  });

  test('終了処理では実行中のプロセスが終了してから残存する作業ディレクトリを削除する', async () => {
    let releaseProcesses;
    mockAbortActiveMediaProcesses.mockReturnValue(
      new Promise((resolve) => {
        releaseProcesses = resolve;
      })
    );

    const cleanup = abortAndCleanupAnalysisMedia();
    await Promise.resolve();
    expect(mockCleanupAllTempWorkspaces).not.toHaveBeenCalled();
    releaseProcesses();
    await cleanup;
    expect(mockCleanupAllTempWorkspaces).toHaveBeenCalledTimes(1);
    expect(mockAbortActiveMediaProcesses.mock.invocationCallOrder[0]).toBeLessThan(
      mockCleanupAllTempWorkspaces.mock.invocationCallOrder[0]
    );
  });
});
