const { prepareFloorRoom } = require('../../helpers/timeline-helpers');
const { findOptionalElement, loginToTimeline } = require('../../helpers/login');
const { createScopedTagByApiActor } = require('../../helpers/management-tag-fixture');
const { clickSingleVisibleAfterExactControls } = require('../../helpers/dialog-focus');

const DIALOG_CLOSE_TIMEOUT_MS = 15000;

const ensurePostTagSelectorExpanded = (browser) => {
  browser.execute(
    function () {
      const title = document.querySelector('#edit_post_dialog_title');
      const dialog = title ? title.closest('[role="dialog"]') : null;
      const isVisible = (element) =>
        !!element && !!(element.offsetParent || element.getClientRects().length);
      const toggles = dialog
        ? Array.from(dialog.querySelectorAll('[data-testid="dialog-edit-post-tags-toggle"]')).filter(
            (toggle) =>
              isVisible(toggle) &&
              !toggle.disabled &&
              toggle.getAttribute('aria-disabled') !== 'true'
          )
        : [];
      if (toggles.length !== 1) {
        return { ready: false, reason: `toggle-count:${toggles.length}` };
      }
      const toggle = toggles[0];
      const wasExpanded = toggle.getAttribute('aria-expanded') === 'true';
      if (!wasExpanded) toggle.click();
      return { ready: true, reason: '', wasExpanded };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { ready: false, reason: 'execute-failed' };
      browser.assert.ok(
        state.ready === true,
        state.ready
          ? `投稿のタグ選択欄の状態が${state.wasExpanded ? '展開済み' : '展開済み'}です。`
          : `投稿のタグ選択欄を展開できませんでした（${state.reason}）。`
      );
    }
  );
};

const submitExactContentDialog = (
  browser,
  { anchorSelector, submitSelector, inputSelector, expectedValue, label, expectedControls = [] }
) => {
  clickSingleVisibleAfterExactControls(browser, {
    anchorSelector,
    submitSelector,
    expectedControls: [{ selector: inputSelector, value: expectedValue }, ...expectedControls],
    label,
  });
};

const resolveUniqueTagCheckboxByName = (
  browser,
  { anchorSelector, checkboxTestIdPrefix, expectedName, label },
  onResolved
) => {
  browser.execute(
    function (payload) {
      const isVisible = (element) =>
        !!element && !!(element.offsetParent || element.getClientRects().length);
      const anchors = Array.from(document.querySelectorAll(payload.anchorSelector));
      if (anchors.length !== 1) return { ok: false, reason: `anchor-count:${anchors.length}` };
      const dialog = anchors[0].closest('[role="dialog"]');
      if (!dialog || !isVisible(dialog)) return { ok: false, reason: 'dialog-not-visible' };

      const matches = Array.from(dialog.querySelectorAll('.checkbox-group')).filter((group) => {
        const checkbox = group.querySelector(
          `input[type="checkbox"][data-testid^="${payload.checkboxTestIdPrefix}"]`
        );
        const tagLabel = group.querySelector('label');
        return (
          isVisible(group) &&
          isVisible(checkbox) &&
          tagLabel &&
          String(tagLabel.textContent || '').trim() === payload.expectedName
        );
      });
      if (matches.length !== 1) {
        return { ok: false, reason: `name-match-count:${matches.length}` };
      }

      const group = matches[0];
      const checkboxes = Array.from(
        group.querySelectorAll(`input[type="checkbox"][data-testid^="${payload.checkboxTestIdPrefix}"]`)
      ).filter(isVisible);
      if (checkboxes.length !== 1) {
        return { ok: false, reason: `checkbox-count:${checkboxes.length}` };
      }
      const checkbox = checkboxes[0];
      const tagLabel = group.querySelector('label');
      const tagId = String(checkbox.dataset.tagId || '');
      const exactTestId = `${payload.checkboxTestIdPrefix}${tagId}`;
      const ok =
        !!tagId &&
        checkbox.getAttribute('data-testid') === exactTestId &&
        String(checkbox.value || '') === tagId &&
        tagLabel &&
        tagLabel.htmlFor === checkbox.id &&
        !checkbox.disabled &&
        checkbox.getAttribute('aria-disabled') !== 'true';
      return {
        ok,
        reason: ok ? '' : 'id-name-contract-mismatch',
        tagId,
        checked: !!checkbox.checked,
      };
    },
    [{ anchorSelector, checkboxTestIdPrefix, expectedName }],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, reason: 'execute-failed' };
      browser.assert.ok(
        state.ok === true,
        `${label}: タグ名に完全一致するIDと値のチェックボックスが1件必要です（${state.reason || 'unknown'}）。`
      );
      onResolved(state.ok ? state : null);
    }
  );
};

const collectDialogDiagnostics = (browser, dialogSelector, callback) => {
  browser.execute(
    function (selector) {
      const getText = (node) => (node ? node.textContent.trim() : '');
      const dialog = document.querySelector(selector);
      const isVisible = dialog ? !!(dialog.offsetParent || dialog.getClientRects().length) : false;
      const submitButton = dialog ? dialog.querySelector('[data-testid$="-submit"]') : null;
      const errors = Array.from(document.querySelectorAll('[role="alert"]'))
        .map((node) => node.textContent.trim())
        .filter(Boolean);
      let storeError = null;
      try {
        const raw = localStorage.getItem('iseeetl_store');
        if (raw) {
          const data = JSON.parse(raw);
          storeError = data && data.error ? data.error.message || null : null;
        }
      } catch (err) {
        storeError = null;
      }
      return {
        url: window.location.href,
        dialogVisible: isVisible,
        dialogText: dialog ? dialog.textContent.trim().slice(0, 160) : '',
        submitTestId: submitButton ? submitButton.getAttribute('data-testid') : null,
        submitDisabled: submitButton ? submitButton.hasAttribute('disabled') : null,
        alertText: getText(document.querySelector('.screen-reader-only[role="alert"]')),
        snackbarText: getText(document.querySelector('[data-testid="app-snackbar"] span')),
        formErrors: errors,
        storeError,
      };
    },
    [dialogSelector],
    (result) => {
      const diagnostics = result && result.value ? result.value : {};
      callback(diagnostics);
    }
  );
};

const reportDialogFailure = (browser, label, diagnostics) => {
  const suffix = label ? ` (${label})` : '';
  browser.assert.ok(false, `ダイアログが閉じませんでした${suffix}: ${JSON.stringify(diagnostics)}`);
};

const waitForDialogToClose = (browser, dialogSelector, label) => {
  browser.useCss().waitForElementNotVisible(dialogSelector, DIALOG_CLOSE_TIMEOUT_MS, false, (result) => {
    if (typeof result.status === 'number' && result.status !== 0) {
      browser.waitForElementNotVisible(dialogSelector, DIALOG_CLOSE_TIMEOUT_MS, false);
    }
  });
  collectDialogDiagnostics(browser, dialogSelector, (diagnostics) => {
    if (diagnostics.dialogVisible) {
      reportDialogFailure(browser, label, diagnostics);
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

const waitForTimelineReady = (browser) => {
  browser.waitForElementPresent('[data-testid="timeline-connected"]', 20000);
};

const installAudioSpeechHooks = (browser) => {
  browser.execute(
    function () {
      window.__testAudioPlayCount = 0;
      window.__testNotificationAudioPlayCount = 0;
      window.__testNotificationAudioElement = null;
      window.__testNotificationAudioElementMismatch = false;
      window.__testSpeechCount = 0;

      const origPlay = HTMLMediaElement && HTMLMediaElement.prototype && HTMLMediaElement.prototype.play;
      if (origPlay) {
        HTMLMediaElement.prototype.play = function () {
          window.__testAudioPlayCount += 1;
          if (this.matches('[data-testid="timeline-notification-audio"]')) {
            window.__testNotificationAudioPlayCount += 1;
            if (
              window.__testNotificationAudioElement &&
              window.__testNotificationAudioElement !== this
            ) {
              window.__testNotificationAudioElementMismatch = true;
            }
          }
          return Promise.resolve();
        };
      }

      const speechHookInstalled =
        !!window.speechSynthesis && typeof window.speechSynthesis.speak === 'function';
      if (speechHookInstalled) {
        window.speechSynthesis.speak = function (utterance) {
          window.__testSpeechCount += 1;
          window.__lastSpeechText = utterance ? utterance.text : '';
        };
      }
      return { audioHookInstalled: !!origPlay, speechHookInstalled };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : {};
      browser.assert.ok(
        state.audioHookInstalled === true && state.speechHookInstalled === true,
        '音声再生と読み上げの監視を設定しました。'
      );
    }
  );
};

const openPostDialogWhenInteractive = (browser, attempt = 0) => {
  const maxAttempts = 40;
  browser.execute(
    function () {
      const isVisible = (node) => !!(node && (node.offsetParent || node.getClientRects().length));
      const app = document.querySelector('#app_container');
      const dialog = document.querySelector('[data-testid="dialog-edit-post"]');
      const button = document.querySelector('[data-testid="timeline-post-button"]');
      const state = {
        appInert: !!(app && app.inert),
        buttonFound: !!button,
        buttonVisible: isVisible(button),
        dialogVisible: isVisible(dialog),
      };
      if (!state.dialogVisible && state.buttonVisible && !state.appInert) button.click();
      return state;
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : {};
      if (state.dialogVisible) {
        browser.assert.ok(true, '読み上げ切り替え後に投稿ダイアログが開きました。');
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `読み上げ切り替え後に投稿ダイアログが開きませんでした: ${JSON.stringify(state)}`);
        return;
      }
      browser.pause(250, () => openPostDialogWhenInteractive(browser, attempt + 1));
    }
  );
};

const disableSpeechWhenInteractive = (browser, toggleState, attempt = 0) => {
  const maxAttempts = 40;
  const shouldClick = !!toggleState.activeLabel && !toggleState.clicked;
  browser.execute(
    function (clickWhenInteractive) {
      const button = document.querySelector('[data-testid="timeline-speech-toggle-button"]');
      const app = document.querySelector('#app_container');
      const state = {
        appInert: !!(app && app.inert),
        buttonFound: !!button,
        buttonVisible: !!(button && (button.offsetParent || button.getClientRects().length)),
        clicked: false,
        label: button ? button.getAttribute('aria-label') || '' : '',
      };
      if (clickWhenInteractive && state.buttonVisible && !state.appInert) {
        button.click();
        state.clicked = true;
      }
      return state;
    },
    [shouldClick],
    (result) => {
      const state = result && result.value ? result.value : {};
      if (!toggleState.activeLabel && state.label) {
        toggleState.activeLabel = state.label;
      } else if (toggleState.activeLabel && state.label && state.label !== toggleState.activeLabel) {
        browser.assert.ok(true, '読み上げを無効に切り替えました。');
        return;
      }
      if (state.clicked) toggleState.clicked = true;

      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `読み上げが無効になりませんでした: ${JSON.stringify(state)}`);
        return;
      }
      browser.pause(250, () => disableSpeechWhenInteractive(browser, toggleState, attempt + 1));
    }
  );
};

module.exports = {
  'タイムラインの音声再生と読み上げを確認する': (browser) => {
    const editorMail = process.env.E2E_FLOOR_EDITOR_MAIL || '';
    const editorPassword = process.env.E2E_FLOOR_EDITOR_PASSWORD || '';
    const userMail = process.env.E2E_USER_MAIL || '';
    const userPassword = process.env.E2E_USER_PASSWORD || '';

    if (!editorMail || !editorPassword || !userMail || !userPassword) {
      browser.assert.ok(false, 'タイムラインの音声再生・読み上げのテストをスキップします。認証情報が未設定です。');
      browser.end();
      return;
    }

    const stamp = Date.now();
    const soundPostText = `E2E Sound ${stamp}`;
    const speechPostText = `E2E Speak ${stamp}`;
    const speechPostText2 = `E2E Speak Off ${stamp}`;
    const replyText = `E2E Speak Reply ${stamp}`;
    const supplementText = `E2E Speak Supplement ${stamp}`;
    const floorTitle = `E2E Timeline Audio Floor ${stamp}`;
    const roomTitle = `E2E Timeline Audio Room ${stamp}`;
    const roomTagName = `E2E Timeline Audio Tag ${stamp}`;

    const soundPostXpath = `//article[.//div[contains(@class,'text') and contains(., "${soundPostText}")]]`;
    const speechPostXpath = `//article[.//div[contains(@class,'text') and contains(., "${speechPostText}")]]`;
    const replyXpath = `//article[contains(@class,'wrapper')][.//div[contains(@class,'text') and contains(., "${replyText}")]]`;
    const supplementXpath =
      "//article[contains(@class,'supplement')][.//div[contains(@class,'supplement-content') and contains(., '" +
      supplementText +
      "')]]";

    let selectedTagId = null;
    let speechCount = 0;
    const preparedState = prepareFloorRoom(browser, {
      editorMail,
      editorPassword,
      floorTitle,
      roomTitle,
      logoutAfter: true,
    });
    browser.perform((done) => {
      if (!preparedState.floorId || !preparedState.roomId) {
        browser.assert.ok(false, '専用タグに必要なタイムラインの音声テスト用のフロアIDまたはルームIDを取得できませんでした。');
        done();
        return;
      }
      createScopedTagByApiActor(
        browser,
        {
          actorMail: editorMail,
          actorPassword: editorPassword,
          scope: 'room',
          scopeId: preparedState.roomId,
          name: roomTagName,
          order: 91,
        },
        'タイムラインの音声検証専用のルームタグ'
      );
      loginToTimeline(browser, {
        mail: userMail,
        password: userPassword,
        floorId: preparedState.floorId,
        roomId: preparedState.roomId,
      });
      done();
    });
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      browser.end();
    };

    const runSpeechFlow = () => {
      closeSoundCautionIfVisible(browser);
      browser.execute(
        function () {
          const audioElements = Array.from(
            document.querySelectorAll('[data-testid="timeline-notification-audio"]')
          );
          const confirmationPlayCount = window.__testNotificationAudioPlayCount || 0;
          window.__testNotificationAudioElement = audioElements[0] || null;
          window.__testNotificationAudioElementMismatch = false;
          window.__testNotificationAudioPlayCount = 0;
          return {
            audioElementCount: audioElements.length,
            silenceAudioCount: document.querySelectorAll('#silence_audio').length,
            confirmationPlayCount,
          };
        },
        [],
        (result) => {
          const state = result && result.value ? result.value : {};
          browser.assert.equal(
            state.audioElementCount,
            1,
            'タイムラインに通知用のaudio要素が1件だけあります。'
          );
          browser.assert.equal(state.silenceAudioCount, 0, '旧方式の無音再生用iframeがありません。');
          browser.assert.ok(
            state.confirmationPlayCount > 0,
            '音声の確認操作でタイムラインの通知用audio要素が再生されます。'
          );
        }
      );

      browser
        .waitForElementVisible('[data-testid="timeline-post-button"]', 10000)
        .click('[data-testid="timeline-post-button"]')
        .waitForElementVisible('[data-testid="dialog-edit-post"]', 10000);
      ensurePostTagSelectorExpanded(browser);
      const postTagCheckbox = `[data-testid="tag-selector-checkbox-${selectedTagId}"]`;
      const postTagLabel = `${postTagCheckbox} + label`;
      browser.waitForElementVisible(postTagCheckbox, 10000);
      clickSingleVisibleAfterExactControls(browser, {
        anchorSelector: '#edit_post_dialog_title',
        submitSelector: postTagCheckbox,
        expectedControls: [
          { selector: postTagCheckbox, property: 'checked', value: false },
          { selector: postTagCheckbox, property: 'value', value: selectedTagId },
          { selector: postTagLabel, property: 'textContent', value: roomTagName },
        ],
        label: '専用の投稿タグを選択',
      });
      browser.clearValue('#post_content').setValue('#post_content', soundPostText);
      submitExactContentDialog(browser, {
        anchorSelector: '#edit_post_dialog_title',
        submitSelector: '[data-testid="dialog-edit-post-submit"]',
        inputSelector: '#post_content',
        expectedValue: soundPostText,
        label: '音を鳴らすタグ付きの投稿',
        expectedControls: [
          { selector: postTagCheckbox, property: 'checked', value: true },
          { selector: postTagCheckbox, property: 'value', value: selectedTagId },
          { selector: postTagLabel, property: 'textContent', value: roomTagName },
        ],
      });
      waitForDialogToClose(browser, '[data-testid="dialog-edit-post"]', '音を鳴らすタグ付きの投稿');

      browser
        .useXpath()
        .waitForElementVisible(soundPostXpath, 10000)
        .useCss()
        .pause(500)
        .execute(
          function () {
            return {
              count: window.__testNotificationAudioPlayCount || 0,
              elementMismatch: !!window.__testNotificationAudioElementMismatch,
            };
          },
          [],
          function (res) {
            const state = res && res.value ? res.value : {};
            browser.assert.ok(state.count > 0, '確認後に音を鳴らすタグで音声を再生する');
            browser.assert.equal(
              state.elementMismatch,
              false,
              '確認操作とSocket通知で同じaudio要素を使用する'
            );
          }
        );

      browser.waitForElementVisible('[data-testid="timeline-speech-toggle-button"]', 10000);
      browser.execute(
        function () {
          const button = document.querySelector('[data-testid="timeline-speech-toggle-button"]');
          if (!button) return { clicked: false };
          button.click();
          return { clicked: true };
        },
        [],
        (result) => {
          const clicked = !!(result && result.value && result.value.clicked);
          browser.assert.ok(clicked, '読み上げの切り替えをクリックしました。');
        }
      );
      browser.waitForElementVisible('[data-testid="dialog-speech"]', 10000);
      clickSingleVisibleAfterExactControls(browser, {
        anchorSelector: '#speech_dialog_title',
        submitSelector: '[data-testid="dialog-speech-start"]',
        expectedControls: [],
        label: '読み上げを開始',
      });
      waitForDialogToClose(browser, '[data-testid="dialog-speech"]', '読み上げを開始');

      browser.execute(
        function () {
          return window.__testSpeechCount || 0;
        },
        [],
        function (res) {
          speechCount = res.value || 0;
        }
      );

      browser.waitForElementVisible('[data-testid="timeline-post-button"]', 10000);
      openPostDialogWhenInteractive(browser);
      browser
        .waitForElementVisible('[data-testid="dialog-edit-post"]', 10000)
        .clearValue('#post_content')
        .setValue('#post_content', speechPostText);
      submitExactContentDialog(browser, {
        anchorSelector: '#edit_post_dialog_title',
        submitSelector: '[data-testid="dialog-edit-post-submit"]',
        inputSelector: '#post_content',
        expectedValue: speechPostText,
        label: '読み上げ用の投稿',
      });
      waitForDialogToClose(browser, '[data-testid="dialog-edit-post"]', '読み上げ用の投稿');

      browser
        .useXpath()
        .waitForElementVisible(speechPostXpath, 10000)
        .useCss()
        .pause(500)
        .execute(
          function () {
            return window.__testSpeechCount || 0;
          },
          [],
          function (res) {
            browser.assert.ok(res.value > speechCount, '投稿を読み上げる');
            speechCount = res.value;
          }
        );

      browser
        .useXpath()
        .waitForElementVisible(`${speechPostXpath}//button[@data-testid='timeline-post-reply-button']`, 10000)
        .click(`${speechPostXpath}//button[@data-testid='timeline-post-reply-button']`)
        .useCss()
        .waitForElementVisible('[data-testid="dialog-edit-reply"]', 10000)
        .clearValue('#reply_content')
        .setValue('#reply_content', replyText);
      submitExactContentDialog(browser, {
        anchorSelector: '#edit_reply_dialog_title',
        submitSelector: '[data-testid="dialog-edit-reply-submit"]',
        inputSelector: '#reply_content',
        expectedValue: replyText,
        label: '読み上げ用の返信',
      });
      waitForDialogToClose(browser, '[data-testid="dialog-edit-reply"]', '読み上げ用の返信');

      browser
        .useXpath()
        .waitForElementVisible(replyXpath, 10000)
        .useCss()
        .pause(500)
        .execute(
          function () {
            return window.__testSpeechCount || 0;
          },
          [],
          function (res) {
            browser.assert.ok(res.value > speechCount, '返信を読み上げる');
            speechCount = res.value;
          }
        );

      browser
        .useXpath()
        .waitForElementVisible(`${speechPostXpath}//button[@data-testid='timeline-post-supplement-button']`, 10000)
        .click(`${speechPostXpath}//button[@data-testid='timeline-post-supplement-button']`)
        .useCss()
        .waitForElementVisible('[data-testid="dialog-edit-supplement"]', 10000)
        .clearValue('#supplement_content')
        .setValue('#supplement_content', supplementText);
      submitExactContentDialog(browser, {
        anchorSelector: '#edit_supplement_dialog_title',
        submitSelector: '[data-testid="dialog-edit-supplement-submit"]',
        inputSelector: '#supplement_content',
        expectedValue: supplementText,
        label: '読み上げ用の付加情報',
      });
      waitForDialogToClose(browser, '[data-testid="dialog-edit-supplement"]', '読み上げ用の付加情報');

      browser
        .useXpath()
        .waitForElementVisible(supplementXpath, 10000)
        .useCss()
        .pause(500)
        .execute(
          function () {
            return window.__testSpeechCount || 0;
          },
          [],
          function (res) {
            browser.assert.ok(res.value > speechCount, '付加情報を読み上げる');
            speechCount = res.value;
          }
        );

      disableSpeechWhenInteractive(browser, { activeLabel: '', clicked: false });
      browser.execute(
        function () {
          return window.__testSpeechCount || 0;
        },
        [],
        function (res) {
          speechCount = res.value || 0;
        }
      );

      browser.waitForElementVisible('[data-testid="timeline-post-button"]', 10000);
      openPostDialogWhenInteractive(browser);
      browser
        .waitForElementVisible('[data-testid="dialog-edit-post"]', 10000)
        .clearValue('#post_content')
        .setValue('#post_content', speechPostText2);
      submitExactContentDialog(browser, {
        anchorSelector: '#edit_post_dialog_title',
        submitSelector: '[data-testid="dialog-edit-post-submit"]',
        inputSelector: '#post_content',
        expectedValue: speechPostText2,
        label: '読み上げ無効時の投稿',
      });
      waitForDialogToClose(browser, '[data-testid="dialog-edit-post"]', '読み上げ無効時の投稿');

      browser
        .useXpath()
        .waitForElementVisible(
          `//article[./div[contains(concat(" ", normalize-space(@class), " "), " post ")]]` +
            `[.//div[contains(@class,"text") and contains(., "${speechPostText2}")]]`,
          10000
        )
        .useCss()
        .pause(500)
        .execute(
          function () {
            return window.__testSpeechCount || 0;
          },
          [],
          function (res) {
            browser.assert.equal(res.value, speechCount, '読み上げ無効時には読み上げない');
          }
        );
      finish();
    };

    closeSoundCautionIfVisible(browser);
    installAudioSpeechHooks(browser);
    waitForTimelineReady(browser);

    findOptionalElement(browser, '[data-testid="timeline-post-button"]', (result) => {
      if (result.status !== 0) {
        browser.assert.ok(false, '音声再生・読み上げのテスト用の投稿ボタンを利用できません。');
        finish();
        return;
      }

      findOptionalElement(browser, '[data-testid="timeline-sound-tag-button"]', (soundTagResult) => {
        if (soundTagResult.status !== 0) {
          browser.assert.ok(false, '音声タグ設定用の「音を鳴らすタグ」ボタンを利用できません。');
          finish();
          return;
        }

        clickSingleVisibleAfterExactControls(browser, {
          submitSelector: '[data-testid="timeline-sound-tag-button"]',
          expectedControls: [],
          label: '音を鳴らすタグのダイアログを開く',
        });
        findOptionalElement(browser, '[data-testid="dialog-sound-tag"]', (dialogResult) => {
          if (dialogResult.status !== 0) {
            browser.assert.ok(false, '音声タグ設定用の「音を鳴らすタグ」ダイアログを利用できません。');
            finish();
            return;
          }

          resolveUniqueTagCheckboxByName(
            browser,
            {
              anchorSelector: '#sound_tag_dialog_title',
              checkboxTestIdPrefix: 'sound-tag-checkbox-',
              expectedName: roomTagName,
              label: '専用の音を鳴らすタグ',
            },
            (resolvedTag) => {
              if (!resolvedTag) {
                finish();
                return;
              }
              selectedTagId = resolvedTag.tagId;
              const soundTagCheckbox = `[data-testid="sound-tag-checkbox-${selectedTagId}"]`;
              const soundTagLabel = `${soundTagCheckbox} + label`;
              clickSingleVisibleAfterExactControls(browser, {
                anchorSelector: '#sound_tag_dialog_title',
                submitSelector: soundTagCheckbox,
                expectedControls: [
                  { selector: soundTagCheckbox, property: 'checked', value: false },
                  { selector: soundTagCheckbox, property: 'value', value: selectedTagId },
                  { selector: soundTagLabel, property: 'textContent', value: roomTagName },
                ],
                label: '専用の音を鳴らすタグを選択',
              });
              clickSingleVisibleAfterExactControls(browser, {
                anchorSelector: '#sound_tag_dialog_title',
                submitSelector: '[data-testid="dialog-sound-tag-confirm"]',
                expectedControls: [
                  { selector: soundTagCheckbox, property: 'checked', value: true },
                  { selector: soundTagCheckbox, property: 'value', value: selectedTagId },
                  { selector: soundTagLabel, property: 'textContent', value: roomTagName },
                ],
                label: '専用の音を鳴らすタグを確定',
              });
              waitForDialogToClose(browser, '[data-testid="dialog-sound-tag"]', '音を鳴らすタグ');
              runSpeechFlow();
            }
          );
        });
      });
    });
  },
};
