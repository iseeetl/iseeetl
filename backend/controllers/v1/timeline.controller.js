const timelineService = require('../../services/v1/timeline.service');
const { createJsonHandler } = require('./base.controller');

function createTimelineController(io) {
  return {
    listRoom: createJsonHandler(timelineService.listRoomTimeline, io),
    listRoomTags: createJsonHandler(timelineService.listRoomTags, io),
  };
}

module.exports = { createTimelineController };
