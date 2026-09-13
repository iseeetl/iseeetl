const mongoose = require('mongoose');
const { body } = require('express-validator');

const validateConditions = (fieldName) => {
  return body(fieldName)
    .exists()
    .custom((value) => {
      if (typeof value !== 'object' || value === null) {
        throw new Error('conditions must be an object');
      }

      const {
        filterMode,
        showRange,
        keyword,
        keywordArray,
        logicalOperator,
        tags,
        tagSearchOperator,
        noTags,
        animation,
        displayOrder,
        userName,
      } = value;

      if (!['include', 'exclude'].includes(filterMode)) throw new Error('Invalid filterMode');
      if (!['all', 'target'].includes(showRange)) throw new Error('Invalid showRange');

      if (keyword !== null && !(typeof keyword === 'string' && keyword.length <= 200))
        throw new Error('Invalid keyword');
      if (!Array.isArray(keywordArray) || keywordArray.some((k) => !(typeof k === 'string' && k.length <= 200)))
        throw new Error('Invalid keywordArray');

      if (!['or', 'and'].includes(logicalOperator)) throw new Error('Invalid logicalOperator');
      if (!['or', 'and'].includes(tagSearchOperator)) throw new Error('Invalid tagSearchOperator');

      if (!Array.isArray(tags) || tags.some((id) => !mongoose.Types.ObjectId.isValid(id)))
        throw new Error('Invalid tag id(s)');

      if (typeof noTags !== 'boolean') throw new Error('noTags must be boolean');
      if (typeof animation !== 'boolean') throw new Error('animation must be boolean');

      if (
        !Array.isArray(displayOrder) ||
        displayOrder.some((o) => typeof o !== 'object' || typeof o.key !== 'string' || typeof o.display !== 'string')
      )
        throw new Error('Invalid displayOrder');

      if (userName !== null && !(typeof userName === 'string' && userName.length <= 20))
        throw new Error('Invalid userName');

      return true;
    });
};

module.exports = { validateConditions };
