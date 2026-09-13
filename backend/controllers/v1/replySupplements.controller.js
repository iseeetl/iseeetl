const service = require('../../services/v1/replySupplements.service');
const { createJsonHandler } = require('./base.controller');

function createReplySupplementsController(io) {
  return {
    create: createJsonHandler(service.createReplySupplement, io),
    update: createJsonHandler(service.updateReplySupplement, io),
    delete: createJsonHandler(service.deleteReplySupplement, io),
  };
}

module.exports = { createReplySupplementsController };
