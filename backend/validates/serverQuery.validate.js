const { body } = require('express-validator');

const optional = { nullable: true };
const MAX_QUERY_ARRAY_ITEMS = 100;

const validateQueryObject = (path) => [
  body(path).optional(optional).isObject(),
  body(`${path}.filterMode`).optional(optional).isIn(['include', 'exclude']),
  body(`${path}.filter_mode`).optional(optional).isIn(['include', 'exclude']),
  body(`${path}.logicalOperator`).optional(optional).isIn(['or', 'and']),
  body(`${path}.logical_operator`).optional(optional).isIn(['or', 'and']),
  body(`${path}.keywordArray`).optional(optional).isArray({ max: MAX_QUERY_ARRAY_ITEMS }),
  body(`${path}.keywordArray.*`).isString().isLength({ min: 1, max: 200 }),
  body(`${path}.keyword_array`).optional(optional).isArray({ max: MAX_QUERY_ARRAY_ITEMS }),
  body(`${path}.keyword_array.*`).isString().isLength({ min: 1, max: 200 }),
  body(`${path}.keyword`).optional(optional).isString().isLength({ min: 1, max: 200 }),
  body(`${path}.userName`).optional(optional).isString().isLength({ min: 1, max: 20 }),
  body(`${path}.user_name`).optional(optional).isString().isLength({ min: 1, max: 20 }),
  body(`${path}.tags`).optional(optional).isArray({ max: MAX_QUERY_ARRAY_ITEMS }),
  body(`${path}.tags.*`).isString().isLength({ min: 1, max: 200 }),
  body(`${path}.tagSearchOperator`).optional(optional).isIn(['or', 'and']),
  body(`${path}.tag_search_operator`).optional(optional).isIn(['or', 'and']),
  body(`${path}.noTags`).optional(optional).isBoolean(),
  body(`${path}.no_tags`).optional(optional).isBoolean(),
  body(`${path}.animation`).optional(optional).isBoolean(),
];

const validateServerQuery = () => [
  ...validateQueryObject('server_query'),
  ...validateQueryObject('serverQuery'),
  ...validateQueryObject('globalServerQuery'),
  ...validateQueryObject('global_server_query'),
];

module.exports = { MAX_QUERY_ARRAY_ITEMS, validateQueryObject, validateServerQuery };
