const express = require('express');
const { validateUserName, validateLang } = require('../validates/base.validate');
const { finalize } = require('../middlewares/validation');
const guestController = require('../controllers/guest.controller');

const router = express.Router();

router.post('/bootstrap', [validateUserName('guest_name'), validateLang('lang')], finalize, guestController.bootstrap);

router.post('/refresh', finalize, guestController.refresh);

module.exports = router;
