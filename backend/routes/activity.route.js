const express = require('express');
const userAuth = require('../middlewares/ensureJsonWebToken');
const guestAuth = require('../middlewares/guestAuth');
const { principal } = require('../services/activity/access');
const service = require('../services/activity/history.service');
const AppError = require('../utils/appError');
module.exports = () => {
  const router = express.Router();
  router.use('/rooms/:roomId/activity', (req, res, next) => {
    if (process.env.ACTIVITY_NOTIFICATIONS_ENABLED !== 'true') return next(new AppError({ code: 'NOT_FOUND' }));
    (req.get('authorization') ? userAuth : guestAuth)(req, res, error => {
      if (req.guest && req.body) delete req.body.guest_id;
      next(error);
    });
  });
  const run = fn => async (req, res, next) => { try { res.json(await fn(req, principal(req))); } catch (error) { next(error); } };
  const base = '/rooms/:roomId/activity';
  router.post(`${base}/search`, run((req, who) => service.list(req.params.roomId, who, req.body)));
  router.get(base, run((req, who) => service.list(req.params.roomId, who, req.query)));
  router.get(`${base}/preferences`, run((req, who) => service.getPreferences(req.params.roomId, who)));
  router.put(`${base}/preferences`, run((req, who) => service.savePreferences(req.params.roomId, who, req.body)));
  router.post(`${base}/read`, run((req, who) => service.markRead(req.params.roomId, who, req.body.eventIds)));
  router.get(`${base}/subscriptions`, run((req, who) => service.listSubscriptions(req.params.roomId, who)));
  router.put(`${base}/subscriptions/:postId`, run((req, who) => service.setSubscription(req.params.roomId, who, req.params.postId, req.body.enabled)));
  router.get(`${base}/:eventId/target`, run((req, who) => service.openTarget(req.params.roomId, who, req.params.eventId)));
  return router;
};
