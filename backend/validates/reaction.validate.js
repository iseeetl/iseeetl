const { body } = require('express-validator');

const validateReactionType = (fieldName) => {
  return body(fieldName)
    .exists()
    .custom(
      (value) =>
        value === 'いいね' || value === '超いいね' || value === '拍手' || value === '笑顔' || value === 'びっくり'
    );
};

module.exports = { validateReactionType };
