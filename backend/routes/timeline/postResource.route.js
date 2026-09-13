const express = require('express');
const ensureJsonWebToken = require('../../middlewares/ensureJsonWebToken');
const controller = require('../../controllers/timeline/postResource.controller');
const children = require('../../controllers/timeline/childResource.controller');
const tags = require('../../controllers/timeline/tagResource.controller');
const query = require('../../controllers/timeline/queryResource.controller');
const optionalRoomMetadataIdentity = require('../../middlewares/optionalRoomMetadataIdentity');

module.exports = () => {
  const router = express.Router();
  const base = '/rooms/:room_id/timeline/posts';
  router.get(base, ensureJsonWebToken, query.list());
  router.post(`${base}/search`, ensureJsonWebToken, query.list(true));
  router.get(`${base}/:post_id`, ensureJsonWebToken, query.detail);
  router.get('/rooms/:room_id/tags', optionalRoomMetadataIdentity, query.roomTags);
  router.post(base, ensureJsonWebToken, controller.create);
  router.patch(`${base}/:post_id`, ensureJsonWebToken, controller.update);
  router.delete(`${base}/:post_id`, ensureJsonWebToken, controller.delete);
  router.put(`${base}/:post_id/tags`, ensureJsonWebToken, tags.handle('post'));
  router.put(`${base}/:post_id/replies/:reply_id/tags`, ensureJsonWebToken, tags.handle('reply'));
  for (const [kind, collection, id] of [
    ['reply', `${base}/:post_id/replies`, 'reply_id'],
    ['postSupplement', `${base}/:post_id/supplements`, 'supplement_id'],
    ['replySupplement', `${base}/:post_id/replies/:reply_id/supplements`, 'supplement_id'],
  ]) {
    router.post(collection, ensureJsonWebToken, children.handle(kind, 'create'));
    router.patch(`${collection}/:${id}`, ensureJsonWebToken, children.handle(kind, 'update'));
    router.delete(`${collection}/:${id}`, ensureJsonWebToken, children.handle(kind, 'delete'));
  }
  return router;
};
