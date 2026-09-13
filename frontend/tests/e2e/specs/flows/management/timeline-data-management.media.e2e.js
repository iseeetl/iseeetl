const { getBaseUrl, navigateToApp } = require('../../helpers/login');
const { runManagementFlowWithPreparedFloorRoom } = require('../../helpers/management-flow');
const { confirmTimelineDownload } = require('../../helpers/timeline-data-download');

const { prepareExportContent, installContentCapture, readCapturedDownload } = require('../../helpers/download-content');
const { readTestZip } = require('../../helpers/read-test-zip');

module.exports = {
  'タイムラインデータ管理でメディアをダウンロードできる': (browser) => {
    runManagementFlowWithPreparedFloorRoom(browser, 'Timeline Data Management Media', ({ floorId, roomId, floorTitle, roomTitle, finish }) => {
      let fixture;
      browser.perform(async () => { fixture = await prepareExportContent(browser, { floorId, roomId }, true); });
      const base = getBaseUrl(browser).replace(/\/$/, '');
      const floorButton = `[data-testid="timeline-floor-rooms-${floorId}"]`;
      const mediaButton = `[data-testid="timeline-media-${roomId}"]`;

      navigateToApp(browser, `${base}/management/timeline`)
        .waitForElementVisible('[data-testid="timeline-floor-list"]', 10000)
        .waitForElementVisible(floorButton, 10000)
        .click(floorButton)
        .waitForElementVisible('[data-testid="timeline-room-list"]', 10000)
        .assert.urlContains(`/management/timeline/floor/${floorId}`)
        .waitForElementVisible(mediaButton, 10000);

      installContentCapture(browser, '__timelineMediaDownloadSpy');
      confirmTimelineDownload(browser, mediaButton, '__timelineMediaDownloadSpy');
      readCapturedDownload(browser, '__timelineMediaDownloadSpy', (bytes, state) => {
        browser.assert.equal(state.filename, `${floorTitle}_${roomTitle}_media.zip`, 'ZIPファイル名が選択したルームを示しています。');
        const entries = readTestZip(bytes);
        const own = fixture.media[0];
        const foreign = fixture.media[1];
        browser.assert.deepEqual([...entries.keys()].sort(), [own.image_name, own.image_thumbnail_name].sort(), 'ZIPに選択したルームの画像とサムネイルだけが含まれています。');
        browser.assert.ok(!entries.has(foreign.image_name) && !entries.has(foreign.image_thumbnail_name), 'ZIPに別ルームのメディアが含まれていません。');
        for (const value of entries.values()) browser.assert.ok(value.length > 0 && (value.subarray(0, 3).equals(Buffer.from([255, 216, 255])) || value.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))), 'ZIP内の画像データを画像として読み取れます。');
      }, finish);
    });
  },
};
