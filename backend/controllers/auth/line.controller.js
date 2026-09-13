const AppError = require('../../utils/appError');
const authService = require('../../services/auth.service');
const { getApplicationConfig } = require('../../config/application');
const { getLineLoginConfig, isLineLoginEnabled } = require('../../config/featureFlags');
const { readIntEnv } = require('../../config/env');
const { setUserMediaAccessCookie } = require('../../utils/mediaAccessCookie');

const LINE_OAUTH_COOKIE_TTL_MS = readIntEnv('LINE_OAUTH_COOKIE_TTL_MS', {
  defaultValue: 10 * 60 * 1000,
  min: 1,
});
const INLINE_SCRIPT_ESCAPE_MAP = {
  '<': '\\u003C',
  '>': '\\u003E',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

const serializeForInlineScript = (value) =>
  JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (char) => INLINE_SCRIPT_ESCAPE_MAP[char] || char);

exports.lineAuthorize = async (req, res, next) => {
  try {
    if (!isLineLoginEnabled()) {
      throw new AppError({
        code: 'EXTERNAL_FEATURE_DISABLED',
        details: { feature: 'lineLogin' },
      });
    }
    const lineConfig = getLineLoginConfig();
    const { state, nonce, url } = await authService.buildLineAuthorize({
      lang: req.query.lang,
      clientId: lineConfig.clientId,
      redirectUri: lineConfig.redirectUri,
    });
    const cookieOpts = {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: LINE_OAUTH_COOKIE_TTL_MS,
    };
    const floorId = typeof req.query.floor_id === 'string' ? req.query.floor_id.trim() : '';
    const roomId = typeof req.query.room_id === 'string' ? req.query.room_id.trim() : '';
    res.cookie('line_oauth_state', state, cookieOpts);
    res.cookie('line_oauth_nonce', nonce, cookieOpts);
    res.cookie('line_lang', req.query.lang || '', cookieOpts);
    res.cookie('line_floor_id', floorId, cookieOpts);
    res.cookie('line_room_id', roomId, cookieOpts);
    return res.redirect(url);
  } catch (err) {
    next(err);
  }
};

exports.lineCallback = async (req, res, next) => {
  try {
    if (!isLineLoginEnabled()) {
      throw new AppError({
        code: 'EXTERNAL_FEATURE_DISABLED',
        details: { feature: 'lineLogin' },
      });
    }
    const { code, state } = req.query || {};
    const cookieState = req.cookies?.line_oauth_state;
    const cookieNonce = req.cookies?.line_oauth_nonce;
    const cookieLang = req.cookies?.line_lang || null;
    const cookieFloorId = req.cookies?.line_floor_id || '';
    const cookieRoomId = req.cookies?.line_room_id || '';

    if (!state || !cookieState || state !== cookieState) {
      throw new AppError({ code: 'INVALID_PERMISSION' });
    }

    res.clearCookie('line_oauth_state');
    res.clearCookie('line_oauth_nonce');
    res.clearCookie('line_lang');
    res.clearCookie('line_floor_id');
    res.clearCookie('line_room_id');

    const lineConfig = getLineLoginConfig();
    const { id_token, access_token } = await authService.exchangeLineToken({
      code,
      clientId: lineConfig.clientId,
      clientSecret: lineConfig.clientSecret,
      redirectUri: lineConfig.redirectUri,
    });
    const verify = await authService.verifyLineIdToken({
      id_token,
      clientId: lineConfig.clientId,
    });
    // ログイン開始時のnonceと一致するIDトークンだけを受け入れる。
    if (!verify.sub || !verify.nonce || verify.nonce !== cookieNonce) {
      throw new AppError({ code: 'INVALID_PERMISSION' });
    }

    const displayName = await authService.fetchLineDisplayName({
      access_token,
      fallback: `line_${verify.sub.slice(0, 8)}`,
    });

    const { user } = await authService.linkOrCreateUserFromLine({
      sub: verify.sub,
      email: verify.email || null,
      displayName,
      lang: typeof cookieLang === 'string' && cookieLang.length ? cookieLang : null,
    });

    const payload = await authService.buildLoginPayload(user);
    setUserMediaAccessCookie(res, payload.token);
    const postTargetOrigin = new URL(getApplicationConfig().appUrl).origin;
    const loginQuery = new URLSearchParams();
    if (typeof cookieFloorId === 'string' && cookieFloorId.length) loginQuery.set('floor_id', cookieFloorId);
    if (typeof cookieRoomId === 'string' && cookieRoomId.length) loginQuery.set('room_id', cookieRoomId);
    const loginPath = loginQuery.size ? `/login?${loginQuery.toString()}` : '/login';

    const html = `
    <!doctype html><html><head><meta charset="utf-8"><title>LINE Login</title></head>
    <body>
      <script>
        (function(){
          var data = ${serializeForInlineScript(payload)};
          var origin = ${serializeForInlineScript(postTargetOrigin)};
          var loginPath = ${serializeForInlineScript(loginPath)};
          var sent = false;
          try {
            if (window.opener && !window.opener.closed) {
              window.opener.postMessage({ type: 'line-login', payload: data }, origin);
              sent = true;
            }
          } catch(e) {}
          if (sent) {
            // ポップアップへ認証結果を送信できたため、ウィンドウを閉じる。
            window.close();
          } else {
            // openerを利用できないブラウザーでは、ログイン画面へ認証結果を引き継ぐ。
            try {
              var json = JSON.stringify(data);
              // UTF-8 安全な Base64
              var b64 = btoa(unescape(encodeURIComponent(json)));
              var url = origin + loginPath + '#oauth=line&data=' + encodeURIComponent(b64);
              window.location.replace(url);
            } catch(e) {
              // 認証結果を符号化できない場合は、ログイン画面へ戻す。
              window.location.replace(origin + loginPath);
            }
          }
        })();
      </script>

        ログインが完了しました。ウィンドウを閉じてください。
      </body></html>`;
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (err) {
    next(err);
  }
};
