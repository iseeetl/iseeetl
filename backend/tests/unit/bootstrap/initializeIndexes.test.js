jest.mock('../../../models/User', () => ({ modelName: 'User', init: jest.fn() }));
jest.mock('../../../models/FloorMember', () => ({ modelName: 'FloorMember', init: jest.fn() }));
jest.mock('../../../models/RoomMember', () => ({ modelName: 'RoomMember', init: jest.fn() }));
jest.mock('../../../models/KickedUser', () => ({ modelName: 'KickedUser', init: jest.fn() }));

const { initializeIndexes } = require('../../../bootstrap/initializeIndexes');
const models = [
  require('../../../models/User'),
  require('../../../models/FloorMember'),
  require('../../../models/RoomMember'),
  require('../../../models/KickedUser'),
];

beforeEach(() => {
  for (const model of models) model.init.mockReset().mockResolvedValue();
});

test('対象4モデルすべての索引作成完了を待つ', async () => {
  let complete;
  models[3].init.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
  let finished = false;
  const pending = initializeIndexes().then(() => { finished = true; });
  await Promise.resolve();
  for (const model of models) expect(model.init).toHaveBeenCalledTimes(1);
  expect(finished).toBe(false);
  complete();
  await pending;
  expect(finished).toBe(true);
});

test.each([11000, 85, 86, 13, undefined])('DBエラー%sの保存値を起動エラーへ含めない', async (code) => {
  const error = Object.assign(new Error('duplicate private@example.invalid'), {
    code, keyValue: { mail: 'private@example.invalid' },
  });
  models[0].init.mockRejectedValue(error);
  const failure = await initializeIndexes().catch((reason) => reason);
  expect(failure).toBeInstanceOf(Error);
  expect(failure.code).toBe('INDEX_INITIALIZATION_FAILED');
  expect(failure.message).toBe(`Index initialization failed: model=User databaseCode=${code ?? 'unknown'}`);
  expect(failure.stack).not.toContain('private@example.invalid');
  expect(JSON.stringify(failure)).not.toContain('private@example.invalid');
  expect(failure).not.toHaveProperty('cause');
});
