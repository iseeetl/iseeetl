jest.mock('../../../../services/timeline/replySupplements.service', () => ({
  createReplySupplement: jest.fn(),
  deleteReplySupplement: jest.fn(),
  updateReplySupplement: jest.fn(),
}));
jest.mock('../../../../services/v1/timelineMutation.adapter', () => ({
  adaptReplySupplementCreate: jest.fn(),
  adaptReplySupplementDelete: jest.fn(),
  adaptReplySupplementUpdate: jest.fn(),
}));

const AppError = require('../../../../utils/appError');
const replySupplementsService = require('../../../../services/timeline/replySupplements.service');
const {
  adaptReplySupplementCreate,
  adaptReplySupplementDelete,
  adaptReplySupplementUpdate,
} = require('../../../../services/v1/timelineMutation.adapter');
const service = require('../../../../services/v1/replySupplements.service');

describe('v1 replySupplementsのサービス', () => {
  const jwtPayload = { user_id: 'user-1', user_role: 'developer' };
  const io = { to: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test.each([
    ['createReplySupplement', adaptReplySupplementCreate, replySupplementsService.createReplySupplement],
    ['updateReplySupplement', adaptReplySupplementUpdate, replySupplementsService.updateReplySupplement],
    ['deleteReplySupplement', adaptReplySupplementDelete, replySupplementsService.deleteReplySupplement],
  ])('%sは旧形式の入力を変換し、通常APIサービスの結果をv1形式で返す', async (method, adapt, operation) => {
    const body = { legacy: method };
    const input = { canonical: method };
    const result = { _id: `result-${method}` };
    adapt.mockReturnValue(input);
    operation.mockResolvedValue(result);

    await expect(service[method]({ body, jwtPayload, io })).resolves.toEqual({ result });

    expect(adapt).toHaveBeenCalledTimes(1);
    expect(adapt).toHaveBeenCalledWith(body);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(operation).toHaveBeenCalledWith(input, jwtPayload, io);
  });

  test('開発者以外は変換も通常APIサービスも呼ばず拒否する', async () => {
    await expect(
      service.createReplySupplement({ body: {}, jwtPayload: { ...jwtPayload, user_role: 'User' }, io })
    ).rejects.toBeInstanceOf(AppError);

    expect(adaptReplySupplementCreate).not.toHaveBeenCalled();
    expect(replySupplementsService.createReplySupplement).not.toHaveBeenCalled();
  });

  test('通常APIサービスのエラーを変更せず伝播する', async () => {
    const error = new AppError({ code: 'INVALID_PERMISSION' });
    adaptReplySupplementUpdate.mockReturnValue({ canonical: true });
    replySupplementsService.updateReplySupplement.mockRejectedValue(error);

    await expect(
      service.updateReplySupplement({ body: {}, jwtPayload, io })
    ).rejects.toBe(error);

    expect(replySupplementsService.updateReplySupplement).toHaveBeenCalledTimes(1);
  });
});
