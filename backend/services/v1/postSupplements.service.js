const postSupplementsService = require('../timeline/postSupplements.service');
const { assertDeveloper } = require('./common');
const {
  adaptPostSupplementCreate,
  adaptPostSupplementDelete,
  adaptPostSupplementUpdate,
} = require('./timelineMutation.adapter');

async function createPostSupplement({ body, jwtPayload, io }) {
  assertDeveloper(jwtPayload);
  const result = await postSupplementsService.create(
    adaptPostSupplementCreate(body),
    jwtPayload,
    io
  );
  return { result };
}

async function updatePostSupplement({ body, jwtPayload, io }) {
  assertDeveloper(jwtPayload);
  const result = await postSupplementsService.update(
    adaptPostSupplementUpdate(body),
    jwtPayload,
    io
  );
  return { result };
}

async function deletePostSupplement({ body, jwtPayload, io }) {
  assertDeveloper(jwtPayload);
  const result = await postSupplementsService.delete(
    adaptPostSupplementDelete(body),
    jwtPayload,
    io
  );
  return { result };
}

module.exports = {
  createPostSupplement,
  deletePostSupplement,
  updatePostSupplement,
};
