import { describe, it, expect } from 'vitest';
const { readTestZip } = require('../../e2e/specs/helpers/read-test-zip');

// 実装と独立したデータで検証するため、Pythonのzipfileで作成した無圧縮・DEFLATE形式のZIPを使う。
const archives = [
  'UEsDBBQAAAAAAJVKKV112rfMDwAAAA8AAAAKAAAAc2FtcGxlLnR4dEUyRSBaSVAgY29udGVudFBLAQIUAxQAAAAAAJVKKV112rfMDwAAAA8AAAAKAAAAAAAAAAAAAACAAQAAAABzYW1wbGUudHh0UEsFBgAAAAABAAEAOAAAADcAAAAAAA==',
  'UEsDBBQAAAAIAJVKKV112rfMEQAAAA8AAAAKAAAAc2FtcGxlLnR4dHM1clWI8gxQSM7PK0nNKwEAUEsBAhQDFAAAAAgAlUopXXXat8wRAAAADwAAAAoAAAAAAAAAAAAAAIABAAAAAHNhbXBsZS50eHRQSwUGAAAAAAEAAQA4AAAAOQAAAAAA',
];
describe('E2EでダウンロードしたZIPの読込', () => {
  it.each(archives)('ZIPからファイル名と内容を読み込む', (archive) => {
    const entries = readTestZip(Buffer.from(archive, 'base64'));
    expect([...entries.keys()]).toEqual(['sample.txt']);
    expect(entries.get('sample.txt').toString()).toBe('E2E ZIP content');
  });
  it('ZIP以外のデータや途中で切れたZIPを拒否する', () => {
    expect(() => readTestZip(Buffer.from('error response'))).toThrow();
    expect(() => readTestZip(Buffer.from(archives[0], 'base64').subarray(0, 50))).toThrow();
  });
  it('中央ディレクトリに対応するファイルエントリがなければ拒否する', () => {
    const bytes = Buffer.from(archives[0], 'base64');
    bytes.writeUInt32LE(0, 0);
    expect(() => readTestZip(bytes)).toThrow('ローカルエントリがありません');
  });
});
