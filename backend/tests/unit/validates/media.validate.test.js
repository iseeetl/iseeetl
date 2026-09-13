const mongoose = require('mongoose');
const { buildReq, runValidators } = require('./_helpers');
const {
  validateFileName,
  validateFileThumbnailName,
  validateImageCaption,
} = require('../../../validates/media.validate');

describe('メディアの入力検証', () => {
  test('時刻・ObjectId・拡張子で構成されたファイル名を受け付ける', async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const name = `1700000000_${id}.jpg`;
    const req = buildReq({ body: { file: name } });
    const result = await runValidators(validateFileName('file'), req);
    expect(result.isEmpty()).toBe(true);
  });

  test('Numberの範囲を超える重複防止用の数値識別子を含むファイル名を受け付ける', async () => {
    const req = buildReq({
      body: {
        file: `${'9'.repeat(58)}_507f1f77bcf86cd799439011.png`,
      },
    });
    const result = await runValidators(validateFileName('file'), req);
    expect(result.isEmpty()).toBe(true);
  });

  test('不正なファイル名の形式を拒否する', async () => {
    const req = buildReq({ body: { file: 'badname.jpg' } });
    const result = await runValidators(validateFileName('file'), req);
    expect(result.isEmpty()).toBe(false);
  });

  test('サムネイルの接尾辞を含むファイル名を受け付ける', async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const name = `1700000000_${id}_thumbnail.png`;
    const req = buildReq({ body: { thumb: name } });
    const result = await runValidators(validateFileThumbnailName('thumb'), req);
    expect(result.isEmpty()).toBe(true);
  });

  test('長い重複防止用の数値識別子を含むサムネイル名を受け付ける', async () => {
    const req = buildReq({
      body: {
        thumb: `${'9'.repeat(58)}_507f1f77bcf86cd799439011_thumbnail.png`,
      },
    });
    const result = await runValidators(validateFileThumbnailName('thumb'), req);
    expect(result.isEmpty()).toBe(true);
  });

  test('画像の説明はnullを受け付ける', async () => {
    const req = buildReq({ body: { caption: null } });
    const result = await runValidators(validateImageCaption('caption'), req);
    expect(result.isEmpty()).toBe(true);
  });
});
