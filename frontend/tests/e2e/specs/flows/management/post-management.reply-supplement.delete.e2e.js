const { runManagementFlowWithPreparedFloorRoom } = require('../../helpers/management-flow');
const { runDeleteRestoreScenario } = require('../../helpers/management-post-delete');

const runChildScenario = (browser, context, type) => {
  const stamp = String(Date.now()).slice(-6);
  const label = type === 'reply' ? 'Reply' : 'Supplement';
  const postText = `E2E Management ${label} Parent ${stamp}`;
  const childText = `E2E Management ${label} ${stamp}`;
  runDeleteRestoreScenario(browser, {
    ...context,
    type,
    postText,
    childText,
    timelineText: childText,
  });
};

module.exports = {
  '投稿管理で返信の論理削除と復元ができる': (browser) => {
    runManagementFlowWithPreparedFloorRoom(browser, 'PostManagementReplyDelete', (context) => {
      runChildScenario(browser, context, 'reply');
    });
  },

  '投稿管理で付加情報の論理削除と復元ができる': (browser) => {
    runManagementFlowWithPreparedFloorRoom(browser, 'PostManagementSupplementDelete', (context) => {
      runChildScenario(browser, context, 'supplement');
    });
  },
};
