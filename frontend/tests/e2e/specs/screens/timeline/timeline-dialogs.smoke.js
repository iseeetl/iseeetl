const { prepareTimelineRoom } = require('../../helpers/timeline-helpers');
const { findOptionalElement } = require('../../helpers/login');
const { clickSingleVisible, clickSingleVisibleAfterExactControls } = require('../../helpers/dialog-focus');

const collectTimelineDiagnostics = (browser, callback) => {
  browser.execute(
    function () {
      const readStore = () => {
        try {
          const raw = localStorage.getItem('iseeetl_store');
          if (!raw) return { hasStore: false };
          const data = JSON.parse(raw);
          const user = data && data.user ? data.user : {};
          const room = data && data.room ? data.room : {};
          const floor = data && data.floor ? data.floor : {};
          const error = data && data.error ? data.error : {};
          return {
            hasStore: true,
            isLogin: !!user.isLogin,
            hasToken: !!user.token,
            hasGuestId: !!user.guestId,
            lang: user.lang || null,
            roomId: room.id || null,
            floorId: floor.id || null,
            errorMessage: error.message || null,
          };
        } catch (err) {
          return { hasStore: false, parseError: true };
        }
      };
      return {
        url: window.location.href,
        readyState: document.readyState,
        connected: !!document.querySelector('[data-testid="timeline-connected"]'),
        columnCount: document.querySelectorAll('.timeline-inner').length,
        postButtonCount: document.querySelectorAll('[data-testid="timeline-post-button"]').length,
        speechButtonCount: document.querySelectorAll('[data-testid="timeline-speech-toggle-button"]').length,
        store: readStore(),
      };
    },
    [],
    (execResult) => {
      const timelineState = execResult && execResult.value ? execResult.value : {};
      callback(timelineState);
    }
  );
};

const waitForTimelineReady = (browser) => {
  browser.waitForElementPresent('[data-testid="timeline-connected"]', 60000, false, (result) => {
    if (typeof result.status === 'number' && result.status !== 0) {
      collectTimelineDiagnostics(browser, (timelineState) => {
        browser.assert.ok(false, `タイムラインを操作できません: ${JSON.stringify(timelineState)}`);
      });
    }
  });
};

const waitForDialogToClose = (browser, dialogSelector) => {
  browser.waitForElementNotVisible(dialogSelector, 10000, false, (result) => {
    if (typeof result.status === 'number' && result.status !== 0) {
      browser.waitForElementNotVisible(dialogSelector, 10000);
    }
  });
};

const closeDialogWithEsc = (browser, dialogSelector) => {
  browser.keys(browser.Keys.ESCAPE);
  waitForDialogToClose(browser, dialogSelector);
};

const clickFirstVisible = clickSingleVisible;

const openDialog = (browser, triggerSelector, dialogSelector) => {
  browser
    .useCss()
    .waitForElementVisible(triggerSelector, 10000)
    .perform((done) => {
      clickFirstVisible(browser, triggerSelector, '開く');
      done();
    })
    .waitForElementVisible(dialogSelector, 10000, false, (result) => {
      if (typeof result.status === 'number' && result.status !== 0) {
        clickFirstVisible(browser, triggerSelector, '再試行');
        browser.waitForElementVisible(dialogSelector, 10000);
      }
    });
  closeDialogWithEsc(browser, dialogSelector);
};

const openDialogWithCloseButton = (browser, triggerSelector, dialogSelector, closeSelector) => {
  browser
    .useCss()
    .waitForElementVisible(triggerSelector, 10000)
    .perform((done) => {
      clickFirstVisible(browser, triggerSelector, '開く');
      done();
    })
    .waitForElementVisible(dialogSelector, 10000)
    .waitForElementVisible(closeSelector, 10000)
    .perform((done) => {
      clickFirstVisible(browser, closeSelector, '閉じる');
      done();
    });
  waitForDialogToClose(browser, dialogSelector);
};

const openDialogIfExists = (browser, triggerSelector, dialogSelector) => {
  findOptionalElement(browser, triggerSelector, (result) => {
    if (result.status === 0) {
      openDialog(browser, triggerSelector, dialogSelector);
    }
  });
};

const closeSoundCautionIfVisible = (browser) => {
  browser.execute(
    function () {
      const dialog = document.querySelector('[data-testid="dialog-sound-caution"]');
      return Boolean(dialog && dialog.getClientRects().length);
    },
    [],
    (result) => {
      if (result && result.value) {
        clickSingleVisibleAfterExactControls(browser, {
          anchorSelector: '#sound_caution_confirm_title',
          submitSelector: '[data-testid="dialog-sound-caution-confirm"]',
          expectedControls: [],
          label: '音声に関する注意を確認',
        });
        browser.waitForElementNotVisible('[data-testid="dialog-sound-caution"]', 10000);
      }
    }
  );
};

const openSpeechDialog = (browser) => {
  waitForTimelineReady(browser);
  openDialogWithCloseButton(
    browser,
    '[data-testid="timeline-speech-toggle-button"]',
    '[data-testid="dialog-speech"]',
    '[data-testid="dialog-speech-cancel-desktop"]'
  );
};

module.exports = {
  'タイムラインのダイアログを表示する': (browser) => {
    const editorMail = process.env.E2E_FLOOR_EDITOR_MAIL || '';
    const editorPassword = process.env.E2E_FLOOR_EDITOR_PASSWORD || '';
    const userMail = process.env.E2E_USER_MAIL || '';
    const userPassword = process.env.E2E_USER_PASSWORD || '';

    if (!editorMail || !editorPassword || !userMail || !userPassword) {
      browser.assert.ok(false, 'タイムラインのダイアログの基本動作テストをスキップします。認証情報が未設定です。');
      browser.end();
      return;
    }

    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Timeline Dialog Smoke Floor ${stamp}`;
    const roomTitle = `E2E Timeline Dialog Smoke Room ${stamp}`;
    prepareTimelineRoom(browser, {
      editorMail,
      editorPassword,
      userMail,
      userPassword,
      floorTitle,
      roomTitle,
    });

    closeSoundCautionIfVisible(browser);
    waitForTimelineReady(browser);

    openDialogWithCloseButton(
      browser,
      '[data-testid="timeline-room-info-button"]',
      '[data-testid="dialog-room-info"]',
      '[data-testid="dialog-room-info-close"]'
    );
    openDialogWithCloseButton(
      browser,
      '[data-testid="timeline-sound-tag-button"]',
      '[data-testid="dialog-sound-tag"]',
      '[data-testid="dialog-sound-tag-cancel-desktop"]'
    );
    closeSoundCautionIfVisible(browser);
    openDialogWithCloseButton(
      browser,
      '[data-testid="timeline-filter-button"]',
      '[data-testid="dialog-filter"]',
      '[data-testid="dialog-filter-cancel-desktop"]'
    );
    openDialogWithCloseButton(
      browser,
      '[data-testid="timeline-setting-button"]',
      '[data-testid="dialog-timeline-setting"]',
      '[data-testid="dialog-timeline-setting-cancel-desktop"]'
    );

    openSpeechDialog(browser);

    browser
      .waitForElementNotPresent('[data-testid="timeline-invite-member-button"]', 5000)
      .waitForElementNotPresent('[data-testid="timeline-room-member-button"]', 5000);
    openDialogIfExists(
      browser,
      '[data-testid="timeline-leave-room-button"]',
      '[data-testid="dialog-leave-room-member"]'
    );

    browser.end();
  },
};
