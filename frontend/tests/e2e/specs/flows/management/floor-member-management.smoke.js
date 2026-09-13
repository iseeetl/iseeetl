const { runMembershipManagementSmoke } = require('../../helpers/membership-management-smoke');

module.exports = {
  'フロアメンバー管理で削除確認ダイアログを表示する': (browser) => {
    runMembershipManagementSmoke(browser, {
      fixtureLabel: 'Floor Member Management Smoke',
      container: 'floor',
      managementPath: '/management/floormember',
      dialogSelector: '[role="dialog"][aria-labelledby="floor-member-management-delete-dialog-title"]',
    });
  },
};
