const { prepareTimelineRoom } = require('../../helpers/timeline-helpers');
const { clickSingleVisibleAfterExactControls } = require('../../helpers/dialog-focus');

const readAnimationState = (browser, callback, targetText = '') => {
  browser.execute(
    function (expectedText) {
      const state = {
        hasStore: false,
        animationEnabled: true,
        eyeFriendlyMode: false,
        hasAnimationElement: false,
        activeOrComplete: false,
        animationText: '',
      };

      try {
        const raw = localStorage.getItem('iseeetl_store');
        if (raw) {
          const data = JSON.parse(raw);
          const setting = data && data.setting ? data.setting : {};
          const user = data && data.user ? data.user : {};
          state.hasStore = true;
          state.animationEnabled = setting.enableTextAnimation !== false;
          state.eyeFriendlyMode = !!user.eyeFriendlyMode;
        }
      } catch (_) {
        void _;
      }

      const animationEl = Array.from(document.querySelectorAll('.animation')).find(
        (element) => !expectedText || (element.textContent || '').includes(expectedText)
      );
      if (!animationEl) {
        return state;
      }
      state.hasAnimationElement = true;
      state.animationText = animationEl.textContent || '';

      const container = animationEl.closest('.timeline-content');
      if (container) {
        const rect = animationEl.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        if (rect.bottom > containerRect.bottom || rect.top < containerRect.top) {
          container.scrollTop = Math.max(animationEl.offsetTop - 80, 0);
        }
      }

      state.activeOrComplete =
        animationEl.classList.contains('animation-active') || animationEl.classList.contains('animation-complete');
      const postId = animationEl.getAttribute('data-post-id') || '';
      const toggle = postId
        ? document.querySelector(`[data-testid="timeline-animation-post-toggle-${postId}"]`)
        : null;
      state.toggleFound = !!toggle;
      return state;
    },
    [targetText],
    (result) => {
      callback(result && result.value ? result.value : {});
    }
  );
};

const waitForTargetAnimation = (browser, text, onReady, attempt = 0) => {
  const maxAttempts = 40;
  readAnimationState(
    browser,
    (state) => {
      if (state.hasAnimationElement) {
        browser.assert.ok(true, 'アニメーション検証用の専用投稿が表示されました。');
        onReady(state);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, '待機時間内にアニメーション検証用の専用投稿が表示されませんでした。');
        onReady(state);
        return;
      }
      browser.pause(250, () => waitForTargetAnimation(browser, text, onReady, attempt + 1));
    },
    text
  );
};

module.exports = {
  'タイムラインのアニメーション表示を確認する': (browser) => {
    const editorMail = process.env.E2E_FLOOR_EDITOR_MAIL || '';
    const editorPassword = process.env.E2E_FLOOR_EDITOR_PASSWORD || '';
    const userMail = process.env.E2E_USER_MAIL || '';
    const userPassword = process.env.E2E_USER_PASSWORD || '';

    if (!editorMail || !editorPassword || !userMail || !userPassword) {
      browser.assert.ok(false, 'タイムラインのアニメーションのテストをスキップします。認証情報が未設定です。');
      browser.end();
      return;
    }

    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Timeline Animation Floor ${stamp}`;
    const roomTitle = `E2E Timeline Animation Room ${stamp}`;
    const animationMarker = `E2E Timeline Animation Post ${stamp}`;
    const animationText = `${animationMarker} This deliberately long message crosses the timeline while the animation observer is verified without a separate pause and resume control.`;
    prepareTimelineRoom(browser, {
      editorMail,
      editorPassword,
      userMail,
      userPassword,
      floorTitle,
      roomTitle,
      targetLangs: [],
    });

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      browser.end();
    };

    browser
      .waitForElementVisible('[data-testid="timeline-nagasu-button"]', 10000)
      .click('[data-testid="timeline-nagasu-button"]')
      .waitForElementVisible('[data-testid="dialog-edit-post"]', 10000)
      .clearValue('#post_content')
      .setValue('#post_content', animationText);
    clickSingleVisibleAfterExactControls(browser, {
      anchorSelector: '#edit_post_dialog_title',
      submitSelector: '[data-testid="dialog-edit-post-submit"]',
      expectedControls: [{ selector: '#post_content', value: animationText }],
      label: 'タイムラインのアニメーション検証用の投稿',
    });
    browser.waitForElementNotVisible('[data-testid="dialog-edit-post"]', 10000);

    waitForTargetAnimation(browser, animationMarker, (state) => {
      if (!state.hasAnimationElement) {
        finish();
        return;
      }
      if (state.eyeFriendlyMode || !state.animationEnabled) {
        browser.assert.ok(
          false,
          `アニメーションの前提設定が無効でした: eyeFriendlyMode=${state.eyeFriendlyMode} animationEnabled=${state.animationEnabled}`
        );
        finish();
        return;
      }

      const waitForAnimation = (attempt) => {
        readAnimationState(browser, (nextState) => {
          if (nextState.activeOrComplete) {
            browser.assert.ok(true, 'アニメーションの監視が対象を検知し、アニメーションを開始しました。');
            browser.assert.ok(!nextState.toggleFound, 'アニメーションの一時停止・再開ボタンは表示されていません。');
            finish();
            return;
          }
          if (attempt >= 10) {
            browser.assert.ok(false, `アニメーションが開始しませんでした: ${JSON.stringify(nextState)}`);
            finish();
            return;
          }
          browser.pause(1000, () => waitForAnimation(attempt + 1));
        }, animationMarker);
      };
      waitForAnimation(0);
    });
  },
};
