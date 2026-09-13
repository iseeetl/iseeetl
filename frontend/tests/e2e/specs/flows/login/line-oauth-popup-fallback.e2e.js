// 実際のLINE認証、コールバック、アカウント連携はステージングで確認する。
// 外部サービスへ接続せず、同一タブで認証を開始するリンクのクリックをDOM上で検証する。
const { getBaseUrl } = require('../../helpers/login');

const LINE_LOGIN_BUTTON = 'button.line-login-btn';
const AUTHORIZE_PATH = '/api/auth/line/authorize';
const FLOOR_ID = 'e2e-line-oauth-floor';
const ROOM_ID = 'e2e-line-oauth-room';

const isLocalHostname = (hostname) => ['localhost', '127.0.0.1', '::1'].includes(hostname);

module.exports = {
  '@tags': ['provider-line'],
  'LINEログインはポップアップを開き、開けない場合は同じタブで移動する': (browser) => {
    const base = getBaseUrl(browser).replace(/\/$/, '');
    const loginUrl = `${base}/login?floor_id=${encodeURIComponent(FLOOR_ID)}&room_id=${encodeURIComponent(ROOM_ID)}`;
    const state = {
      popupReady: false,
      popupLang: '',
      popupOriginIsLocal: false,
      fallbackReady: false,
    };

    browser
      .url(loginUrl)
      .waitForElementVisible(LINE_LOGIN_BUTTON, 10000)
      .execute(
        function () {
          window.__e2eLineOauthPopup = null;
          window.open = function (url, name, features) {
            window.__e2eLineOauthPopup = {
              url: String(url || ''),
              name: String(name || ''),
              features: String(features || ''),
            };
            return { closed: false };
          };
          return { ok: true };
        },
        [],
        (result) => {
          state.popupReady = Boolean(result && result.value && result.value.ok);
          browser.assert.ok(state.popupReady, 'ポップアップ検証用の代替処理を設定しました。');
        }
      )
      .perform(() => {
        if (state.popupReady) browser.click(LINE_LOGIN_BUTTON);
      })
      .execute(
        function () {
          const captured = window.__e2eLineOauthPopup;
          if (!captured || !captured.url) return { ok: false };

          const url = new URL(captured.url, window.location.href);
          return {
            ok: true,
            currentPath: window.location.pathname,
            authorizePath: url.pathname,
            authorizeHost: url.hostname,
            lang: url.searchParams.get('lang') || '',
            floorId: url.searchParams.get('floor_id') || '',
            roomId: url.searchParams.get('room_id') || '',
            name: captured.name,
            features: captured.features,
          };
        },
        [],
        (result) => {
          const captured = result && result.value ? result.value : { ok: false };
          state.popupLang = captured.lang || '';
          state.popupOriginIsLocal = Boolean(captured.authorizeHost && isLocalHostname(captured.authorizeHost));

          browser.assert.ok(captured.ok, 'LINEのOAuth認可URLがwindow.openに渡されます。');
          if (!captured.ok) return;

          browser.assert.equal(captured.currentPath, '/login', 'ポップアップ表示中も現在のタブはログイン画面のままです。');
          browser.assert.equal(captured.authorizePath, AUTHORIZE_PATH, 'ポップアップはLINEの認可エンドポイントを使用します。');
          browser.assert.ok(Boolean(captured.lang), 'ポップアップのURLに画面の言語が含まれます。');
          browser.assert.equal(captured.floorId, FLOOR_ID, 'ポップアップのURLがfloor_idを維持しています。');
          browser.assert.equal(captured.roomId, ROOM_ID, 'ポップアップのURLがroom_idを維持しています。');
          browser.assert.equal(captured.name, 'line_login', 'ポップアップはLINE専用のウィンドウ名を使用します。');
          browser.assert.ok(captured.features.includes('popup=yes'), 'ウィンドウ設定でポップアップモードを指定しています。');
          browser.assert.ok(captured.features.includes('width=500'), 'ポップアップの幅が設定どおりです。');
          browser.assert.ok(captured.features.includes('height=640'), 'ポップアップの高さが設定どおりです。');
        }
      )
      .url(loginUrl)
      .waitForElementVisible(LINE_LOGIN_BUTTON, 10000)
      .execute(
        function () {
          const fallback = document.querySelector('[data-testid="line-login-fallback"]');
          if (!fallback) return { ok: false, reason: 'fallback-link-not-found' };
          window.__e2eLineOauthFallbackUrl = '';
          fallback.addEventListener('click', function (event) {
            event.preventDefault();
            window.__e2eLineOauthFallbackUrl = fallback.href;
          }, { once: true });
          window.open = function () {
            return null;
          };
          return { ok: true, reason: '' };
        },
        [],
        (result) => {
          const prepared = result && result.value ? result.value : { ok: false, reason: 'no-result' };
          state.fallbackReady = Boolean(prepared.ok && state.popupLang && state.popupOriginIsLocal);
          browser.assert.ok(
            state.fallbackReady,
            `代替遷移の検証用処理を準備しました（${prepared.reason || 'local-authorize-origin-required'}）。`
          );
        }
      )
      .perform(() => {
        if (!state.fallbackReady) return;
        browser.click(LINE_LOGIN_BUTTON);
      })
      .execute(
        function () {
          const captured = window.__e2eLineOauthFallbackUrl || '';
          if (!captured) return { ok: false };
          const url = new URL(captured, window.location.href);
          return {
            ok: true,
            currentPath: window.location.pathname,
            authorizePath: url.pathname,
            authorizeHost: url.hostname,
            lang: url.searchParams.get('lang') || '',
            floorId: url.searchParams.get('floor_id') || '',
            roomId: url.searchParams.get('room_id') || '',
          };
        },
        [],
        (result) => {
          const captured = result && result.value ? result.value : { ok: false };
          browser.assert.ok(captured.ok, 'ポップアップがブロックされたため、同じタブで開くリンクが実行されました。');
          browser.assert.equal(captured.currentPath, '/login', '代替遷移を抑止すると、ローカルのテストではログイン画面を維持します。');
          browser.assert.equal(captured.authorizePath, AUTHORIZE_PATH, '代替遷移はLINEの認可エンドポイントを使用します。');
          browser.assert.ok(isLocalHostname(captured.authorizeHost), '代替遷移の認可エンドポイントはローカルのままです。');
          browser.assert.equal(captured.lang, state.popupLang, '代替遷移がポップアップの言語を維持しています。');
          browser.assert.equal(captured.floorId, FLOOR_ID, '代替遷移がfloor_idを維持しています。');
          browser.assert.equal(captured.roomId, ROOM_ID, '代替遷移がroom_idを維持しています。');
        }
      )
      .perform(() => {
        browser.url(`${base}/login`);
      })
      .waitForElementVisible(LINE_LOGIN_BUTTON, 10000)
      .end();
  },
};
