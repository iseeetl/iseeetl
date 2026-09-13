const service = require('../../services/v1/postSupplements.service');
const { createJsonHandler } = require('./base.controller');

function createPostSupplementsController(io) {
  return {
    create: createJsonHandler(service.createPostSupplement, io),
    update: createJsonHandler(service.updatePostSupplement, io),
    delete: createJsonHandler(service.deletePostSupplement, io),
  };
}

module.exports = { createPostSupplementsController };
