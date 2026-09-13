const MEDIA_CONTENT_SECURITY_POLICY = "default-src 'none'; base-uri 'none'; form-action 'none'; sandbox";

const setStaticMediaHeaders = (res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', MEDIA_CONTENT_SECURITY_POLICY);
};

module.exports = {
  MEDIA_CONTENT_SECURITY_POLICY,
  setStaticMediaHeaders,
};
