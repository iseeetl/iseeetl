const fs = require('fs');
const path = require('path');

const { createTestRuntime } = require('../../../_helpers/testRuntime');
const {
  TEMP_DIRECTORY_NAME,
  cleanupTempWorkspace,
  copySafeRegularFile,
  createTempWorkspace,
  getActiveTempWorkspaceCount,
  readSafeRegularFile,
  resolveSafeMediaFilePath,
} = require('../../../../services/analysis/mediaPath');

const FLOOR_ID = '64b000000000000000000001';
const ROOM_ID = '64b000000000000000000002';
const ABSOLUTE_FIXTURE_PATH = path.join(process.cwd(), 'fixture.mp3');
const runtime = createTestRuntime('backend/analysis-media-path');

describe('AI解析対象のメディアパス', () => {
  let mediaRoot;
  let roomPath;

  beforeEach(async () => {
    mediaRoot = runtime.testRuntimePath('media');
    roomPath = path.join(mediaRoot, FLOOR_ID, ROOM_ID);
    await runtime.ensureDir(roomPath);
  });

  afterEach(async () => {
    await runtime.removeDirSafe(runtime.testRuntimePath());
  });

  test('実パスがMEDIA_PATH内の通常ファイルだけを解決する', async () => {
    const filePath = path.join(roomPath, 'fixture.mp3');
    await fs.promises.writeFile(filePath, 'fixture');

    await expect(
      resolveSafeMediaFilePath({
        mediaRoot,
        source: { floor: FLOOR_ID, room: ROOM_ID },
        filename: 'fixture.mp3',
      })
    ).resolves.toBe(await fs.promises.realpath(filePath));
  });

  test.each(['../fixture.mp3', ABSOLUTE_FIXTURE_PATH, 'nested/fixture.mp3'])(
    '親参照・絶対パス・階層を含むファイル名を拒否する: %s',
    async (filename) => {
      await expect(
        resolveSafeMediaFilePath({
          mediaRoot,
          source: { floor: FLOOR_ID, room: ROOM_ID },
          filename,
        })
      ).rejects.toMatchObject({ code: 'AI_ANALYSIS_MEDIA_PATH_INVALID' });
    }
  );

  test('ファイル自体がシンボリックリンクなら拒否する', async () => {
    const target = path.join(roomPath, 'target.mp3');
    const link = path.join(roomPath, 'link.mp3');
    await fs.promises.writeFile(target, 'fixture');
    await fs.promises.symlink(target, link);

    await expect(
      resolveSafeMediaFilePath({
        mediaRoot,
        source: { floor: FLOOR_ID, room: ROOM_ID },
        filename: 'link.mp3',
      })
    ).rejects.toMatchObject({ code: 'AI_ANALYSIS_MEDIA_PATH_INVALID' });
  });

  test('専用の権限0700の一時領域に作業ディレクトリを作り、自身の領域だけを削除する', async () => {
    const workspace = await createTempWorkspace({ mediaRoot });
    const tempRoot = path.join(mediaRoot, TEMP_DIRECTORY_NAME);
    expect(workspace.startsWith(`${await fs.promises.realpath(tempRoot)}${path.sep}`)).toBe(true);
    expect((await fs.promises.lstat(tempRoot)).mode & 0o077).toBe(0);
    expect(getActiveTempWorkspaceCount()).toBe(1);

    await expect(cleanupTempWorkspace(workspace)).resolves.toBe(true);
    await expect(cleanupTempWorkspace(workspace)).resolves.toBe(false);
    await expect(fs.promises.access(workspace)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(getActiveTempWorkspaceCount()).toBe(0);
  });

  test('後処理に失敗した作業ディレクトリを再処理対象へ残す', async () => {
    const workspace = await createTempWorkspace({ mediaRoot });
    const remove = jest.spyOn(fs.promises, 'rm').mockRejectedValueOnce(new Error('fixture cleanup error'));
    await expect(cleanupTempWorkspace(workspace)).rejects.toMatchObject({
      code: 'AI_ANALYSIS_MEDIA_CLEANUP_FAILED',
    });
    expect(getActiveTempWorkspaceCount()).toBe(1);
    remove.mockRestore();
    await cleanupTempWorkspace(workspace);
  });

  test('O_NOFOLLOWで開いたファイルの読込と複製に上限を設け、中断を伝播する', async () => {
    const source = path.join(roomPath, 'source.mp3');
    const destination = path.join(roomPath, 'copy.mp3');
    await fs.promises.writeFile(source, 'fixture-audio');
    await copySafeRegularFile({ filePath: source, destination, maxBytes: 100 });
    await expect(readSafeRegularFile({ filePath: destination, maxBytes: 100 })).resolves.toEqual(
      Buffer.from('fixture-audio')
    );
    await expect(readSafeRegularFile({ filePath: source, maxBytes: 1 })).rejects.toMatchObject({
      code: 'AI_ANALYSIS_MEDIA_SIZE_INVALID',
    });

    const controller = new AbortController();
    controller.abort();
    await expect(
      readSafeRegularFile({ filePath: source, maxBytes: 100, signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError', code: 'ABORT_ERR' });
  });
});
