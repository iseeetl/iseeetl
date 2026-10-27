const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const PostSchema = require('./schemas/timeline/Post');

PostSchema.plugin(mongoosePaginate);
PostSchema.plugin(require('../services/activity/capture').plugin);

module.exports = mongoose.model('Chat', PostSchema);
