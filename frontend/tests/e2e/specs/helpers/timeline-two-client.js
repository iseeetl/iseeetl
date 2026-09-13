const {
  disconnectTimeline,
  readTimelineSummary,
  waitForTimelineReady,
  startTimelineProbe,
  readTimelineProbe,
  stopTimelineProbe,
} = require('./e2e-public-contract');

const POST_WAIT_MS = 15000;
let postCreateProbeId = '';

const buildPostXpath = (text) =>
  `//article[./div[contains(concat(" ", normalize-space(@class), " "), " post ")]]` +
  `[.//div[contains(@class,"text") and contains(., "${text}")]]`;

const countPostText = (browser, text, callback) => {
  browser.execute(
    function (targetText) {
      const articles = Array.from(document.querySelectorAll('article'));
      const count = articles.filter((article) => {
        const postRoot = Array.from(article.children).find(
          (child) => child.classList && child.classList.contains('post')
        );
        if (!postRoot) return false;
        const textNode = postRoot.querySelector('.container > .text') || postRoot.querySelector('.text');
        return !!textNode && textNode.textContent.trim() === targetText;
      }).length;
      return { count };
    },
    [text],
    (result) => {
      const count = result && result.value ? Number(result.value.count) : -1;
      callback(count);
    }
  );
};

const waitForPostCount = (browser, text, expected, label) => {
  const xpath = buildPostXpath(text);
  browser.useXpath();
  if (expected === 0) {
    browser.waitForElementNotPresent(xpath, POST_WAIT_MS);
  } else {
    browser.waitForElementVisible(xpath, POST_WAIT_MS);
  }
  browser.useCss();
  countPostText(browser, text, (count) => {
    browser.assert.equal(count, expected, `${label}: 一致する投稿数は${expected}件です。`);
  });
};

const disconnectTimelineSocket = (browser) => {
  disconnectTimeline(browser);
  browser.waitForElementNotPresent('[data-testid="timeline-connected"]', 10000);
};

const armPostCreateProbe = (browser, _text, label) => {
  if (postCreateProbeId) stopTimelineProbe(browser, postCreateProbeId);
  startTimelineProbe(browser, 'post-created', (id) => {
    postCreateProbeId = id;
    browser.assert.ok(Boolean(id), `${label}: POST_CREATEの監視を準備しました。`);
  });
};

const waitForPostCreateProbe = (browser, label, attempt = 0) => {
  const maxAttempts = 60;
  readTimelineProbe(browser, postCreateProbeId, (state) => {
      if (state && state.found && state.eventCount > 0) {
        browser.assert.ok(true, `${label}: POST_CREATEを受信しました。`);
        stopTimelineProbe(browser, postCreateProbeId);
        postCreateProbeId = '';
        return;
      }
      if (attempt >= maxAttempts) {
        stopTimelineProbe(browser, postCreateProbeId);
        postCreateProbeId = '';
        browser.assert.ok(
          false,
          `${label}: POST_CREATEを受信しませんでした（probe=${Boolean(state && state.found)}, connected=${Boolean(
            state && state.connected
          )}）。`
        );
        return;
      }
      browser.pause(250, () => waitForPostCreateProbe(browser, label, attempt + 1));
  });
};

const captureTimelineSocketState = (browser, label, onReady = () => {}) => {
  waitForTimelineReady(browser, { requireRoomReady: true }, (_ready, summary) => {
      const state = {
        found: Boolean(summary && summary.mounted),
        connected: Boolean(summary && summary.connected),
        socketId: summary && summary.connectionId ? summary.connectionId : '',
        roomStatusReady: Boolean(summary && summary.roomReady),
        roomSize: summary ? Number(summary.roomMemberCount || 0) : 0,
      };
      browser.assert.ok(state.found, label + ': タイムラインが表示されています。');
      browser.assert.ok(state.connected, label + ': Socketが接続されています。');
      browser.assert.ok(!!state.socketId, label + ': Socket IDがあります。');
      browser.assert.ok(state.roomStatusReady, label + ': ROOM_STATUS_UPDATEを受信しました。');
      onReady(state);
  });
};

const waitForTimelineRoomJoined = (browser, label = 'タイムラインのクライアント', attempt = 0) => {
  const maxAttempts = 80;
  readTimelineSummary(browser, (summary) => {
      const state = summary || { mounted: false, connected: false, roomReady: false };
      if (state.mounted && state.connected && state.roomReady) {
        browser.assert.ok(true, `${label}がタイムラインのルームに参加しました。`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(
          false,
          `${label}がタイムラインのルームに参加しませんでした ` +
            `(mounted=${state.mounted}, connected=${state.connected}, roomReady=${state.roomReady}).`
        );
        return;
      }
      browser.pause(250, () => waitForTimelineRoomJoined(browser, label, attempt + 1));
  });
};

const reconnectTimelineSocket = (browser) => {
  browser
    .waitForElementVisible('[data-testid="timeline-socket-status"] .socket-status__button', 20000)
    .click('[data-testid="timeline-socket-status"] .socket-status__button')
    .waitForElementPresent('[data-testid="timeline-connected"]', 20000)
    .waitForElementNotPresent('[data-testid="timeline-socket-status"]', 20000);
  waitForTimelineRoomJoined(browser, '再接続後の監視クライアント');
};

module.exports = {
  waitForPostCount,
  disconnectTimelineSocket,
  reconnectTimelineSocket,
  armPostCreateProbe,
  waitForPostCreateProbe,
  captureTimelineSocketState,
};
