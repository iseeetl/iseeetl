import { expect } from 'vitest';
import { cropAndCompressImage } from '@/utils/imageUtil';

describe('画像の切り抜きと圧縮（ImageUtil）', () => {
  let originalCreateElement;

  beforeEach(() => {
    originalCreateElement = document.createElement;
  });

  afterEach(() => {
    document.createElement = originalCreateElement;
  });

  it('cropAndCompressImage は base64 と blob を返す', async () => {
    const trimCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => {} }),
      toDataURL: () => 'data:image/jpeg;base64,AAA',
      toBlob: (cb) => cb(new Blob(['img'], { type: 'image/jpeg' })),
    };
    document.createElement = (tag) => (tag === 'canvas' ? trimCanvas : originalCreateElement.call(document, tag));

    const sourceCanvas = { width: 400, height: 200 };
    let capturedOptions = null;
    const loadImageRef = (_file, cb, options) => {
      capturedOptions = options;
      cb(sourceCanvas);
    };

    const result = await cropAndCompressImage(new Blob(['file']), 200, 0.5, loadImageRef);

    expect(result.base64).to.equal('data:image/jpeg;base64,AAA');
    expect(result.blob).to.be.instanceOf(Blob);
    expect(capturedOptions).to.deep.equal({ maxHeight: 200, maxWidth: 200, canvas: true });
  });

  it('cropAndCompressImageはtoBlobに失敗したらエラーを返す', async () => {
    const trimCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => {} }),
      toDataURL: () => 'data:image/jpeg;base64,AAA',
      toBlob: (cb) => cb(null),
    };
    document.createElement = (tag) => (tag === 'canvas' ? trimCanvas : originalCreateElement.call(document, tag));

    const loadImageRef = (_file, cb) => cb({ width: 100, height: 100 });

    let caught = null;
    try {
      await cropAndCompressImage(new Blob(['file']), 200, 0.5, loadImageRef);
    } catch (err) {
      caught = err;
    }

    expect(caught).to.be.instanceOf(Error);
    expect(caught.message).to.equal('画像のBlob化に失敗しました');
  });
});
