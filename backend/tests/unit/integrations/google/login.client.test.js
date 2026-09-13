const mockVerifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn(() => ({ verifyIdToken: mockVerifyIdToken })),
}));

const { OAuth2Client } = require('google-auth-library');
const { verifyGoogleIdToken } = require('../../../../integrations/google/login.client');

test('検証対象のトークンとaudienceをSDKへ渡し、検証済みpayloadを返す', async () => {
  const payload = { sub: 'google-fixture', email_verified: true };
  mockVerifyIdToken.mockResolvedValue({ getPayload: () => payload });

  await expect(verifyGoogleIdToken({ idToken: 'dummy-token', audience: 'dummy-client' }))
    .resolves.toEqual(payload);
  expect(mockVerifyIdToken).toHaveBeenCalledWith({ idToken: 'dummy-token', audience: 'dummy-client' });
  await verifyGoogleIdToken({ idToken: 'another-dummy-token', audience: 'dummy-client' });
  expect(OAuth2Client).toHaveBeenCalledTimes(1);
});

test('SDKの検証失敗を呼び出し元へ返し、再試行しない', async () => {
  const failure = new Error('invalid fixture token');
  mockVerifyIdToken.mockRejectedValue(failure);
  await expect(verifyGoogleIdToken({ idToken: 'invalid-dummy-token', audience: 'dummy-client' }))
    .rejects.toBe(failure);
  expect(mockVerifyIdToken).toHaveBeenCalledTimes(1);
});
