const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { getImagePreview } = require('../../../../services/media/imagePreview');

describe('800px画像プレビュー', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'image-preview-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  test('3,000pxを800pxへ縮小し原本を変えず、同一要求を共有する', async () => {
    const file = path.join(dir, 'page.png');
    const original = await sharp({ create: { width: 2121, height: 3000, channels: 3, background: '#fff' } }).png().toBuffer();
    fs.writeFileSync(file, original);
    const [a,b] = await Promise.all([getImagePreview(file), getImagePreview(file)]);
    const metadata = await sharp(a.buffer).metadata();
    expect(metadata.height).toBe(800); expect(metadata.width).toBe(566);
    expect(a).toBe(b); expect(await getImagePreview(file)).toBe(a);
    expect(fs.readFileSync(file)).toEqual(original);
    fs.unlinkSync(file);
    await expect(getImagePreview(file)).rejects.toHaveProperty('code', 'ENOENT');
  });
  test('小さいJPEGを引き伸ばさず、ファイル更新後は古い結果を返さない', async () => {
    const file = path.join(dir, 'photo.jpg');
    await sharp({ create: { width: 120, height: 80, channels: 3, background: '#123456' } }).jpeg().toFile(file);
    const a = await getImagePreview(file);
    expect((await sharp(a.buffer).metadata()).width).toBe(120);
    await sharp({ create: { width: 500, height: 200, channels: 3, background: '#fff' } }).jpeg().toFile(file);
    const b = await getImagePreview(file);
    expect((await sharp(b.buffer).metadata()).width).toBe(500); expect(b).not.toBe(a);
  });
  test('破損ファイルを画像として返さない', async () => {
    const file = path.join(dir, 'bad.png'); fs.writeFileSync(file, 'not an image');
    await expect(getImagePreview(file)).rejects.toThrow();
  });
});
