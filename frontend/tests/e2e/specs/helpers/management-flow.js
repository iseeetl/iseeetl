const { requireEnv } = require('./login');
const { prepareFloorRoom } = require('./timeline-helpers');
const { loginByForm } = require('./session-helpers');

const runManagementFlowWithPreparedFloorRoom = (browser, fixtureLabel, runFlow, options = {}) => {
  const adminMail = requireEnv('E2E_ADMIN_MAIL');
  const adminPassword = requireEnv('E2E_ADMIN_PASSWORD');
  const editorMail = requireEnv('E2E_FLOOR_EDITOR_MAIL');
  const editorPassword = requireEnv('E2E_FLOOR_EDITOR_PASSWORD');
  const stamp = String(Date.now()).slice(-6);
  const floorTitle = options.floorTitle || `E2E ${fixtureLabel} Floor ${stamp}`;
  const roomTitle = options.roomTitle || `E2E ${fixtureLabel} Room ${stamp}`;
  const state = prepareFloorRoom(browser, {
    editorMail,
    editorPassword,
    floorTitle,
    roomTitle,
    logoutAfter: true,
  });

  let finished = false;
  const finish = () => {
    if (finished) {
      return;
    }
    finished = true;
    browser.end();
  };

  browser.perform(() => {
    if (!state.floorId || !state.roomId) {
      browser.assert.ok(false, 'テスト用のフロアIDまたはルームIDを取得できませんでした。');
      finish();
      return;
    }

    loginByForm(browser, { mail: adminMail, password: adminPassword });

    runFlow({
      floorId: state.floorId,
      roomId: state.roomId,
      floorTitle,
      roomTitle,
      finish,
    });
  });
};

module.exports = {
  runManagementFlowWithPreparedFloorRoom,
};
