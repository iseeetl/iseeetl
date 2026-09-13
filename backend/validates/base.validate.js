const validator = require('validator');
const { body, param, query } = require('express-validator');
const { ALLOWED_LANGUAGES } = require('../constants/languages');

const validatePage = (fieldName) => {
  return body(fieldName)
    .exists()
    .bail()
    .custom((value) => {
      if (typeof value === 'number') {
        return Number.isSafeInteger(value) && value >= 1;
      }
      if (typeof value !== 'string' || !/^\d+$/.test(value)) return false;
      const page = Number(value);
      return Number.isSafeInteger(page) && page >= 1;
    })
    .bail()
    .customSanitizer((value) => Number(value));
};

const validateSearch = (fieldName) => {
  return body(fieldName)
    .exists()
    .custom((value) => value === null || (typeof value === 'string' && value.length <= 100));
};

const validateOptionalSearch = (fieldName) => {
  return body(fieldName)
    .optional({ nullable: true })
    .custom((value) => typeof value === 'string' && value.length <= 100);
};

const validateDateTime = (fieldName) => {
  return body(fieldName)
    .exists()
    .custom((value) => {
      if (value === null) return true;
      if (!validator.isISO8601(value)) {
        throw new Error('Invalid date format');
      }
      return true;
    });
};

const validateFrom = (fieldName) => {
  return validateDateTime(fieldName);
};

const validateTo = (fieldName) => {
  return validateDateTime(fieldName);
};

const validateUUID = (fieldName) => {
  return body(fieldName).exists().isUUID();
};

const validateMongoId = (fieldName, options = { required: true }) => {
  if (options.required) {
    return body(fieldName).exists().isMongoId();
  }
  return body(fieldName).optional().isMongoId();
};

const validateTitle = (fieldName) => {
  return body(fieldName).exists().isString().isLength({ max: 100 }).notEmpty();
};

const validateUserName = (fieldName) => {
  return body(fieldName).exists().isString().isLength({ max: 20 }).notEmpty();
};

const validateContent = (fieldName) => {
  return body(fieldName)
    .exists()
    .custom((value) => value === null || (typeof value === 'string' && value.length <= 400));
};

const validateContentNotNull = (fieldName) => {
  return body(fieldName)
    .exists()
    .custom((value) => typeof value === 'string' && value.length <= 400);
};

const validateTargetLangs = (fieldName) => {
  return body(fieldName)
    .exists()
    .bail()
    .isArray()
    .bail()
    .custom((values) => {
      if (values.length > ALLOWED_LANGUAGES.length) {
        throw new Error(`Too many target languages (max: ${ALLOWED_LANGUAGES.length})`);
      }
      return true;
    })
    .customSanitizer((values) => {
      const normalizedValues = values.map((value) =>
        typeof value === 'string' ? value.trim().toLowerCase() : value
      );
      return Array.from(new Set(normalizedValues));
    })
    .custom((values) => {
      if (values.some((value) => typeof value !== 'string' || !ALLOWED_LANGUAGES.includes(value))) {
        throw new Error('Target languages must be supported language codes');
      }
      return true;
    });
};

const validateLang = (fieldName) => {
  return body(fieldName)
    .exists()
    .bail()
    .isString()
    .bail()
    .customSanitizer((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v))
    .custom((value) => {
      if (!validator.isISO6391(value)) {
        throw new Error('Invalid language code (must be ISO 639-1)');
      }
      if (!ALLOWED_LANGUAGES.includes(value)) {
        throw new Error(`Unsupported language: ${value}`);
      }
      return true;
    });
};

const validateLangQueryOptional = (fieldName) => {
  return query(fieldName)
    .optional({ nullable: true })
    .isString()
    .bail()
    .customSanitizer((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v))
    .custom((value) => {
      if (typeof value === 'undefined' || value === null || value === '') return true;
      if (!validator.isISO6391(value)) throw new Error('Invalid language code (must be ISO 639-1)');
      if (!ALLOWED_LANGUAGES.includes(value)) throw new Error(`Unsupported language: ${value}`);
      return true;
    });
};

const validateRoomTags = (fieldName) => {
  return body(fieldName).exists().isArray();
};

const validateRoomTagItem = (fieldName) => {
  return body(fieldName).isMongoId();
};

const validateAnimation = (fieldName) => {
  return body(fieldName)
    .exists()
    .custom((value) => {
      if (value === 'move-and-erase' || value === null) {
        return true;
      }
      throw new Error('Invalid animation value');
    });
};

const validateKeyup = (fieldName) => {
  return body(fieldName).exists().isString().isLength({ max: 5000 });
};

const validateNotifyAll = (fieldName) => {
  return body(fieldName).exists().isBoolean();
};

const validateString = (fieldName, { min = 1, max = 10000 } = {}) => {
  return body(fieldName).exists().isString().isLength({ min, max });
};

const validateParamMongoId = (fieldName) => {
  return param(fieldName).exists().isMongoId();
};

const validateOptionalQueryString = (fieldName, { max = 255 } = {}) => {
  return query(fieldName)
    .optional({ nullable: true })
    .isString()
    .isLength({ max });
};

module.exports = {
  validatePage,
  validateSearch,
  validateOptionalSearch,
  validateDateTime,
  validateFrom,
  validateTo,
  validateUUID,
  validateMongoId,
  validateTitle,
  validateUserName,
  validateContent,
  validateContentNotNull,
  validateTargetLangs,
  validateLang,
  validateLangQueryOptional,
  validateRoomTags,
  validateRoomTagItem,
  validateAnimation,
  validateKeyup,
  validateNotifyAll,
  validateString,
  validateParamMongoId,
  validateOptionalQueryString,
};
