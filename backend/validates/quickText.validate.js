const { body, param, query } = require('express-validator');
const validator = require('validator');
const AppError = require('../utils/appError');
const { ALLOWED_LANGUAGES } = require('../constants/languages');
const { finalize } = require('../middlewares/validation');

const requireAtLeastOneOf = (fields) => (req, _res, next) => {
  const hasAny = fields.some((f) => Object.prototype.hasOwnProperty.call(req.body, f));
  if (!hasAny) return next(new AppError({ code: 'NO_UPDATABLE_FIELD' }));
  next();
};

const langCheck = (value) => {
  if (value == null) return true;
  if (!validator.isISO6391(value)) throw new Error('Invalid language code (must be ISO 639-1)');
  if (!ALLOWED_LANGUAGES.includes(value)) throw new Error(`Unsupported language: ${value}`);
  return true;
};

const paramId = (name = 'id') => param(name).exists().isMongoId();
const paramGroupId = (name = 'groupId') => param(name).exists().isMongoId();
const paramFloorId = (name = 'floorId') => param(name).exists().isMongoId();
const paramRoomId = (name = 'roomId') => param(name).exists().isMongoId();

const queryPageOptional = () => query('page').optional({ nullable: true }).toInt().isInt({ min: 1 });
const queryLangOptional = () =>
  query('lang')
    .optional({ nullable: true })
    .isString()
    .customSanitizer((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v))
    .custom(langCheck);

const bodyTitleRequired = () =>
  body('title').exists({ checkFalsy: true }).isString().trim().isLength({ min: 1, max: 200 });
const bodyLabelRequired = () =>
  body('label').exists({ checkFalsy: true }).isString().trim().isLength({ min: 1, max: 200 });
const bodyLangRequired = () =>
  body('lang')
    .exists({ checkFalsy: true })
    .isString()
    .customSanitizer((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v))
    .custom(langCheck);

const bodyOrderOptional = () => body('order').optional().isInt({ min: 1, max: 100 });
const bodyTitleOptional = () => body('title').optional().isString().trim().isLength({ min: 1, max: 200 });
const bodyLabelOptional = () => body('label').optional().isString().trim().isLength({ min: 1, max: 200 });
const bodyLangOptional = () =>
  body('lang')
    .optional({ nullable: true })
    .isString()
    .customSanitizer((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v))
    .custom(langCheck);

// 管理者用の単語マスタ
const master = {
  group: {
    list: [queryPageOptional(), queryLangOptional(), finalize],
    create: [bodyTitleRequired(), bodyLangRequired(), finalize],
    update: [
      paramId(),
      bodyOrderOptional(),
      bodyTitleOptional(),
      bodyLangOptional(),
      requireAtLeastOneOf(['order', 'title', 'lang']),
      finalize,
    ],
    remove: [paramId(), finalize],
  },
  item: {
    list: [paramGroupId(), queryLangOptional(), finalize],
    create: [paramGroupId(), bodyLabelRequired(), bodyLangRequired(), finalize],
    update: [
      paramId(),
      bodyOrderOptional(),
      bodyLabelOptional(),
      bodyLangOptional(),
      requireAtLeastOneOf(['order', 'label', 'lang']),
      finalize,
    ],
    remove: [paramId(), finalize],
  },
};

// フロア内の単語グループ・単語
const floor = {
  group: {
    list: [paramFloorId(), queryLangOptional(), finalize],
    create: [paramFloorId(), bodyTitleRequired(), bodyLangRequired(), finalize],
    update: [
      paramFloorId(),
      paramId(),
      bodyOrderOptional(),
      bodyTitleOptional(),
      bodyLangOptional(),
      requireAtLeastOneOf(['order', 'title', 'lang']),
      finalize,
    ],
    remove: [paramFloorId(), paramId(), finalize],
  },
  item: {
    list: [paramFloorId(), paramGroupId(), queryLangOptional(), finalize],
    create: [paramFloorId(), paramGroupId(), bodyLabelRequired(), bodyLangRequired(), finalize],
    update: [
      paramFloorId(),
      paramId(),
      bodyOrderOptional(),
      bodyLabelOptional(),
      bodyLangOptional(),
      requireAtLeastOneOf(['order', 'label', 'lang']),
      finalize,
    ],
    remove: [paramFloorId(), paramId(), finalize],
  },
};

// ルーム内の単語グループ・単語。公開ルームの一覧取得にも同じ入力検証を適用する。
const room = {
  group: {
    list: [paramRoomId(), queryLangOptional(), finalize],
    create: [paramRoomId(), bodyTitleRequired(), bodyLangRequired(), finalize],
    update: [
      paramRoomId(),
      paramId(),
      bodyOrderOptional(),
      bodyTitleOptional(),
      bodyLangOptional(),
      requireAtLeastOneOf(['order', 'title', 'lang']),
      finalize,
    ],
    remove: [paramRoomId(), paramId(), finalize],
  },
  item: {
    list: [paramRoomId(), paramGroupId(), queryLangOptional(), finalize],
    create: [paramRoomId(), paramGroupId(), bodyLabelRequired(), bodyLangRequired(), finalize],
    update: [
      paramRoomId(),
      paramId(),
      bodyOrderOptional(),
      bodyLabelOptional(),
      bodyLangOptional(),
      requireAtLeastOneOf(['order', 'label', 'lang']),
      finalize,
    ],
    remove: [paramRoomId(), paramId(), finalize],
  },
};

module.exports = {
  master,
  floor,
  room,
};
