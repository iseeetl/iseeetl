const buildReq = ({
  headers = {},
  cookies = {},
  session = {},
  jwtPayload,
  requestId = 'test-request-id',
  body = {},
} = {}) => {
  const normalized = Object.keys(headers).reduce((acc, key) => {
    acc[key.toLowerCase()] = headers[key];
    return acc;
  }, {});
  return {
    headers: normalized,
    cookies,
    session,
    jwtPayload,
    body,
    requestId,
    get(name) {
      return this.headers[name.toLowerCase()];
    },
  };
};

const buildRes = () => {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    text: '',
    setHeader(name, value) {
      this.headers[name] = value;
    },
    clearCookie(name) {
      this.headers['Set-Cookie'] = `${name}=`;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.text = payload;
      return this;
    },
  };
  return res;
};

const runMiddleware = (middleware, req, res, { onSuccess, onError } = {}) => {
  return new Promise((resolve) => {
    const next = (err) => {
      if (err) {
        if (onError) onError(err, req, res);
        return resolve(res);
      }
      if (onSuccess) onSuccess(req, res);
      resolve(res);
    };
    middleware(req, res, next);
  });
};

module.exports = {
  buildReq,
  buildRes,
  runMiddleware,
};
