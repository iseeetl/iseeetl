const postsService = require('../timeline/posts.service');
const { assertDeveloper } = require('./common');
const {
  adaptPostCreate,
  adaptPostDelete,
  adaptPostUpdate,
} = require('./timelineMutation.adapter');

async function createPost({ body, jwtPayload, io }) {
  assertDeveloper(jwtPayload);
  const result = await postsService.create(adaptPostCreate(body), jwtPayload, io);
  return { result };
}

async function updatePost({ body, jwtPayload, io }) {
  assertDeveloper(jwtPayload);
  const result = await postsService.update(adaptPostUpdate(body), jwtPayload, io);
  return { result };
}

async function deletePost({ body, jwtPayload, io }) {
  assertDeveloper(jwtPayload);
  const result = await postsService.delete(adaptPostDelete(body), jwtPayload, io);
  return { result };
}

module.exports = {
  createPost,
  deletePost,
  updatePost,
};
