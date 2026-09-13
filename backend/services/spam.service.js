const { escapeRegExp } = require('../utils/regex');
const { buildPaginationOptions } = require('./_shared/paginationHelpers');

const Spam = require('../models/Spam');

exports.getSpamList = async (body) => {
  const page = parseInt(body.page, 10);
  const search = body.search;

  const query = search ? { word: { $regex: escapeRegExp(search), $options: 'i' } } : {};

  const options = buildPaginationOptions({
    page,
    sort: { created_at: 'desc' },
  });

  return await Spam.paginate(query, options);
};

exports.createSpam = async (body, userId) => {
  const word = body.word;

  const data = {
    user: userId,
    word,
  };

  return await Spam.create(data);
};

exports.updateSpam = async (body) => {
  const id = body._id;
  const word = body.word;

  return await Spam.findByIdAndUpdate(id, { word }, { new: true, runValidators: true });
};

exports.deleteSpam = async (body) => {
  const id = body._id;

  return await Spam.findByIdAndDelete(id);
};

exports.replaceSpams = async (originalText) => {
  if (!originalText) return '';
  const foundSpams = await Spam.find().select({ word: 1 });

  const words = foundSpams
    .map((s) => String(s.word))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length); // 短い語が先に一致しないよう、長い語を優先する。

  if (words.length === 0) return originalText;

  const pattern = new RegExp(words.map(escapeRegExp).join('|'), 'gi');
  return originalText.replace(pattern, '***');
};
