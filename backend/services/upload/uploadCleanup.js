const fs = require('fs');

const removeUploadedFiles = async (paths = []) => {
  await Promise.all(
    paths.map(async (filePath) => {
      try {
        await fs.promises.unlink(filePath);
      } catch (err) {
        if (err?.code !== 'ENOENT') {
          // 検証エラーを呼び出し元へ伝えるため、ファイルの削除エラーは無視する。
        }
      }
    })
  );
};

module.exports = { removeUploadedFiles };
