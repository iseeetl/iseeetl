const { runManagementFlowWithPreparedFloorRoom } = require('../../helpers/management-flow');
const { runDeleteRestoreScenario } = require('../../helpers/management-post-delete');

module.exports = {
  '投稿管理で投稿の論理削除と復元ができる': (browser) => {
    runManagementFlowWithPreparedFloorRoom(browser, 'Post Management Delete Toggle', (context) => {
      const stamp = String(Date.now()).slice(-6);
      const postText = `E2E Management Post Delete ${stamp}`;
      runDeleteRestoreScenario(browser, {
        ...context,
        type: 'post',
        postText,
        timelineText: postText,
      });
    });
  },
};
