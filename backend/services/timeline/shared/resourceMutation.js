const AppError = require('../../../utils/appError');
const { TIMELINE_MUTABLE_FIELDS } = require('./partialMutation');
const { areRoomTagSetsEqual } = require('./analysisSourceRevision');

function assertResourceContent(item) {
  if (!item.content?.trim() && ![item.image_name, item.video_name, item.audio_name].some(Boolean)) {
    throw new AppError({ code: 'INVALID_PARAMS' });
  }
}

const isUnchangedResource = (current, desired, fields = TIMELINE_MUTABLE_FIELDS) => fields.every((field) =>
  field === 'room_tags'
    ? areRoomTagSetsEqual(current[field], desired[field])
    : (current[field] ?? null) === (desired[field] ?? null));

module.exports = { assertResourceContent, isUnchangedResource };
