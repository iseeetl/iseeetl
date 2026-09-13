const { createApiActor, createFloorRoomFixture } = require('../../helpers/api-fixture');
const { createV1Actor } = require('../../../../../../backend/scripts/e2e/create-v1-actor');
const { loginByForm } = require('../../helpers/session-helpers');
const { clearBrowserSession } = require('../../helpers/auth-security');
const { getBaseUrl, navigateToApp, requireEnv } = require('../../helpers/login');
const { waitForTimelineReady } = require('../../helpers/e2e-public-contract');
const { waitForPostCount } = require('../../helpers/timeline-two-client');
const { closeSoundCautionIfVisible } = require('../../helpers/invite-ui-helpers');

let foreign;
module.exports = {
  after: () => { foreign?.close(); foreign = null; },
  'v1 APIの変更を接続中のブラウザへ反映し、別ルームへ配信しない': (browser) => {
    let target;
    let actor;
    let owner;
    let other;
    let post;
    const text = `E2E v1 live ${Date.now()}`;
    const edited = `${text} edited`;
    browser.perform(async () => {
      owner = await createApiActor(browser, 'E2E_FLOOR_EDITOR');
      target = await createFloorRoomFixture(owner, 'v1 target');
      other = await createFloorRoomFixture(owner, 'v1 other');
      foreign = await owner.observeRoom(other.roomId);
      actor = await createApiActor(browser, '', await createV1Actor());
    });
    clearBrowserSession(browser);
    loginByForm(browser, { mail: requireEnv('E2E_FLOOR_EDITOR_MAIL'), password: requireEnv('E2E_FLOOR_EDITOR_PASSWORD') });
    closeSoundCautionIfVisible(browser);
    browser.perform(() => {
      navigateToApp(browser, `${getBaseUrl(browser)}/floor/${target.floorId}/room/${target.roomId}`);
      waitForTimelineReady(browser, { requireRoomReady: true }, (ready) => browser.assert.ok(ready, 'v1で書き込む前に、ブラウザがイベントの購読を開始しています。'));
    });
    browser.perform(async () => {
      post = await actor.request('/api/v1/post/create', { floor_id: target.floorId, room_id: target.roomId, content: text });
      browser.assert.ok(Boolean(post._id), 'v1で投稿を作成しました。');
    });
    waitForPostCount(browser, text, 1, 'v1での作成が即時に届く');
    browser.perform(async () => {
      browser.assert.deepEqual(foreign.events, [], '別ルームは作成イベントを受信しません。');
      await actor.request('/api/v1/post/update', { room_id: target.roomId, post_id: post._id, content: edited });
    });
    waitForPostCount(browser, edited, 1, 'v1での更新が即時に届く');
    // 更新後の本文に古い本文が含まれていても誤検出しないよう、完全一致で比較する。
    browser.execute(function (oldText) {
      return Array.from(document.querySelectorAll('article .post .text')).some((node) => node.textContent.trim() === oldText);
    }, [text], (result) => browser.assert.equal(result.value, false, '古い本文が置き換わりました。'));
    browser.perform(async () => {
      browser.assert.deepEqual(foreign.events, [], '別ルームは更新イベントを受信しません。');
      await actor.request('/api/v1/post/delete', { room_id: target.roomId, post_id: post._id });
    });
    waitForPostCount(browser, edited, 0, 'v1での削除が即時に届く');
    browser.perform(async () => {
      // 監視側のルームへ最後に投稿し、先行イベントの処理完了と監視接続の動作を確認する。
      await owner.request(`/api/rooms/${other.roomId}/timeline/posts`, { content: 'E2E observer control', lang: 'ja' }, { status: 201 });
      for (let attempt = 0; foreign.events.length === 0 && attempt < 100; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      browser.assert.ok(foreign.connected(), '一連の更新操作の間、別ルームは接続を維持しています。');
      browser.assert.deepEqual(foreign.events, ['POST_CREATE'], '別ルームは比較用の投稿だけを受信し、対象ルームの更新を受信しません。');
      foreign.close();
      foreign = null;
    });
    browser.end();
  },
};
