// 対象行を一意に特定できるよう、隔離DBに製品APIでテスト専用の行を作成する。
const {
  buildManagementRowScenario,
  loginAsAdmin,
  prepareManagementRowFixtures,
  runManagementRowKeyboardCases,
} = require('../../helpers/management-row-keyboard');

module.exports = {
  '管理一覧の行をTab・Enter・Spaceキーで操作できる': (browser) => {
    const scenario = buildManagementRowScenario();
    loginAsAdmin(browser);
    prepareManagementRowFixtures(browser, scenario.fixture);
    runManagementRowKeyboardCases(browser, scenario.cases);
    browser.end();
  },
};
