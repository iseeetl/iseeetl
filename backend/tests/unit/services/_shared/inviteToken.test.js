const AppError = require('../../../../utils/appError');
const { createInviteToken, buildInviteTokenExpiry } = require('../../../../services/_shared/inviteToken');

describe('招待トークンの共通処理', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('48桁の16進数の招待トークンを生成する', () => {
    const token = createInviteToken();
    expect(token).toMatch(/^[0-9a-f]{48}$/i);
  });

  test('8時間と3日間の招待期限を設定する', () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const base = new Date();

    const exp8h = buildInviteTokenExpiry('8h');
    const exp3d = buildInviteTokenExpiry('3d');

    expect(exp8h.getTime()).toBeGreaterThan(base.getTime());
    expect(exp3d.getTime()).toBeGreaterThan(exp8h.getTime());
  });

  test('1か月の招待期限を設定する', () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const exp = buildInviteTokenExpiry('1m');
    expect(exp.getMonth()).toBe(1);
  });

  test('不正な期間指定を拒否する', () => {
    expect(() => buildInviteTokenExpiry('1y')).toThrow(AppError);
  });
});
