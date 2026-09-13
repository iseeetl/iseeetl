import uploadApi from '@/api/upload';

export const collectMediaFileNames = (media = {}) =>
  [
    media.imageName,
    media.imageThumbnailName,
    media.videoName,
    media.videoThumbnailName,
    media.videoSubtitleName,
    media.audioName,
  ].filter((value, index, values) => typeof value === 'string' && value.length > 0 && values.indexOf(value) === index);

export const discardUnattachedTimelineMedia = async ({ roomId, media }) => {
  const fileNames = collectMediaFileNames(media);
  if (!roomId || fileNames.length === 0) return;

  try {
    await uploadApi.discardTimelineMedia({
      room_id: roomId,
      file_names: fileNames,
    });
  } catch {
    // 破棄処理の失敗で、先に発生した保存エラーを上書きしない。
  }
};
