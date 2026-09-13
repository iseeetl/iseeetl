const { inflateRawSync } = require('node:zlib');

// サーバが生成するZIP64にも対応し、セントラルディレクトリから内容を読み取る。
// ZIP内のパスへファイルを書き出さず、メモリ上で内容を検証する。
const readTestZip = (buffer) => {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error('ZIPの終端レコードがありません。');
  let count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  if (end >= 20 && buffer.readUInt32LE(end - 20) === 0x07064b50) {
    const zip64 = Number(buffer.readBigUInt64LE(end - 12));
    if (buffer.readUInt32LE(zip64) !== 0x06064b50) throw new Error('ZIP64のレコードがありません。');
    count = Number(buffer.readBigUInt64LE(zip64 + 32));
    offset = Number(buffer.readBigUInt64LE(zip64 + 48));
  }
  if (count > 100 || buffer.length > 5 * 1024 * 1024) throw new Error('ZIPのテストデータが範囲外を参照しています。');
  const entries = new Map();
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('ZIPのディレクトリエントリがありません。');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const size = buffer.readUInt32LE(offset + 24);
    const nameSize = buffer.readUInt16LE(offset + 28);
    const extraSize = buffer.readUInt16LE(offset + 30);
    const commentSize = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameSize).toString('utf8');
    if (entries.has(name) || size > 5 * 1024 * 1024) throw new Error('ZIPのテストデータのエントリが不正です。');
    if (buffer.readUInt32LE(local) !== 0x04034b50) throw new Error('ZIPのローカルエントリがありません。');
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const packed = buffer.subarray(start, start + compressedSize);
    if (![0, 8].includes(method)) throw new Error('ZIPのテストデータの圧縮方式が未対応です。');
    const bytes = method === 0 ? packed : inflateRawSync(packed, { maxOutputLength: 5 * 1024 * 1024 });
    if (bytes.length !== size) throw new Error('ZIPのテストデータのエントリサイズが一致しません。');
    entries.set(name, bytes);
    offset += 46 + nameSize + extraSize + commentSize;
  }
  return entries;
};

module.exports = { readTestZip };
