const nodemailer = require('nodemailer');

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: jest.fn() })),
}));
const mockGetMailDeliveryConfig = jest.fn(() => ({
  host: 'smtp.example.com',
  port: 25,
}));
jest.mock('../../../../config/featureFlags', () => ({
  getMailDeliveryConfig: mockGetMailDeliveryConfig,
}));

const { createMailTransport } = require('../../../../integrations/mail/mailer');

describe('メール送信クライアント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMailDeliveryConfig.mockReturnValue({ host: 'smtp.example.com', port: 25 });
  });

  test('環境別の分岐を設けず、設定済みのSMTP接続を使う', () => {
    createMailTransport();

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 25,
      secure: false,
      tls: { rejectUnauthorized: false },
    });
  });
});
