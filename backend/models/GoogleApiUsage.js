const mongoose = require('mongoose');

const googleApiUsageSchema = new mongoose.Schema({
  api_type: {
    type: String,
    required: true,
    enum: ['translate', 'vision', 'speech', 'video'], // Google APIの種類
  },
  year_month: {
    type: String,
    required: true, // YYYY-MM形式が必須
    match: [/^\d{4}-(0[1-9]|1[0-2])$/],
  },
  usage: {
    type: Number,
    required: true, // 使用量（文字数、音声・動画秒数、画像枚数）
    default: 0,
  },
});

googleApiUsageSchema.index({ api_type: 1, year_month: 1 }, { unique: true });

const GoogleApiUsage = mongoose.model('GoogleApiUsage', googleApiUsageSchema);

module.exports = GoogleApiUsage;
