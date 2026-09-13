const {
  abortActiveMediaProcesses,
  getActiveFfmpegCommandCount,
} = require('./ffmpegRunner');
const {
  cleanupAllTempWorkspaces,
  cleanupTempWorkspace,
  createTempWorkspace,
  getActiveTempWorkspaceCount,
  resolveSafeMediaFilePath,
} = require('./mediaPath');
const { prepareImageForAnalysis } = require('./image.service');
const {
  extractVideoAudioForAnalysis,
  prepareAudioFileForAnalysis,
} = require('./audio.service');
const {
  extractVideoFramesForAnalysis,
  prepareVideoSource,
} = require('./video.service');

const MEDIA_KINDS = new Set(['vision', 'audioScene', 'speech', 'video']);

// 送信時点のフロア・ルームIDとメディア名をsourceで受け取り、mediaRoot配下から読み込む。
// callbackには画像（imageBase64）、動画フレーム（frameBase64s）、または音声（audioBuffer・audioFileName）を渡す。
// conversationではcallback(null)を呼ぶ。ファイル名がない場合や解析対象外の動画は、callbackを呼ばずnullを返す。
// ファイル検証・読み込み・中止時のエラーは呼び出し元へ伝える。
const withPreparedAnalysisInput = async (
  { kind, mediaRoot, source, signal } = {},
  callback
) => {
  if (typeof callback !== 'function') throw new TypeError('analysis media callback is required');
  if (kind === 'conversation') return callback(null);
  if (!MEDIA_KINDS.has(kind)) throw new TypeError('unsupported analysis media kind');

  if (kind === 'vision') {
    if (!source?.image_name) return null;
    const imagePath = await resolveSafeMediaFilePath({
      mediaRoot,
      source,
      filename: source.image_name,
      signal,
    });
    const media = await prepareImageForAnalysis({ filePath: imagePath, signal });
    return callback(media);
  }

  const filename = kind === 'video'
    ? source?.video_name
    : source?.audio_name || source?.video_name;
  if (!filename) return null;
  const filePath = await resolveSafeMediaFilePath({ mediaRoot, source, filename, signal });
  const workspace = await createTempWorkspace({ mediaRoot, signal });
  let operationError = null;
  try {
    if (kind === 'video') {
      const video = await prepareVideoSource({ filePath, workspace, signal });
      if (!video) return null;
      return await callback(
        await extractVideoFramesForAnalysis({
          videoPath: video.videoPath,
          duration: video.duration,
          workspace,
          signal,
        })
      );
    }

    if (source?.audio_name) {
      return await callback(await prepareAudioFileForAnalysis({ filePath, workspace, signal }));
    }

    const video = await prepareVideoSource({ filePath, workspace, signal });
    if (!video || video.audioStreamCount !== 1) return null;
    return await callback(
      await extractVideoAudioForAnalysis({
        videoPath: video.videoPath,
        workspace,
        signal,
      })
    );
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try {
      await cleanupTempWorkspace(workspace);
    } catch (cleanupError) {
      // 終了時に削除を再試行できるよう、一時ディレクトリの登録を残す。
      // 解析やメディア処理でエラーが出ている場合は、削除エラーで置き換えない。
      if (!operationError) throw cleanupError;
    }
  }
};

const abortAndCleanupAnalysisMedia = async () => {
  await abortActiveMediaProcesses();
  await cleanupAllTempWorkspaces();
};

const getAnalysisMediaRuntimeState = () => ({
  activeFfmpegCommands: getActiveFfmpegCommandCount(),
  activeTempWorkspaces: getActiveTempWorkspaceCount(),
});

module.exports = {
  abortAndCleanupAnalysisMedia,
  getAnalysisMediaRuntimeState,
  withPreparedAnalysisInput,
  ...require('./mediaPath'),
  ...require('./image.service'),
  ...require('./video.service'),
  ...require('./audio.service'),
};
