const mockController = {};
const mockValidators = {};
const mockEnsureJsonWebToken = jest.fn();
const mockOptionalRoomMetadataIdentity = jest.fn();
const mockRouter = {};
const mockBuildQuickTextRouter = jest.fn(() => mockRouter);

jest.mock('../../../../controllers/room/roomQuickText.controller', () => mockController);
jest.mock('../../../../validates/quickText.validate', () => ({ room: mockValidators }));
jest.mock('../../../../middlewares/ensureJsonWebToken', () => mockEnsureJsonWebToken);
jest.mock('../../../../middlewares/optionalRoomMetadataIdentity', () => mockOptionalRoomMetadataIdentity);
jest.mock('../../../../routes/_shared/quickTextRoutes', () => ({
  buildQuickTextRouter: mockBuildQuickTextRouter,
}));

const ctrl = require('../../../../controllers/room/roomQuickText.controller');
const { room: validators } = require('../../../../validates/quickText.validate');
const ensureJsonWebToken = require('../../../../middlewares/ensureJsonWebToken');

describe('roomQuickTextのルーティング', () => {
  test('ルームの単語用ルータを共通処理で設定する', () => {
    const router = require('../../../../routes/room/roomQuickText.route');

    expect(mockBuildQuickTextRouter).toHaveBeenCalledTimes(1);
    expect(mockBuildQuickTextRouter).toHaveBeenCalledWith({
      scope: 'room',
      ctrl,
      validators,
      ensureJsonWebToken,
      listRequiresJwt: false,
      listIdentityMiddleware: mockOptionalRoomMetadataIdentity,
    });
    expect(router).toBe(mockRouter);
  });
});
