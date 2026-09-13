const {
  prepareTimelineRoom,
  submitPost,
  waitForPostVisibleByText,
  resolvePostId,
  openPostDetail,
  waitForFocusPost,
} = require('../../helpers/timeline-helpers');

module.exports = {
  '投稿詳細のURLを開くと対象の投稿へ移動する': (browser) => {
    const editorMail = process.env.E2E_FLOOR_EDITOR_MAIL || '';
    const editorPassword = process.env.E2E_FLOOR_EDITOR_PASSWORD || '';
    const userMail = process.env.E2E_USER_MAIL || '';
    const userPassword = process.env.E2E_USER_PASSWORD || '';

    if (!editorMail || !editorPassword || !userMail || !userPassword) {
      browser.assert.ok(false, 'タイムラインの投稿詳細のテストをスキップします。認証情報が未設定です。');
      browser.end();
      return;
    }

    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Timeline Detail Floor ${stamp}`;
    const roomTitle = `E2E Timeline Detail Room ${stamp}`;
    const postText = `E2E Post Detail ${stamp}`;

    const state = prepareTimelineRoom(browser, {
      editorMail,
      editorPassword,
      userMail,
      userPassword,
      floorTitle,
      roomTitle,
    });

    submitPost(browser, postText);
    waitForPostVisibleByText(browser, postText, '投稿');

    resolvePostId(browser, postText, (result) => {
      if (!result.found || !result.postId) {
        browser.assert.ok(false, `投稿IDを取得できませんでした: ${JSON.stringify(result)}`);
        browser.end();
        return;
      }
      const detailPath = openPostDetail(browser, state.floorId, state.roomId, result.postId);
      waitForFocusPost(browser, result.postId, detailPath);

      browser.end();
    });
  },
};
