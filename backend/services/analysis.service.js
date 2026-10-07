// 投稿・返信ごとに登録された一つの処理内で、該当するルームの有効なAI解析設定を順番に実行する。

const { createAnalysisExecutor } = require('./analysis/executor.service');

const executor = createAnalysisExecutor();

const runPostAnalyses = ({ chatId, io, mediaPath, signal, guest = false }) =>
  executor.runSourceAnalyses({
    chatId,
    sourceType: 'post',
    io,
    mediaPath,
    signal,
    guest,
  });

const runReplyAnalyses = ({ chatId, replyId, io, mediaPath, signal, guest = false }) =>
  executor.runSourceAnalyses({
    chatId,
    sourceType: 'reply',
    replyId,
    io,
    mediaPath,
    signal,
    guest,
  });

module.exports = {
  createAnalysisExecutor,
  runPostAnalyses,
  runReplyAnalyses,
};
