const mockController = {};
const mockValidators = {};
const mockEnsureJsonWebToken = jest.fn();
const mockRouter = {};
const mockBuildQuickTextRouter = jest.fn(() => mockRouter);

jest.mock('../../../../controllers/floor/floorQuickText.controller', () => mockController);
jest.mock('../../../../validates/quickText.validate', () => ({ floor: mockValidators }));
jest.mock('../../../../middlewares/ensureJsonWebToken', () => mockEnsureJsonWebToken);
jest.mock('../../../../routes/_shared/quickTextRoutes', () => ({
  buildQuickTextRouter: mockBuildQuickTextRouter,
}));

const ctrl = require('../../../../controllers/floor/floorQuickText.controller');
const { floor: validators } = require('../../../../validates/quickText.validate');
const ensureJsonWebToken = require('../../../../middlewares/ensureJsonWebToken');

describe('floorQuickTextのルーティング', () => {
  test('フロアの単語用ルータを共通処理で設定する', () => {
    const router = require('../../../../routes/floor/floorQuickText.route');

    expect(mockBuildQuickTextRouter).toHaveBeenCalledTimes(1);
    expect(mockBuildQuickTextRouter).toHaveBeenCalledWith({
      scope: 'floor',
      ctrl,
      validators,
      ensureJsonWebToken,
      listRequiresJwt: true,
    });
    expect(router).toBe(mockRouter);
  });
});
