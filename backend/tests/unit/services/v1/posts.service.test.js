jest.mock('../../../../services/timeline/posts.service', () => ({
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
}));
jest.mock('../../../../services/v1/common', () => ({
  assertDeveloper: jest.fn(),
}));
jest.mock('../../../../services/v1/timelineMutation.adapter', () => ({
  adaptPostCreate: jest.fn(),
  adaptPostUpdate: jest.fn(),
  adaptPostDelete: jest.fn(),
}));

const postsService = require('../../../../services/timeline/posts.service');
const { assertDeveloper } = require('../../../../services/v1/common');
const adapter = require('../../../../services/v1/timelineMutation.adapter');
const service = require('../../../../services/v1/posts.service');

describe('postsのサービス', () => {
  const jwtPayload = { user_id: 'user-1', user_role: 'developer' };
  const io = { to: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test.each([
    ['createPost', 'adaptPostCreate', 'create'],
    ['updatePost', 'adaptPostUpdate', 'update'],
    ['deletePost', 'adaptPostDelete', 'delete'],
  ])('%sはv1 bodyを変換して通常APIサービスへ委譲する', async (method, adaptMethod, mainMethod) => {
    const body = { operation: method };
    const adaptedBody = { adapted: method };
    const mainResult = { _id: `${method}-result` };
    adapter[adaptMethod].mockReturnValue(adaptedBody);
    postsService[mainMethod].mockResolvedValue(mainResult);

    await expect(service[method]({ body, jwtPayload, io })).resolves.toEqual({ result: mainResult });

    expect(assertDeveloper).toHaveBeenCalledWith(jwtPayload);
    expect(adapter[adaptMethod]).toHaveBeenCalledWith(body);
    expect(postsService[mainMethod]).toHaveBeenCalledWith(adaptedBody, jwtPayload, io);
  });
});
