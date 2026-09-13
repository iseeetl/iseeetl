const { createApiActor } = require('../../helpers/api-fixture');
const { loginByForm } = require('../../helpers/session-helpers');
const { clearBrowserSession } = require('../../helpers/auth-security');
const { requireEnv, getBaseUrl, navigateToApp } = require('../../helpers/login');
const { makeFileInputInteractable } = require('../../helpers/timeline-media-lifecycle');
const { writeRuntimeFixture } = require('../../helpers/runtime-fixture');
const { clickSingleVisible, clickSingleVisibleAfterExactControls } = require('../../helpers/dialog-focus');

const snapshot = (tags) => tags.map(({ _id, name, order }) => ({ _id, name, order })).sort((a, b) => a._id.localeCompare(b._id));
const csvText = (tags) => '\uFEFF' + tags.map(({ name, order }) => `${order},"${name.replace(/"/g, '""')}"`).join('\r\n') + '\r\n';

module.exports = {
  '共通タグのCSV取込でプレビュー・取消・正常取込・重複拒否を確認する': (browser) => {
    let actor;
    let initial;
    let imported;
    let original;
    let validFile;
    let invalidFile;
    const stamp = Date.now();
    const newName = `E2E CSV, "引用" ${stamp}`;
    browser.perform(async () => {
      actor = await createApiActor(browser);
      original = await actor.request('/api/categorytag/management/create', { name: `E2E CSV existing ${stamp}`, order: 79 });
      initial = await actor.request('/api/categorytag/management/');
      // 既存タグを変更しないよう、CSVには既存の有効なタグをすべて含め、専用タグだけを更新する。
      const rows = initial.map((tag) => ({ ...tag, order: tag._id === original._id ? 80 : tag.order }));
      rows.push({ name: newName, order: 81 });
      validFile = writeRuntimeFixture(`category-valid-${stamp}.csv`, csvText(rows));
      invalidFile = writeRuntimeFixture(`category-duplicate-${stamp}.csv`, csvText([...rows, { name: newName, order: 82 }]));
    });
    clearBrowserSession(browser);
    loginByForm(browser, { mail: requireEnv('E2E_ADMIN_MAIL'), password: requireEnv('E2E_ADMIN_PASSWORD') });
    navigateToApp(browser, `${getBaseUrl(browser)}/management/categorytag`).waitForElementPresent('#csvupload', 10000);
    const choose = (invalid = false) => {
      browser.perform(() => {
        makeFileInputInteractable(browser, '#csvupload');
        browser.setValue('#csvupload', invalid ? invalidFile : validFile);
      });
      browser.waitForElementVisible('#category-tag-import-dialog-title', 10000)
        .assert.textContains('#category-tag-import-file-context', invalid ? 'category-duplicate-' : 'category-valid-')
        .assert.visible('#category-tag-import-warning');
    };
    choose();
    browser.perform(async () => browser.assert.deepEqual(snapshot(await actor.request('/api/categorytag/management/')), snapshot(initial), 'CSVを選択しても保存済みのタグは変わりません。'));
    clickSingleVisible(browser, '[data-testid="management-categorytag-import-cancel"]', 'CSVのプレビューをキャンセル');
    browser.waitForElementNotPresent('#category-tag-import-dialog-title', 10000);
    browser.perform(async () => browser.assert.deepEqual(snapshot(await actor.request('/api/categorytag/management/')), snapshot(initial), 'CSVの読み込みをキャンセルすると保存済みのタグを維持します。'));
    choose();
    const confirm = (invalid = false) => clickSingleVisibleAfterExactControls(browser, {
      anchorSelector: '#category-tag-import-dialog-title',
      expectedControls: [
        { selector: '#category-tag-import-warning', property: 'textContent', value: '現在のデータはインポート内容で置き換えられます。' },
        { selector: '#category-tag-import-file-context .dialog-target-context__name', property: 'textContent', value: `category-${invalid ? 'duplicate' : 'valid'}-${stamp}.csv` },
      ],
      submitSelector: '[data-testid="management-categorytag-import-confirm"]', label: '選択したCSVの読み込みを確定',
    });
    confirm();
    browser.waitForElementNotPresent('#category-tag-import-dialog-title', 10000);
    browser.perform(async () => {
      imported = await actor.request('/api/categorytag/management/');
      browser.assert.ok(imported.some((tag) => tag.name === newName && tag.order === 81), '引用符で囲まれたカンマを含むCSVの名前が保存されます。');
      browser.assert.ok(imported.some((tag) => tag._id === original._id && tag.order === 80), '同名のタグを読み込んでも元のIDを維持します。');
      browser.assert.equal(imported.length, initial.length + 1, '読み込みによってタグが1件だけ増えます。');
    });
    browser.refresh().waitForElementPresent('#csvupload', 10000);
    browser.waitForElementVisible('#management-search-input', 10000)
      .setValue('#management-search-input', String(stamp))
      .click('[data-testid="management-search-submit"]')
      .assert.textContains('table.management-table', newName);
    choose(true);
    confirm(true);
    browser.waitForElementVisible('.ui-snackbar', 10000)
      .assert.textContains('.ui-snackbar', 'CSVファイルのインポートに失敗しました')
      .assert.visible('#category-tag-import-dialog-title');
    browser.perform(async () => browser.assert.deepEqual(snapshot(await actor.request('/api/categorytag/management/')), snapshot(imported), '重複による読み込み拒否後も、すべての保存済みタグが変わりません。'));
    clickSingleVisible(browser, '[data-testid="management-categorytag-import-cancel"]', '拒否されたCSVの読み込みをキャンセル');
    browser.waitForElementNotPresent('#category-tag-import-dialog-title', 10000);
    browser.end();
  },
};
