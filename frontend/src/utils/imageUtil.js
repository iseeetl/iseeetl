import loadImage from 'blueimp-load-image';

// 画像を正方形に切り抜き、JPEG形式のデータURLとBlobを返す。
export async function cropAndCompressImage(file, size = 200, quality = 0.5, loadImageRef = loadImage) {
  return new Promise((resolve, reject) => {
    loadImageRef(
      file,
      async (canvas) => {
        try {
          const trimCanvas = document.createElement('canvas');
          trimCanvas.width = size;
          trimCanvas.height = size;

          let width, height, xOffset, yOffset;
          if (canvas.width > canvas.height) {
            height = size;
            width = canvas.width * (size / canvas.height);
            xOffset = -(width - size) / 2;
            yOffset = 0;
          } else {
            width = size;
            height = canvas.height * (size / canvas.width);
            yOffset = -(height - size) / 2;
            xOffset = 0;
          }

          trimCanvas.getContext('2d').drawImage(canvas, xOffset, yOffset, width, height);

          const base64 = trimCanvas.toDataURL('image/jpeg', quality);

          trimCanvas.toBlob(
            (blob) => {
              if (blob) {
                resolve({ base64, blob });
              } else {
                reject(new Error('画像のBlob化に失敗しました'));
              }
            },
            'image/jpeg',
            quality
          );
        } catch (e) {
          reject(e);
        }
      },
      {
        maxHeight: size,
        maxWidth: size,
        canvas: true,
      }
    );
  });
}
