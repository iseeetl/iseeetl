const { getBaseUrl, navigateToApp, requireEnv } = require('../../helpers/login');
const { runManagementFlowWithPreparedFloorRoom } = require('../../helpers/management-flow');
const { createTimelinePostByApiActor } = require('../../helpers/timeline-api-actor');

const openManagement = (browser) => {
  const base = getBaseUrl(browser);
  const url = `${base.replace(/\/$/, '')}/management/post`;
  navigateToApp(browser, url).waitForElementVisible('table.management-table', 10000);
};

const waitForExactPostRow = (browser, postText, attempt = 0, onDone) => {
  const maxAttempts = 10;
  browser.execute(
    function (targetText) {
      const rows = Array.from(document.querySelectorAll('table.management-table tbody tr'));
      const row = rows.find((node) => {
        const cells = node.querySelectorAll('td');
        const content = cells.length > 1 ? cells[1].querySelector('span[dir="auto"]') : null;
        return content && content.textContent.trim() === targetText;
      });
      return { found: !!row };
    },
    [postText],
    (result) => {
      const found = result && result.value ? result.value.found : false;
      if (found) {
        browser.assert.ok(true, `対象の投稿管理のテストデータが見つかりました: ${postText}`);
        if (onDone) onDone(true);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `対象の投稿管理のテストデータが見つかりません: ${postText}`);
        if (onDone) onDone(false);
        return;
      }
      browser.pause(500, () => waitForExactPostRow(browser, postText, attempt + 1, onDone));
    }
  );
};

module.exports = {
  '投稿管理の一覧を表示する': (browser) => {
    const editorMail = requireEnv('E2E_FLOOR_EDITOR_MAIL');
    const editorPassword = requireEnv('E2E_FLOOR_EDITOR_PASSWORD');
    const stamp = String(Date.now()).slice(-8);
    const floorTitle = `E2E Post Smoke Floor ${stamp}`;
    const roomTitle = `E2E Post Smoke Room ${stamp}`;
    const postText = `E2E Post Smoke ${stamp}`;

    runManagementFlowWithPreparedFloorRoom(
      browser,
      'Post Management Smoke',
      ({ floorId, roomId, finish }) => {
        createTimelinePostByApiActor(
          browser,
          {
            actorMail: editorMail,
            actorPassword: editorPassword,
            floorId,
            floorTitle,
            roomId,
            roomTitle,
            content: postText,
          },
          '投稿管理の基本動作のテストデータ'
        );
        openManagement(browser);
        waitForExactPostRow(browser, postText, 0, () => finish());
      },
      { floorTitle, roomTitle }
    );
  },
};
