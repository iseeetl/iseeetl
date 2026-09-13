const { deleteMediaDiff } = require('../../media/fileCleanup');

const buildMediaStateFromItem = (item = {}) => ({
  image: {
    main: item.image_name,
    thumb: item.image_thumbnail_name,
  },
  video: {
    main: item.video_name,
    thumb: item.video_thumbnail_name,
    subtitle: item.video_subtitle_name,
  },
  audio: {
    main: item.audio_name,
  },
});

const cleanupReplacedMedia = ({ floorId, roomId, oldItem, newItem }) =>
  deleteMediaDiff({
    floorId: String(floorId),
    roomId: String(roomId),
    oldMedia: buildMediaStateFromItem(oldItem),
    newMedia: buildMediaStateFromItem(newItem),
  });

module.exports = {
  buildMediaStateFromItem,
  cleanupReplacedMedia,
};
