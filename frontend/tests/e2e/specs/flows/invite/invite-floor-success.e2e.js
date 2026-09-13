const { navigateDirectToApp, navigateToApp, waitForAppBootstrap } = require('../../helpers/login');
const {
  loginByForm,
  loginIfPresent,
  getInviteUserCredentials,
  getFloorEditorCredentials,
  buildFloorUrl,
  createInviteUrl,
  captureInviteUrl,
  waitForInviteCompletion,
  closeSoundCautionIfVisible,
  setInviteUrl,
  getInviteUrl,
  clickFirstVisible,
  logout,
  openFloorList,
  waitForUserRole,
  waitForFloorTitle,
  findFloorIdByTitle,
  createFloor,
} = require('../../helpers/invite-ui-helpers');

module.exports = {
  '招待画面からフロアに参加できる': (browser) => {
    const inviteUser = getInviteUserCredentials();
    const floorEditor = getFloorEditorCredentials();

    if (!inviteUser || !floorEditor) {
      browser.assert.ok(false, 'フロア招待の成功テストをスキップします。必須の環境変数が未設定です。');
      browser.end();
      return;
    }
    if (inviteUser.mail === floorEditor.mail) {
      browser.assert.ok(false, 'フロア招待では、フロア編集ユーザと招待されるユーザを分けてください。');
      browser.end();
      return;
    }

    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Invite Floor ${stamp}`;
    let floorId = '';
    let expectedFloorPath = '';

    loginByForm(browser, floorEditor);
    closeSoundCautionIfVisible(browser);
    browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);
    waitForUserRole(browser, 'Editor');
    openFloorList(browser);
    createFloor(browser, floorTitle);
    waitForFloorTitle(browser, floorTitle, true);
    findFloorIdByTitle(browser, floorTitle, (resolvedFloorId) => {
      floorId = resolvedFloorId;
    });

    browser.perform(() => {
      if (!floorId) {
        browser.assert.ok(false, 'フロアIDを取得できませんでした。');
        return;
      }
      expectedFloorPath = `/floor/${floorId}`;
      const floorUrl = buildFloorUrl(browser, floorId);
      navigateToApp(browser, floorUrl)
        .waitForElementVisible('[data-testid="room-invite-floor-member-button"]', 10000)
        .click('[data-testid="room-invite-floor-member-button"]')
        .waitForElementVisible('[data-testid="dialog-invite-floor-member"]', 10000);
      createInviteUrl(browser, 'floor', '8h');
    });

    captureInviteUrl(browser, '[data-testid="dialog-invite-floor-member-url"]', 'フロア', (value) => {
      setInviteUrl(browser, 'floor', value);
    });
    browser.assert.textContains('#invite_floor_member_dialog_limit', '8時間');

    clickFirstVisible(
      browser,
      '[data-testid="dialog-invite-floor-member-close-desktop"], [data-testid="dialog-invite-floor-member-close-mobile"]',
      'フロア招待を閉じる'
    );
    browser.waitForElementNotVisible('[data-testid="dialog-invite-floor-member"]', 10000);

    logout(browser);

    loginByForm(browser, inviteUser);
    closeSoundCautionIfVisible(browser);
    browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);
    browser.perform((done) => {
      const target = getInviteUrl(browser, 'floor');
      if (!target) {
        browser.assert.ok(false, 'フロアの招待URLがありません。');
        done();
        return;
      }
      browser.assert.ok(true, 'フロアの招待URLを取得しました。');
      navigateDirectToApp(browser, target);
      done();
    });
    waitForAppBootstrap(browser, 'フロアの招待URLを直接開いたときの初期化');
    browser.waitForElementVisible('.view', 10000);
    loginIfPresent(browser, inviteUser);
    waitForInviteCompletion(browser, expectedFloorPath, 'フロア');

    browser.end();
  },
};
