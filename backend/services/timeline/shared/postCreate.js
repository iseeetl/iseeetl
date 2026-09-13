const Chat = require('../../../models/Chat');
const { replaceSpams } = require('../../../services/spam.service');
const { emitPostCreate, notifyPostFilterMatch } = require('./postNotifications');

async function createTimelinePost({ content, buildCreateData, buildResult, notify, io }) {
  const replacedContent = await replaceSpams(content || '');
  const createdChat = await Chat.create({
    ...buildCreateData({ replacedContent }),
    analysis_source_revision: 1,
  });
  const responseChat = buildResult ? await buildResult(createdChat) : createdChat;

  if (notify) {
    await notifyPostFilterMatch({ ...notify, content: replacedContent });
  }

  await emitPostCreate(io, responseChat);

  return { responseChat, replacedContent, createdChat };
}

module.exports = {
  createTimelinePost,
};
