const { isISO8601 } = require('validator');
const AppError = require('../utils/appError');
const invalid = () => { throw new AppError({ code: 'INVALID_PARAMS' }); };
const object = (value, fields) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !fields.includes(key))) invalid();
};
const mongoId = (value) => {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) invalid();
  return value.toLowerCase();
};
const choices = { filterMode: ['include', 'exclude'], logicalOperator: ['or', 'and'], tagSearchOperator: ['or', 'and'] };
const filters = (value) => {
  object(value, [...Object.keys(choices), 'keywordArray', 'keyword', 'userName', 'tags', 'noTags', 'animation']);
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === null) continue;
    if (choices[key]) { if (!choices[key].includes(entry)) invalid(); }
    else if (key === 'noTags' || key === 'animation') { if (typeof entry !== 'boolean') invalid(); }
    else if (key === 'keywordArray' || key === 'tags') {
      if (!Array.isArray(entry) || entry.length > 100 || entry.some((item) => typeof item !== 'string' || item.length < 1 || item.length > 200)) invalid();
    } else if (typeof entry !== 'string' || entry.length < 1 || entry.length > (key === 'userName' ? 20 : 200)) invalid();
    result[key] = entry;
  }
  return result;
};

function mapListRequest(params, values, search = false) {
  object(values, ['from', 'to', ...(search ? ['globalServerQuery', 'serverQuery'] : [])]);
  const result = { room_id: mongoId(params.room_id) };
  for (const [key, value] of Object.entries(values)) {
    if (value === null) continue;
    if (key === 'from' || key === 'to') {
      if (typeof value !== 'string' || !isISO8601(value, { strict: true })) invalid();
      result[key] = value;
    } else result[key] = filters(value);
  }
  return result;
}

const mapDetailRequest = (params, query) => ({ ...mapRoomTagsRequest(params, query), post_id: mongoId(params.post_id) });
const mapRoomTagsRequest = (params, query) => {
  object(query, []);
  return { room_id: mongoId(params.room_id) };
};

module.exports = { mapListRequest, mapDetailRequest, mapRoomTagsRequest };
