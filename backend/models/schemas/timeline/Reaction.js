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
    validate: value => ['いいね','超いいね','拍手','笑顔','びっくり'].includes(value) || /^room:[a-f0-9]{24}$/i.test(value),
    required: true,
  },
  emoji: { type: String, maxlength: 32, default: null },
  label: { type: String, maxlength: 200, default: null },
  media_kind: { type: String, enum: ['image','video','audio',null], default: null },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

module.exports = ReactionSchema;
