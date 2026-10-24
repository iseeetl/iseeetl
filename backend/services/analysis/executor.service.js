const { conversationBodyLimit } = require('./conversationBudget');
const defaultLogger = require('../../utils/logger');
const { errorLogDetails, safeDiagnostic } = require('../../utils/errorLogDetails');
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
  post_id: String(chatId || ''),
  reply_id: replyId ? String(replyId) : null,
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
    guest = false,
  }) => {
    const startedAt = Date.now();
    const context = {
      ...safeLogContext({ sourceType, chatId, replyId, settingId }),
      kind: null,
      stage: 'snapshot',
    };
    try {
      const preparedSnapshot = await buildSnapshot({
        chatId,
        sourceType,
        replyId,
        settingId,
        guest,
      });
      if (!preparedSnapshot) return { status: 'skipped' };

      context.kind = preparedSnapshot.kind;
      context.stage = 'media_prepare';
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
          context.stage = 'before_send';
          let lastResponse = {};
          const beginSend = (previousAnswer) => withSendLock(async () => {
            if (signal?.aborted) throw Object.assign(new Error('AI analysis aborted'), { name: 'AbortError' });
            const snapshot = await buildSnapshot({
              chatId,
              sourceType,
              replyId,
              settingId,
              guest,
            });
            if (!snapshot || !snapshotsReferToSameSource(preparedSnapshot, snapshot)) return null;
            const resultState = await inspectResult(snapshot);
            if (['idempotent', 'stale', 'deleted', 'conflict', 'missing-source'].includes(resultState)) {
              return { skipStatus: resultState };
            }
            context.stage = 'provider';
            return {
              snapshot,
              responsePromise: analyze({
                kind: snapshot.kind,
                sourceText: snapshot.source.content,
                language: snapshot.source.lang,
                additionalPrompt: snapshot.prompt,
                media,
                signal,
                ...(snapshot.kind === 'conversation' ? {
                  maxAnswerUtf16: conversationBodyLimit(snapshot),
                  previousAnswer,
                  onResponse: (details) => {
                    lastResponse = details;
                    logger.info('AI_CONVERSATION_RESPONSE', {
                    ...context, attempt: previousAnswer ? 2 : 1,
                    finish_reason: safeDiagnostic(details.finish_reason),
                    request_id: safeDiagnostic(details.request_id),
                    http_status: details.http_status, elapsed_ms: Date.now() - startedAt,
                    });
                  },
                } : {}),
              }),
            };
          });
          const send = await beginSend();
          if (!send) {
            return { status: 'changed-before-send' };
          }
          if (send.skipStatus) return { status: send.skipStatus, value: null };
          const { snapshot } = send;
          let providerOutput;
          if (snapshot.kind === 'conversation') {
            const limit = conversationBodyLimit(snapshot);
            let attempt = 1;
            try {
              providerOutput = await send.responsePromise;
              if (typeof providerOutput === 'string' && providerOutput.trim().length > limit) {
                logger.warn('AI_CONVERSATION_SHORTENING', {
                  ...context, attempt, utf16_units: providerOutput.trim().length,
                  code_points: [...providerOutput.trim()].length, limit,
                  elapsed_ms: Date.now() - startedAt,
                });
                const retry = await beginSend(providerOutput.trim());
                if (!retry) return { status: 'changed-before-send' };
                if (retry.skipStatus) return { status: retry.skipStatus, value: null };
                attempt = 2;
                providerOutput = await retry.responsePromise;
              }
              const text = typeof providerOutput === 'string' ? providerOutput.trim() : '';
              if (!text || text.length > limit) {
                throw Object.assign(new Error('Invalid conversation output'), {
                  code: 'AI_ANALYSIS_OUTPUT_INVALID', reason: text ? 'too_long' : 'empty',
                  outputUnits: text.length, outputCodePoints: [...text].length,
                });
              }
              providerOutput = text;
            } catch (error) {
              if (isAbortError(error, signal)) throw error;
              logger.error('AI_CONVERSATION_FAILED', {
                ...context, attempt, ...errorLogDetails(error), reason: safeDiagnostic(error.reason),
                finish_reason: safeDiagnostic(lastResponse.finish_reason),
                response_request_id: safeDiagnostic(lastResponse.request_id),
                utf16_units: error.outputUnits ?? null, code_points: error.outputCodePoints ?? null,
                limit, elapsed_ms: Date.now() - startedAt,
              });
              providerOutput = { status: 'conversation-failed' };
            }
          } else {
            providerOutput = await send.responsePromise;
          }
          if (!providerOutput) {
            logger.error('AI_ANALYSIS_OUTPUT_INVALID', {
              ...context, stage: 'output_validation', reason: 'empty', elapsed_ms: Date.now() - startedAt,
            });
            return { status: 'provider-empty' };
          }

          context.stage = 'output';
          const supplement = await buildSupplement({
            snapshot,
            providerOutput,
            logger,
            startedAt,
          });
          if (!supplement) return { status: 'invalid-output' };
          context.stage = 'persist';
          return persistResult({ snapshot, supplement, io, logger });
        }
      );
      return result || { status: 'skipped' };
    } catch (error) {
      if (!isAbortError(error, signal)) {
        const invalidOutput = error?.code === 'AI_ANALYSIS_OUTPUT_INVALID';
        const stage = invalidOutput ? 'output_validation'
          : error?.code === 'AI_ANALYSIS_MEDIA_CLEANUP_FAILED' ? 'media_cleanup' : context.stage;
        logger.error(invalidOutput ? 'AI_ANALYSIS_OUTPUT_INVALID' : 'AI_ANALYSIS_SETTING_FAILED', {
          ...context,
          stage,
          elapsed_ms: Date.now() - startedAt,
          ...errorLogDetails(error),
          ...(invalidOutput ? { reason: safeDiagnostic(error.reason) } : {}),
        });
      }
      throw error;
    }
  };

  const runSourceAnalyses = async ({
    chatId,
    sourceType,
    replyId = null,
    io,
    mediaPath,
    signal,
    kinds = null,
    guest = false,
  }) => {
    if (!executionEnabled() || signal?.aborted) return [];
    let settingIds;
    const startedAt = Date.now();
    try {
      settingIds = await listSettingIds({
        chatId, sourceType, replyId, kinds: guest ? ['conversation'] : kinds,
      });
    } catch (error) {
      if (isAbortError(error, signal)) return [];
      logger.error('AI_ANALYSIS_SOURCE_FAILED', {
        ...safeLogContext({ sourceType, chatId, replyId }),
        kind: null,
        stage: 'settings_lookup',
        elapsed_ms: Date.now() - startedAt,
        ...errorLogDetails(error),
      });
      return [{ status: 'failed' }];
    }
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
            guest,
          })
        );
      } catch (error) {
        if (isAbortError(error, signal)) break;
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
