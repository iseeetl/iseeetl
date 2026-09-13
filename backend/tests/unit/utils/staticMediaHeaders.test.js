const { MEDIA_CONTENT_SECURITY_POLICY, setStaticMediaHeaders } = require('../../../utils/staticMediaHeaders');

describe('staticMediaHeadersの検証', () => {
  test('静的メディアへ能動コンテンツ実行を防ぐヘッダを設定する', () => {
    const res = { setHeader: jest.fn() };

    setStaticMediaHeaders(res);

    expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Security-Policy', MEDIA_CONTENT_SECURITY_POLICY);
    expect(MEDIA_CONTENT_SECURITY_POLICY).toContain("default-src 'none'");
    expect(MEDIA_CONTENT_SECURITY_POLICY).toContain('sandbox');
  });
});
