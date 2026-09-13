const repliesService = require('../../services/v1/replies.service');
const { createJsonHandler } = require('./base.controller');

function createRepliesController(io) {
  return {
    create: createJsonHandler(repliesService.createReply, io),
    update: createJsonHandler(repliesService.updateReply, io),
    delete: createJsonHandler(repliesService.deleteReply, io),
  };
}

module.exports = { createRepliesController };
