const { createApiActor, createFloorRoomFixture } = require('../../helpers/api-fixture');
const { loginByForm } = require('../../helpers/session-helpers');
const { clearBrowserSession } = require('../../helpers/auth-security');
const { requireEnv } = require('../../helpers/login');
const { expireInvite } = require('../../../../../../backend/scripts/e2e/expire-invite');

const tests = {};
for (const kind of ['floor', 'room']) {
  tests[`${kind === 'floor' ? 'フロア' : 'ルーム'}への認証済みユーザの招待で、不正・対象違い・期限切れのトークンを参加せずに拒否する`] = (browser) => {
    let owner;
    let target;
    let other;
    let invite;
    browser.perform(async () => {
      owner = await createApiActor(browser, 'E2E_FLOOR_EDITOR');
      target = await createFloorRoomFixture(owner, `${kind} invite`);
      other = await createFloorRoomFixture(owner, `${kind} other`);
      invite = await owner.request(`/api/${kind}member/invite`, {
        floor_id: target.floorId, ...(kind === 'room' ? { room_id: target.roomId } : {}), period: '8h',
      });
    });
    clearBrowserSession(browser);
    loginByForm(browser, { mail: requireEnv('E2E_USER_MAIL'), password: requireEnv('E2E_USER_PASSWORD') });
    for (const scenario of ['invalid', 'wrong-target', 'expired']) {
      const expectedCode = scenario === 'expired' ? 'INVITE_EXPIRED' : scenario === 'wrong-target' && kind === 'room' ? 'NOT_FOUND' : 'INVALID_PARAMS';
      const expectedMessage = {
        INVITE_EXPIRED: '招待の有効期限が切れています',
        NOT_FOUND: '処理に失敗しました',
        INVALID_PARAMS: '入力内容が正しくありません。',
      }[expectedCode];
      browser.perform(async () => {
        if (scenario === 'expired') {
          await expireInvite({ kind, inviteId: invite._id, floorId: target.floorId, roomId: target.roomId, userId: owner.userId });
        }
      });
      browser.perform(() => {
        const resource = scenario === 'wrong-target' ? other : target;
        const token = scenario === 'invalid' ? 'invalid-token' : invite.token;
        const route = `/floor/${resource.floorId}${kind === 'room' ? `/room/${resource.roomId}` : ''}/invite/${token}`;
        // 招待URLやトークンがレポートへ出ないよう、ブラウザからは検証結果だけを返す。
        browser.execute(function (path, endpoint) {
          window.__inviteRejection = null;
          const open = XMLHttpRequest.prototype.open;
          XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            if (new URL(url, location.origin).pathname === endpoint) {
              this.addEventListener('load', () => {
                const body = JSON.parse(this.responseText);
                window.__inviteRejection = { status: this.status, code: body.error?.code || '' };
              }, { once: true });
              XMLHttpRequest.prototype.open = open;
            }
            return open.call(this, method, url, ...rest);
          };
          window.history.pushState({}, '', path);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }, [route, `/api/${kind}member/create`]);
      });
      browser.waitForElementVisible('.view-content p[role="alert"]', 10000)
        .assert.textContains('.view-content p[role="alert"]', expectedMessage)
        .assert.not.elementPresent('#mail');
      browser.execute(function () { return window.__inviteRejection; }, [], (result) => {
        browser.assert.equal(result.value?.code, expectedCode, `${kind} ${scenario}: サーバが指定の拒否理由を返します。`);
        browser.assert.ok(result.value?.status >= 400, '参加要求がサーバで拒否されます。');
      });
      browser.perform(async () => {
        for (const resource of [target, other]) {
          const members = await owner.request(`/api/${kind}member`, {
            floor_id: resource.floorId, ...(kind === 'room' ? { room_id: resource.roomId } : {}),
          });
          browser.assert.equal(members.length, 0, `${kind} ${scenario}: メンバーに登録されていません。`);
        }
      });
      // 次のトークンで新たな参加要求が発生するよう、いったん完了画面を閉じる。
      browser.execute(function () { window.history.pushState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')); })
        .waitForElementVisible('#search_floor_input', 10000);
    }
    browser.end();
  };
}
module.exports = tests;
