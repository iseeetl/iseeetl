const { createApiActor, createFloorRoomFixture } = require('../../helpers/api-fixture');
const { loginByForm } = require('../../helpers/session-helpers');
const { clearBrowserSession } = require('../../helpers/auth-security');
const { getBaseUrl, navigateToApp, requireEnv } = require('../../helpers/login');
const { waitForTimelineReady } = require('../../helpers/e2e-public-contract');
const { closeSoundCautionIfVisible } = require('../../helpers/invite-ui-helpers');
const { clickSingleVisible, clickSingleVisibleAfterExactControls } = require('../../helpers/dialog-focus');

const save = (browser, title, content) => {
  clickSingleVisibleAfterExactControls(browser, {
    anchorSelector: '#edit_supplement_dialog_title',
    submitSelector: '[data-testid="dialog-edit-supplement-submit"]',
    expectedControls: [
      { selector: '#supplement_title', value: title },
      { selector: '#supplement_content', value: content },
    ],
    label: '付加情報のタイトルと本文を保存',
  });
  browser.waitForElementNotVisible('#supplement_title', 10000);
};

module.exports = Object.fromEntries([false, true].map((isReply) => [
  `${isReply ? '返信' : '投稿'}の付加情報でタイトルを作成・編集・解除し、再読込後も保存値を表示する`,
  (browser) => {
    let actor;
    let target;
    browser.perform(async () => {
      actor = await createApiActor(browser, 'E2E_FLOOR_EDITOR');
      target = await createFloorRoomFixture(actor, `supplement-title-${isReply}`);
      const base = `/api/rooms/${target.roomId}/timeline/posts`;
      const post = await actor.request(base, { content: 'タイトル確認の投稿', lang: 'ja' }, { status: 201 });
      if (isReply) await actor.request(`${base}/${post._id}/replies`, { content: 'タイトル確認の返信', lang: 'ja' }, { status: 201 });
    });
    clearBrowserSession(browser);
    loginByForm(browser, { mail: requireEnv('E2E_FLOOR_EDITOR_MAIL'), password: requireEnv('E2E_FLOOR_EDITOR_PASSWORD') });
    closeSoundCautionIfVisible(browser);
    browser.perform(() => {
      navigateToApp(browser, `${getBaseUrl(browser)}/floor/${target.floorId}/room/${target.roomId}`);
      waitForTimelineReady(browser, { requireRoomReady: true }, (ready) => browser.assert.ok(ready, '対象ルームへ接続しました。'));
    });
    const add = `[data-testid="timeline-${isReply ? 'reply' : 'post'}-supplement-button"]`;
    browser.waitForElementVisible(add, 10000);
    clickSingleVisible(browser, add, '付加情報の作成画面を開く');
    browser.waitForElementVisible('#supplement_title', 10000);
    browser.assert.attributeEquals('#supplement_title', 'maxlength', '50', 'タイトルは50文字まで入力できます。');
    browser.assert.attributeEquals('#supplement_title', 'type', 'text', 'タイトルは1行で入力します。');
    browser.setValue('#supplement_title', 'お買い得メモ！').setValue('#supplement_content', '付加情報の本文');
    save(browser, 'お買い得メモ！', '付加情報の本文');
    const heading = 'article.supplement .user-name-button';
    browser.waitForElementVisible(heading, 10000);
    browser.assert.textEquals(heading, 'お買い得メモ！', '任意のタイトルが表示されます。');
    const edit = '[data-testid="timeline-supplement-edit-button"]';
    clickSingleVisible(browser, edit, '付加情報を編集');
    browser.waitForElementVisible('#supplement_title', 10000);
    browser.assert.valueEquals('#supplement_title', 'お買い得メモ！', '保存した原文タイトルが入力欄に表示されます。');
    const literal = '<b>変更したメモ</b>';
    browser.clearValue('#supplement_title').setValue('#supplement_title', literal);
    save(browser, literal, '付加情報の本文');
    browser.assert.textEquals(heading, literal, 'タイトルの変更が再読込なしで反映されます。');
    browser.assert.not.elementPresent(`${heading} b`, 'タイトルのHTMLは解釈しません。');
    browser.refresh().waitForElementVisible(heading, 10000);
    browser.assert.textEquals(heading, literal, '再読込後も変更したタイトルが表示されます。');
    clickSingleVisible(browser, edit, '付加情報のタイトルを解除');
    browser.waitForElementVisible('#supplement_title', 10000).clearValue('#supplement_title');
    save(browser, '', '付加情報の本文');
    browser.assert.textContains(heading, 'の付加情報', 'タイトルを空欄にすると従来の見出しへ戻ります。');
    browser.end();
  },
]));
