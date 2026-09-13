const { EventEmitter } = require('events');
const { parse: parseUrl } = require('url');

const normalizeHeaders = (headers) =>
  Object.keys(headers || {}).reduce((acc, key) => {
    acc[key.toLowerCase()] = headers[key];
    return acc;
  }, {});

const buildResponse = (resolve) => {
  const res = new EventEmitter();
  const chunks = [];

  res.statusCode = 200;
  res.headers = {};
  res.locals = {};

  res.setHeader = (name, value) => {
    const key = String(name).toLowerCase();
    if (key === 'set-cookie') {
      const existing = res.headers[key];
      if (existing) {
        res.headers[key] = ([]).concat(existing, value);
      } else {
        res.headers[key] = Array.isArray(value) ? value : [value];
      }
      return;
    }
    res.headers[key] = value;
  };

  res.getHeader = (name) => res.headers[String(name).toLowerCase()];
  res.writeHead = (status, headers = {}) => {
    res.statusCode = status;
    Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
  };

  res.write = (chunk) => {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  };

  res.end = (chunk) => {
    if (chunk) res.write(chunk);
    const buffer = chunks.length ? Buffer.concat(chunks) : Buffer.from('');
    const text = buffer.toString();
    const contentType = String(res.headers['content-type'] || '');
    let body;
    if (contentType.includes('application/json') && text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = undefined;
      }
    }

    res.text = text;
    res.body = body;
    res.status = res.statusCode;
    res.finished = true;

    res.emit('finish');
    resolve({ status: res.statusCode, statusCode: res.statusCode, body, text, headers: res.headers });
  };

  return res;
};

const execute = (app, method, path, state) =>
  new Promise((resolve, reject) => {
    const urlInfo = parseUrl(path, true);
    const req = new EventEmitter();
    req.method = method;
    req.url = path;
    req.originalUrl = path;
    req.headers = normalizeHeaders(state.headers);
    req.query = urlInfo.query || {};
    req.body = state.body !== undefined ? state.body : state.fields;
    req._body = true; // 設定済みの本文をbody-parserで再解析しない。
    if (state.files.length) {
      req.files = state.files;
      req.file = state.files[0];
    }

    const res = buildResponse(resolve);

    try {
      app.handle(req, res, (err) => {
        if (err) {
          res.statusCode = err.status || err.statusCode || 500;
          res.end();
          return;
        }
        if (!res.finished) {
          res.statusCode = 404;
          res.end();
        }
      });
    } catch (err) {
      reject(err);
    }
  });

const buildChain = (app, method, path) => {
  const state = {
    headers: {},
    body: undefined,
    fields: {},
    files: [],
  };

  let promise;
  const run = () => {
    if (!promise) promise = execute(app, method, path, state);
    return promise;
  };

  const chain = {
    set(name, value) {
      state.headers[name] = value;
      return chain;
    },
    send(body) {
      state.body = body;
      return run();
    },
    field(name, value) {
      state.fields[name] = value;
      return chain;
    },
    attach(name, buffer, filename) {
      state.files.push({ fieldname: name, buffer, filename });
      return chain;
    },
    then(resolve, reject) {
      return run().then(resolve, reject);
    },
    catch(reject) {
      return run().catch(reject);
    },
  };

  return chain;
};

const makeRequester = (app) => ({
  get: (path) => buildChain(app, 'GET', path),
  post: (path) => buildChain(app, 'POST', path),
  put: (path) => buildChain(app, 'PUT', path),
  patch: (path) => buildChain(app, 'PATCH', path),
  delete: (path) => buildChain(app, 'DELETE', path),
  del: (path) => buildChain(app, 'DELETE', path),
});

module.exports = (app) => makeRequester(app);
