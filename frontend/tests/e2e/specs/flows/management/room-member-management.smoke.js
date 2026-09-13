const { runMembershipManagementSmoke } = require('../../helpers/membership-management-smoke');

module.exports = {
  'ルームメンバー管理で削除確認ダイアログを表示する': (browser) => {
    runMembershipManagementSmoke(browser, {
      fixtureLabel: 'Room Member Management Smoke',
      container: 'room',
      managementPath: '/management/roommember',
      dialogSelector: '[role="dialog"][aria-labelledby="room-member-management-delete-dialog-title"]',
    });
  },
};
