module.exports = {
  // ファイルサイズと画像寸法の上限
  IMAGE_LIMIT: 3 * 1024 * 1024, // 3 MiB
  VIDEO_LIMIT: 150 * 1024 * 1024, // 150 MiB
  AUDIO_LIMIT: 6 * 1024 * 1024, // 6 MiB
  SUBTITLE_LIMIT: 2 * 1024 * 1024, // 2 MiB
  VIDEO_THUMB_LONG: 720, // 動画サムネイルの長辺（px）
  IMAGE_MAX_PIXELS: 40 * 1000 * 1000, // 展開後の画像は4,000万画素まで

  // 許可するMIMEタイプと拡張子
  IMAGE_MIME_TYPES: ['image/png', 'image/jpg', 'image/jpeg'],

  VIDEO_MIME_TYPES: [
    'video/mp4',
    'video/ogv',
    'video/webm',
    'video/quicktime',
    'application/octet-stream',
  ],
  VIDEO_EXTENSIONS: ['.mp4', '.ogv', '.webm', '.mov'],

  SUBTITLE_MIME_TYPES: ['application/x-subrip', 'text/vtt', 'application/octet-stream'],
  SUBTITLE_EXTENSIONS: ['.srt', '.vtt'],

  AUDIO_MIME_TYPES: [
    'audio/x-m4a',
    'audio/m4a',
    'audio/mp4',
    'audio/webm',
    'audio/ogg',
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
  ],
};
