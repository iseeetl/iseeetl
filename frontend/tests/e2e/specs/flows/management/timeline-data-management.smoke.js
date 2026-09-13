const { getBaseUrl, navigateToApp } = require('../../helpers/login');
const { runManagementFlowWithPreparedFloorRoom } = require('../../helpers/management-flow');
const { confirmTimelineDownload } = require('../../helpers/timeline-data-download');

const { prepareExportContent, installContentCapture, readCapturedDownload } = require('../../helpers/download-content');

module.exports = {
  'タイムラインデータ管理でフロアとルームを選びJSONを取得できる': (browser) => {
    runManagementFlowWithPreparedFloorRoom(browser, 'Timeline Data Management JSON', ({ floorId, roomId, floorTitle, roomTitle, finish }) => {
      let fixture;
      browser.perform(async () => { fixture = await prepareExportContent(browser, { floorId, roomId }, false); });
      const base = getBaseUrl(browser).replace(/\/$/, '');
      const floorButton = `[data-testid="timeline-floor-rooms-${floorId}"]`;
      const jsonButton = `[data-testid="timeline-json-${roomId}"]`;

      navigateToApp(browser, `${base}/management/timeline`)
        .waitForElementVisible('[data-testid="timeline-floor-list"]', 10000)
        .waitForElementVisible(floorButton, 10000)
        .click(floorButton)
        .waitForElementVisible('[data-testid="timeline-room-list"]', 10000)
        .assert.urlContains(`/management/timeline/floor/${floorId}`)
        .waitForElementVisible(jsonButton, 10000);

      installContentCapture(browser, '__timelineDownloadSpy');
      confirmTimelineDownload(browser, jsonButton, '__timelineDownloadSpy');
      readCapturedDownload(browser, '__timelineDownloadSpy', (bytes, state) => {
        browser.assert.equal(state.filename, `${floorTitle}_${roomTitle}_timeline.json`, 'JSONファイル名が選択したルームを示しています。');
        browser.assert.equal(state.type, 'application/json', 'ダウンロードしたJSONのメディアタイプが正しいです。');
        const posts = JSON.parse(bytes.toString('utf8'));
        browser.assert.equal(posts.length, 1, 'JSONに削除済みの投稿や別ルームの投稿が含まれていません。');
        browser.assert.ok(posts[0].content === fixture.content && posts[0].room._id === roomId && posts[0].floor._id === floorId, 'JSONに選択したルームの投稿とリソースIDが含まれています。');
        browser.assert.ok(!bytes.toString('utf8').includes(fixture.foreignContent), 'JSONに別ルームの内容が含まれていません。');
      }, finish);
    });
  },
};
