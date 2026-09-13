jest.mock('../../../../services/timeline/replies.service', () => ({
  create: jest.fn(),
  delete: jest.fn(),
  update: jest.fn(),
}));
jest.mock('../../../../services/v1/timelineMutation.adapter', () => ({
  adaptReplyCreate: jest.fn(),
  adaptReplyDelete: jest.fn(),
  adaptReplyUpdate: jest.fn(),
}));

const AppError = require('../../../../utils/appError');
const repliesService = require('../../../../services/timeline/replies.service');
const {
  adaptReplyCreate,
  adaptReplyDelete,
  adaptReplyUpdate,
} = require('../../../../services/v1/timelineMutation.adapter');
const service = require('../../../../services/v1/replies.service');

describe('v1 repliesのサービス', () => {
  const jwtPayload = { user_id: 'user-1', user_role: 'developer' };
  const io = { to: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test.each([
    ['createReply', adaptReplyCreate, repliesService.create],
    ['updateReply', adaptReplyUpdate, repliesService.update],
    ['deleteReply', adaptReplyDelete, repliesService.delete],
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
      service.createReply({ body: {}, jwtPayload: { ...jwtPayload, user_role: 'User' }, io })
    ).rejects.toBeInstanceOf(AppError);

    expect(adaptReplyCreate).not.toHaveBeenCalled();
    expect(repliesService.create).not.toHaveBeenCalled();
  });

  test('通常APIサービスのエラーを変更せず伝播する', async () => {
    const error = new AppError({ code: 'INVALID_PERMISSION' });
    adaptReplyUpdate.mockReturnValue({ canonical: true });
    repliesService.update.mockRejectedValue(error);

    await expect(
      service.updateReply({ body: {}, jwtPayload, io })
    ).rejects.toBe(error);

    expect(repliesService.update).toHaveBeenCalledTimes(1);
  });
});
