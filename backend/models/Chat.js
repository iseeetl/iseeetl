const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const PostSchema = require('./schemas/timeline/Post');

PostSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Chat', PostSchema);
