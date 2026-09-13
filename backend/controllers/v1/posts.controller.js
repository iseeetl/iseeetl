const postsService = require('../../services/v1/posts.service');
const { createJsonHandler } = require('./base.controller');

function createPostsController(io) {
  return {
    create: createJsonHandler(postsService.createPost, io),
    update: createJsonHandler(postsService.updatePost, io),
    delete: createJsonHandler(postsService.deletePost, io),
  };
}

module.exports = { createPostsController };
