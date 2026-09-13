const Chat = require('../../../models/Chat');
const serializeTimeline = require('./timelineSerializer');
const { replaceSpams } = require('../../../services/spam.service');
const AppError = require('../../../utils/appError');

async function createTimelineReply({ postId, content, buildReply, populate }) {
  const replacedContent = await replaceSpams(content || '');
  const newReply = {
    ...buildReply({ replacedContent }),
    analysis_source_revision: 1,
  };

  const updatedChat = await Chat.findOneAndUpdate(
    { _id: postId, delete_flg: false },
    { $push: { replies: newReply } },
    { new: true, runValidators: true }
  );
  if (!updatedChat) throw new AppError({ code: 'INVALID_PARAMS' });

  const populatedChat = await updatedChat.populate(populate);
  const responseChat = serializeTimeline(populatedChat);

  return { responseChat, updatedChat, replacedContent };
}

module.exports = {
  createTimelineReply,
};
