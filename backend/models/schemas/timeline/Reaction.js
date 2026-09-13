const { Schema } = require('mongoose');

const ReactionSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  guest_id: {
    type: String,
    maxLength: 36,
    default: null,
  },
  guest_name: {
    type: String,
    maxlength: 20,
    default: null,
  },
  type: {
    type: String,
    enum: ['いいね', '超いいね', '拍手', '笑顔', 'びっくり'],
    required: true,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

module.exports = ReactionSchema;
