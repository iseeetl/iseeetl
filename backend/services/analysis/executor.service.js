const defaultLogger = require('../../utils/logger');
const { isAIAnalysisExecutionEnabled } = require('./settings/capability');
const { analyzeWithProvider } = require('./provider.service');
const { withPreparedAnalysisInput } = require('./media.service');
const { buildAnalysisSupplement } = require('./output.service');
const { inspectAnalysisResult, persistAnalysisResult } = require('./result.service');
const {
  withAIAnalysisIntegrityLock,
} = require('./settings/referenceIntegrity');
const {
  buildAnalysisSnapshot,
  listMatchingAnalysisSettingIds,
} = require('./snapshot.service');

const isAbortError = (error, signal) =>
  signal?.aborted || error?.name === 'AbortError' || error?.code === 'ABORT_ERR';

const snapshotsReferToSameSource = (prepared, current) =>
  prepared.sourceRevision === current.sourceRevision &&
  prepared.kind === current.kind &&
  prepared.settingId === current.settingId &&
  prepared.settingRevision === current.settingRevision &&
  prepared.triggerTag._id === current.triggerTag._id &&
  prepared.source.image_name === current.source.image_name &&
  prepared.source.video_name === current.source.video_name &&
  prepared.source.audio_name === current.source.audio_name;

const safeLogContext = ({ sourceType, chatId, replyId, settingId }) => ({
  source_type: sourceType,
  source_id: sourceType === 'reply' ? String(replyId || '') : String(chatId || ''),
  setting_id: String(settingId || ''),
});

const createAnalysisExecutor = ({
  executionEnabled = isAIAnalysisExecutionEnabled,
  listSettingIds = listMatchingAnalysisSettingIds,
  buildSnapshot = buildAnalysisSnapshot,
  prepareInput = withPreparedAnalysisInput,
  analyze = analyzeWithProvider,
  buildSupplement = buildAnalysisSupplement,
  inspectResult = inspectAnalysisResult,
  persistResult = persistAnalysisResult,
  withSendLock = withAIAnalysisIntegrityLock,
  logger = defaultLogger,
} = {}) => {
  const executeSetting = async ({
    chatId,
    sourceType,
    replyId,
    settingId,
    io,
    mediaPath,
    signal,
  }) => {
    const preparedSnapshot = await buildSnapshot({
      chatId,
      sourceType,
      replyId,
      settingId,
    });
    if (!preparedSnapshot) return { status: 'skipped' };

    const result = await prepareInput(
      {
        kind: preparedSnapshot.kind,
        mediaRoot: mediaPath,
        source: preparedSnapshot.source,
        signal,
      },
      async (media) => {
        if (signal?.aborted) {
          const error = new Error('AI analysis aborted');
          error.name = 'AbortError';
          throw error;
        }

        // メディア変換中の変更に備え、参照先の変更・削除と同じロック内で再確認し、送信を開始する。
        // 外部APIの応答はロックを解放してから待つ。
        const send = await withSendLock(async () => {
          const snapshot = await buildSnapshot({
            chatId,
            sourceType,
            replyId,
            settingId,
          });
          if (!snapshot || !snapshotsReferToSameSource(preparedSnapshot, snapshot)) return null;
          const resultState = await inspectResult(snapshot);
          if (['idempotent', 'stale', 'deleted', 'conflict', 'missing-source'].includes(resultState)) {
            return { skipStatus: resultState };
          }
          return {
            snapshot,
            responsePromise: analyze({
              kind: snapshot.kind,
              sourceText: snapshot.source.content,
              language: snapshot.source.lang,
              additionalPrompt: snapshot.prompt,
              media,
              signal,
            }),
          };
        });
        if (!send) {
          return { status: 'changed-before-send' };
        }
        if (send.skipStatus) return { status: send.skipStatus, value: null };
        const { snapshot } = send;
        const providerOutput = await send.responsePromise;
        if (!providerOutput) return { status: 'provider-empty' };

        const supplement = await buildSupplement({
          snapshot,
          providerOutput,
          logger,
        });
        if (!supplement) return { status: 'invalid-output' };
        return persistResult({ snapshot, supplement, io, logger });
      }
    );
    return result || { status: 'skipped' };
  };

  const runSourceAnalyses = async ({
    chatId,
    sourceType,
    replyId = null,
    io,
    mediaPath,
    signal,
    kinds = null,
  }) => {
    if (!executionEnabled() || signal?.aborted) return [];
    const settingIds = await listSettingIds({ chatId, sourceType, replyId, kinds });
    const results = [];
    for (const settingId of settingIds) {
      if (signal?.aborted) break;
      try {
        results.push(
          await executeSetting({
            chatId,
            sourceType,
            replyId,
            settingId,
            io,
            mediaPath,
            signal,
          })
        );
      } catch (error) {
        if (isAbortError(error, signal)) break;
        logger.warn('AI_ANALYSIS_SETTING_FAILED', {
          ...safeLogContext({ sourceType, chatId, replyId, settingId }),
          error_code: error?.code || null,
        });
        results.push({ status: 'failed' });
      }
    }
    return results;
  };

  return { executeSetting, runSourceAnalyses };
};

module.exports = {
  createAnalysisExecutor,
  isAbortError,
  snapshotsReferToSameSource,
};
