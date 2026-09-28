const { createApiActor, createFloorRoomFixture } = require('../../helpers/api-fixture');
const { loginByForm } = require('../../helpers/session-helpers');
const { clearBrowserSession } = require('../../helpers/auth-security');
const { getBaseUrl, navigateToApp, requireEnv } = require('../../helpers/login');
const { waitForTimelineReady } = require('../../helpers/e2e-public-contract');
const { closeSoundCautionIfVisible } = require('../../helpers/invite-ui-helpers');
const { clickSingleVisible, clickSingleVisibleAfterExactControls } = require('../../helpers/dialog-focus');
const { waitForPostCount } = require('../../helpers/timeline-two-client');

const MESSAGE = '[data-testid="timeline-empty-message"]';
const DEFAULT_MESSAGE = 'まだ投稿がありません。投稿されると、ここに表示されます。';

module.exports = {
  '案内文を編集・保存し、投稿の作成と削除に合わせて表示を切り替える': (browser) => {
    let actor;
    let target;
    let post;
    const custom = '<b>ようこそ。投稿をお待ちください。</b>';
    const content = `案内文確認の投稿 ${Date.now()}`;
    browser.perform(async () => {
      actor = await createApiActor(browser, 'E2E_FLOOR_EDITOR');
      target = await createFloorRoomFixture(actor, 'empty-message');
    });
    clearBrowserSession(browser);
    loginByForm(browser, { mail: requireEnv('E2E_FLOOR_EDITOR_MAIL'), password: requireEnv('E2E_FLOOR_EDITOR_PASSWORD') });
    closeSoundCautionIfVisible(browser);
    browser.perform(() => {
      navigateToApp(browser, `${getBaseUrl(browser)}/floor/${target.floorId}`);
      browser.waitForElementVisible(`.edit-room-button-${target.roomId}`, 10000);
      clickSingleVisible(browser, `.edit-room-button-${target.roomId}`, '案内文を設定するルームを編集');
    });
    browser.waitForElementVisible('#room_empty_message', 10000);
    browser.assert.attributeEquals('#room_empty_message', 'type', 'text', '案内文は改行なしの入力欄です。');
    browser.assert.attributeEquals('#room_empty_message', 'maxlength', '200', '案内文は200文字まで入力できます。');
    browser.assert.valueEquals('#room_empty_message', '', '未設定の案内文は空欄です。');
    browser.setValue('#room_empty_message', custom);
    browser.perform(() => {
      clickSingleVisibleAfterExactControls(browser, {
        anchorSelector: '#room_title',
        submitSelector: '[data-testid="base-edit-dialog-confirm"]',
        expectedControls: [
          { selector: '#room_title', property: 'value', value: target.roomTitle },
          { selector: '#room_description', property: 'value', value: 'E2E coverage fixture' },
          { selector: '#room_empty_message', property: 'value', value: custom },
          ...['guest_reaction_only', 'member_only', 'notification', 'external_sns_button', 'hidden_flg']
            .map((id) => ({ selector: `#${id}`, property: 'checked', value: false })),
        ],
        label: '案内文を保存',
      });
    });
    browser.waitForElementNotVisible('#room_empty_message', 10000);
    browser.perform(() => {
      navigateToApp(browser, `${getBaseUrl(browser)}/floor/${target.floorId}/room/${target.roomId}`);
      waitForTimelineReady(browser, { requireRoomReady: true }, (ready) => browser.assert.ok(ready, '空のルームへの接続が完了しました。'));
    });
    browser.waitForElementVisible(MESSAGE, 10000);
    browser.assert.textEquals(MESSAGE, custom, '保存した案内文がタイムラインに表示されます。');
    browser.assert.not.elementPresent(`${MESSAGE} b`, '案内文のHTMLは解釈しません。');
    browser.windowSize('current', 390, 844);
    browser.assert.visible(MESSAGE, 'スマートフォン幅でも案内文を表示します。');
    browser.perform(async () => {
      post = await actor.request(`/api/rooms/${target.roomId}/timeline/posts`, { content, lang: 'ja' }, { status: 201 });
    });
    waitForPostCount(browser, content, 1, '新しい投稿が表示される');
    browser.waitForElementNotPresent(MESSAGE, 10000);
    browser.perform(() => {
      navigateToApp(browser, `${getBaseUrl(browser)}/floor/${target.floorId}/room/${target.roomId}?keyword=一致しない語句`);
      waitForTimelineReady(browser, { requireRoomReady: true }, (ready) => browser.assert.ok(ready, '絞り込み後の接続が完了しました。'));
    });
    waitForPostCount(browser, content, 0, '絞り込みで投稿が表示されない');
    browser.assert.not.elementPresent(MESSAGE, '絞り込みの結果が空でも、投稿なしの案内は表示しません。');
    browser.perform(async () => {
      await actor.request(`/api/rooms/${target.roomId}/timeline/posts/${post._id}`, undefined, { method: 'DELETE', status: 204 });
    });
    browser.waitForElementVisible(MESSAGE, 10000);
    browser.assert.textEquals(MESSAGE, custom, '最後の投稿を削除すると案内文が再び表示されます。');
    browser.perform(async () => {
      const room = await actor.request('/api/room/detail', { _id: target.roomId });
      const updated = await actor.request('/api/room/update', { ...room, floor_id: target.floorId, empty_message: '' });
      browser.assert.equal(updated.empty_message, '', '案内文を空欄で保存しました。');
    });
    browser.perform(() => navigateToApp(browser, `${getBaseUrl(browser)}/floor/${target.floorId}/room/${target.roomId}?lang=ja`));
    // 別クライアントによる設定更新後、再読み込みして保存状態を確認する。
    browser.refresh();
    browser.waitForElementVisible(MESSAGE, 10000);
    browser.assert.textEquals(MESSAGE, DEFAULT_MESSAGE, '空欄で保存したルームを再読み込みすると標準の案内文に戻ります。');
    browser.saveScreenshot(require('path').resolve(__dirname, '../../../../../../.e2e-runtime/reports/nightwatch/empty-message-mobile.png'));
    browser.perform(() => navigateToApp(browser, `${getBaseUrl(browser)}/floor/${target.floorId}/room/${target.roomId}?lang=en`));
    browser.waitForElementVisible(MESSAGE, 10000);
    browser.assert.textEquals(MESSAGE, 'No posts yet. New posts will appear here.', '標準の案内文を表示言語に合わせます。');
    clearBrowserSession(browser);
    browser.perform(() => navigateToApp(browser, `${getBaseUrl(browser)}/floor/${target.floorId}/room/${target.roomId}?lang=ja`));
    browser.waitForElementVisible(MESSAGE, 10000);
    browser.assert.textEquals(MESSAGE, DEFAULT_MESSAGE, 'ゲストにも標準の案内文を表示します。');
    browser.end();
  },
};
