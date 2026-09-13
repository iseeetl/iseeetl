import { expect } from 'vitest';
import {
  isAllowedVideoFile,
  isAllowedAudioFile,
  isAllowedImageFile,
  isImageSizeWithinLimit,
  MAX_IMAGE_SIZE_IN_BYTES,
} from '@/constants/mediaConstants';

const makeFile = (name, type) => ({ name, type });

describe('メディアの形式と容量制限', () => {
  it('画像: 許可 MIME は通過する', () => {
    const file = makeFile('photo.png', 'image/png');
    expect(isAllowedImageFile(file)).to.equal(true);
  });

  it('画像: 非許可 MIME は拒否される', () => {
    const file = makeFile('photo.gif', 'image/gif');
    expect(isAllowedImageFile(file)).to.equal(false);
  });

  it('画像: サイズ上限を超えると拒否される', () => {
    expect(isImageSizeWithinLimit(MAX_IMAGE_SIZE_IN_BYTES)).to.equal(true);
    expect(isImageSizeWithinLimit(MAX_IMAGE_SIZE_IN_BYTES + 1)).to.equal(false);
  });

  it('動画: MIME と拡張子が一致する場合に許可される', () => {
    const file = makeFile('clip.mp4', 'video/mp4');
    expect(isAllowedVideoFile(file)).to.equal(true);
  });

  it('動画: 拡張子が不正な場合は拒否される', () => {
    const file = makeFile('clip.mkv', 'video/mp4');
    expect(isAllowedVideoFile(file)).to.equal(false);
  });

  it('動画: MIME が不正な場合は拒否される', () => {
    const file = makeFile('clip.mp4', 'video/avi');
    expect(isAllowedVideoFile(file)).to.equal(false);
  });

  it('動画: application/octet-stream でも拡張子が一致すれば許可される', () => {
    const file = makeFile('clip.mp4', 'application/octet-stream');
    expect(isAllowedVideoFile(file)).to.equal(true);
  });

  it('音声: 許可 MIME は通過する（codecs 付きでも可）', () => {
    const file = makeFile('sound.webm', 'audio/webm; codecs=opus');
    expect(isAllowedAudioFile(file)).to.equal(true);
  });

  it('音声: 非許可 MIME は拒否される', () => {
    const file = makeFile('sound.aac', 'audio/aac');
    expect(isAllowedAudioFile(file)).to.equal(false);
  });
});
