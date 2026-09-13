const { prepareTimelineRoom } = require('../../helpers/timeline-helpers');

module.exports = {
  'ログイン後にタイムラインへ移動できる': (browser) => {
    const editorMail = process.env.E2E_FLOOR_EDITOR_MAIL || '';
    const editorPassword = process.env.E2E_FLOOR_EDITOR_PASSWORD || '';
    const mail = process.env.E2E_USER_MAIL || '';
    const password = process.env.E2E_USER_PASSWORD || '';

    if (!editorMail || !editorPassword || !mail || !password) {
      browser.assert.ok(false, 'ログイン後のタイムラインのテストに失敗しました。必須の認証情報が未設定です。');
      browser.end();
      return;
    }

    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Login Floor ${stamp}`;
    const roomTitle = `E2E Login Room ${stamp}`;

    prepareTimelineRoom(browser, {
      editorMail,
      editorPassword,
      userMail: mail,
      userPassword: password,
      floorTitle,
      roomTitle,
      loginEntry: 'room-context-menu',
    });

    browser.end();
  },
};
