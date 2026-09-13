const path = require('path');

const {
  isInsideBaseDir,
  isMongoId,
  resolveInsideBaseDir,
  resolveLeafFilePath,
  resolveMongoIdPath,
} = require('../../../utils/safePath');

describe('safePathの検証', () => {
  const baseDir = '/test-fixtures/safe-path';
  const floorId = '507f1f77bcf86cd799439011';
  const roomId = '507f1f77bcf86cd799439012';

  test('ObjectIdだけでbaseDir配下のパスを解決する', () => {
    expect(isMongoId(floorId)).toBe(true);
    expect(resolveMongoIdPath(baseDir, [floorId, roomId])).toBe(path.join(baseDir, floorId, roomId));
  });

  test('ObjectIdでない構成要素を拒否する', () => {
    expect(isMongoId('../outside')).toBe(false);
    expect(() => resolveMongoIdPath(baseDir, [floorId, '../outside'])).toThrow('invalid path');
  });

  test('baseDir外へ抜けるパスを拒否する', () => {
    expect(() => resolveInsideBaseDir(baseDir, ['..', 'outside'])).toThrow('invalid path');
    expect(isInsideBaseDir(path.resolve(baseDir), path.resolve(baseDir, 'inside'))).toBe(true);
  });

  test('leaf filenameだけを許可する', () => {
    expect(resolveLeafFilePath(baseDir, 'image.png')).toBe(path.join(baseDir, 'image.png'));
    expect(() => resolveLeafFilePath(baseDir, '../image.png')).toThrow('invalid path');
    expect(() => resolveLeafFilePath(baseDir, '/absolute.png')).toThrow('invalid path');
  });

  test('呼出元指定のエラーへ変換できる', () => {
    const createError = () => Object.assign(new Error('not found'), { code: 'NOT_FOUND' });
    expect(() => resolveMongoIdPath('', [floorId], { createError })).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' })
    );
  });
});
