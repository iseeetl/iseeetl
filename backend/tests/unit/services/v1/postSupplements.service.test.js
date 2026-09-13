jest.mock('../../../../services/timeline/postSupplements.service', () => ({
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
}));
jest.mock('../../../../services/v1/common', () => ({
  assertDeveloper: jest.fn(),
}));
jest.mock('../../../../services/v1/timelineMutation.adapter', () => ({
  adaptPostSupplementCreate: jest.fn(),
  adaptPostSupplementUpdate: jest.fn(),
  adaptPostSupplementDelete: jest.fn(),
}));

const postSupplementsService = require('../../../../services/timeline/postSupplements.service');
const { assertDeveloper } = require('../../../../services/v1/common');
const adapter = require('../../../../services/v1/timelineMutation.adapter');
const service = require('../../../../services/v1/postSupplements.service');

describe('postSupplementsのサービス', () => {
  const jwtPayload = { user_id: 'user-1', user_role: 'developer' };
  const io = { to: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test.each([
    ['createPostSupplement', 'adaptPostSupplementCreate', 'create'],
    ['updatePostSupplement', 'adaptPostSupplementUpdate', 'update'],
    ['deletePostSupplement', 'adaptPostSupplementDelete', 'delete'],
  ])('%sはv1 bodyを変換して通常APIサービスへ委譲する', async (method, adaptMethod, mainMethod) => {
    const body = { operation: method };
    const adaptedBody = { adapted: method };
    const mainResult = { _id: `${method}-result` };
    adapter[adaptMethod].mockReturnValue(adaptedBody);
    postSupplementsService[mainMethod].mockResolvedValue(mainResult);

    await expect(service[method]({ body, jwtPayload, io })).resolves.toEqual({ result: mainResult });

    expect(assertDeveloper).toHaveBeenCalledWith(jwtPayload);
    expect(adapter[adaptMethod]).toHaveBeenCalledWith(body);
    expect(postSupplementsService[mainMethod]).toHaveBeenCalledWith(adaptedBody, jwtPayload, io);
  });
});
