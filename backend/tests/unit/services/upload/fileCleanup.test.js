const mockUnlink = jest.fn();
jest.mock('fs', () => ({ promises: { unlink: mockUnlink } }));
jest.mock('../../../../utils/logger', () => ({ error: jest.fn() }));

const path = require('path');
const logger = require('../../../../utils/logger');
const { removeFileBestEffort } = require('../../../../services/upload/fileCleanup');

describe('fileCleanupの検証', () => {
  const baseDir = '/test-fixtures/media-cleanup';

  beforeEach(() => {
    jest.clearAllMocks();
    mockUnlink.mockResolvedValue();
  });

  test('baseDir配下の置換済みファイルを削除する', async () => {
    await expect(
      removeFileBestEffort({ baseDir, segments: ['floor', 'room'], fileName: 'old.png' })
    ).resolves.toBe(true);
    expect(mockUnlink).toHaveBeenCalledWith(path.join(baseDir, 'floor', 'room', 'old.png'));
  });

  test('ルート外を指すファイル名は削除せず記録する', async () => {
    await expect(
      removeFileBestEffort({ baseDir, segments: ['floor'], fileName: '../outside.png' })
    ).resolves.toBe(false);
    expect(mockUnlink).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  test('DB更新後の削除失敗は例外にせず記録する', async () => {
    mockUnlink.mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' }));
    await expect(
      removeFileBestEffort({ baseDir, segments: ['floor'], fileName: 'old.png' })
    ).resolves.toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to remove replaced file',
      expect.objectContaining({ error: 'denied' })
    );
  });

  test('存在しないファイルは正常な未削除として扱う', async () => {
    mockUnlink.mockRejectedValue({ code: 'ENOENT' });
    await expect(
      removeFileBestEffort({ baseDir, segments: ['floor'], fileName: 'missing.png' })
    ).resolves.toBe(false);
    expect(logger.error).not.toHaveBeenCalled();
  });
});
