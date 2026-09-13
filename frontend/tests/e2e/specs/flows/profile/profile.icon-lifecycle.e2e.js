// 対象ユーザのアイコンが未設定（image_nameがnull）の状態で実行する。
const fs = require('fs');
const path = require('path');
const { requireEnv } = require('../../helpers/login');
const {
  openProfileFromMenu,
  reopenProfileView,
  waitForSnackbar,
  clickExactProfileSave,
} = require('../../helpers/profile-helpers');
const { loginByForm, waitForUserRole } = require('../../helpers/session-helpers');
const {
  assertBackendMediaAvailable,
  assertBackendMediaUnavailable,
  assertMediaUrlsStatus,
} = require('../../helpers/timeline-media-lifecycle');
const PROFILE_ICON_PATH = path.resolve(__dirname, '../../../fixtures/images/sample-image.png');

const waitForProfileIconState = (browser, expectedPresent, onDone = () => {}, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function () {
      const preview = document.querySelector('.avatar-preview-wrapper img');
      const uploaded = document.querySelector('.avatar-uploaded-wrapper img');
      return {
        previewPresent: !!preview,
        uploadedPresent: !!uploaded,
        uploadedUrl: uploaded ? uploaded.src || '' : '',
        uploadedLoaded: !!(uploaded && uploaded.complete && uploaded.naturalWidth > 0),
      };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : {};
      const matched = expectedPresent
        ? state.uploadedPresent && state.uploadedLoaded && !!state.uploadedUrl
        : !state.uploadedPresent && !state.previewPresent;
      if (matched) {
        browser.assert.ok(true, `プロフィール画像の状態が${expectedPresent ? '保存済み' : '削除済み'}です。`);
        onDone(state.uploadedUrl || '', true);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `プロフィール画像の状態が一致しません: ${JSON.stringify(state)}`);
        onDone('', false);
        return;
      }
      browser.pause(500, () => waitForProfileIconState(browser, expectedPresent, onDone, attempt + 1));
    }
  );
};

const removeUploadedProfileIcon = (browser) => {
  browser.execute(
    function () {
      const button = document.querySelector('.avatar-uploaded-wrapper .avatar-remove-button');
      if (!button) return { clicked: false };
      button.click();
      return { clicked: true };
    },
    [],
    (result) => {
      const clicked = !!(result && result.value && result.value.clicked);
      browser.assert.ok(clicked, 'アップロード済みのプロフィール画像の削除ボタンをクリックしました。');
    }
  );
};

module.exports = {
  '@tags': ['fixed-seed-mutation'],
  'プロフィール画像をアップロードして削除できる': (browser) => {
    const mail = requireEnv('E2E_USER_MAIL');
    const password = requireEnv('E2E_USER_PASSWORD');

    if (!fs.existsSync(PROFILE_ICON_PATH)) {
      browser.assert.ok(false, `プロフィール画像のテストデータがありません: ${PROFILE_ICON_PATH}`);
      browser.end();
      return;
    }

    loginByForm(browser, { mail, password });
    waitForUserRole(browser, 'Author');
    openProfileFromMenu(browser);

    waitForProfileIconState(browser, false, (_unused, startsWithoutIcon) => {
      if (!startsWithoutIcon) {
        browser.end();
        return;
      }

      browser.setValue('#image-file', PROFILE_ICON_PATH).waitForElementVisible('.avatar-preview-wrapper img', 20000);
      clickExactProfileSave(browser, {
        expectedControls: [
          { selector: '#username', property: 'nonEmptyValue', value: true },
          { selector: '#image-file', property: 'filesLength', value: 1 },
        ],
        label: 'プロフィール画像のアップロード',
      });
      waitForSnackbar(browser);

      reopenProfileView(browser);
      waitForProfileIconState(browser, true, (profileIconUrl, persisted) => {
        if (!persisted) {
          browser.end();
          return;
        }
        assertMediaUrlsStatus(browser, [profileIconUrl], 200, '保存済みのプロフィール画像');
        assertBackendMediaAvailable(browser, [profileIconUrl], 'バックエンドに保存済みのプロフィール画像');

        removeUploadedProfileIcon(browser);
        clickExactProfileSave(browser, {
          expectedControls: [
            { selector: '#username', property: 'nonEmptyValue', value: true },
            { selector: '#image-file', property: 'filesLength', value: 0 },
          ],
          label: 'プロフィール画像の削除',
        });
        waitForSnackbar(browser);
        reopenProfileView(browser);
        waitForProfileIconState(browser, false, (_removedUrl, removed) => {
          if (!removed) {
            browser.end();
            return;
          }
          assertBackendMediaUnavailable(browser, [profileIconUrl], 'バックエンドで削除済みのプロフィール画像');
          browser.end();
        });
      });
    });
  },
};
