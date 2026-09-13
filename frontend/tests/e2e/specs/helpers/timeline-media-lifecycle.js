const { clickFirstVisible } = require('./timeline-helpers');
const { clickSingleVisibleAfterExactControls } = require('./dialog-focus');
const { assertAccessibilityIntegrity } = require('./accessibility');

const MEDIA_INPUT_SELECTORS = {
  image: '[data-testid="dialog-edit-post"] .media-input-group input[type="file"][accept*="image/jpeg"]',
  video: '[data-testid="dialog-edit-post"] .media-input-group input[type="file"][accept*="video/mp4"]',
  subtitle: '[data-testid="dialog-edit-post"] .media-input-group input[type="file"][accept*=".vtt"]',
  audio: '[data-testid="dialog-edit-post"] .media-input-group input[type="file"][accept*="audio/mpeg"]',
};

const DIALOG_WAIT_ATTEMPTS = 120;
const MEDIA_WAIT_ATTEMPTS = 80;
const URL_WAIT_ATTEMPTS = 40;

const assertPostMediaAccessibility = (browser, label) => {
  assertAccessibilityIntegrity(browser, {
    rootSelector: '[data-testid="dialog-edit-post"] .media-input-group',
    label,
    checkControlNames: true,
  });
};

const buildPostXpath = (text) =>
  '//article[./div[contains(concat(" ", normalize-space(@class), " "), " post ")]]' +
  '[.//div[contains(@class,"text") and normalize-space(.)="' +
  text +
  '"]]';

const makeFileInputInteractable = (browser, selector, strategy = 'css selector') => {
  browser.execute(
    function (payload) {
      const input =
        payload.strategy === 'xpath'
          ? document.evaluate(payload.selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
              .singleNodeValue
          : document.querySelector(payload.selector);
      if (!input) return { ok: false, reason: 'file-input-not-found' };
      input.removeAttribute('hidden');
      input.style.setProperty('display', 'block', 'important');
      input.style.setProperty('visibility', 'visible', 'important');
      input.style.setProperty('opacity', '1', 'important');
      input.style.setProperty('position', 'fixed', 'important');
      input.style.setProperty('left', '0', 'important');
      input.style.setProperty('top', '0', 'important');
      input.style.setProperty('width', '1px', 'important');
      input.style.setProperty('height', '1px', 'important');
      return { ok: true };
    },
    [{ selector, strategy }],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, reason: 'execute-failed' };
      browser.assert.ok(state.ok, `ファイル入力を操作可能にしました（${state.reason || 'ok'}）。`);
    }
  );
};

const waitForDialogHidden = (browser, selector, label, attempt = 0) => {
  browser.execute(
    function (targetSelector) {
      const node = document.querySelector(targetSelector);
      return { visible: !!(node && (node.offsetParent || node.getClientRects().length)) };
    },
    [selector],
    (result) => {
      const visible = !!(result && result.value && result.value.visible);
      if (!visible) {
        browser.assert.ok(true, label + ': ダイアログが閉じました。');
        return;
      }
      if (attempt >= DIALOG_WAIT_ATTEMPTS) {
        browser.assert.ok(false, label + ': ダイアログが閉じませんでした。');
        return;
      }
      browser.pause(500, () => waitForDialogHidden(browser, selector, label, attempt + 1));
    }
  );
};

const ensureMediaPanelOpen = (browser) => {
  browser.execute(
    function () {
      const toggle = document.querySelector('[data-testid="dialog-edit-post-media-title-toggle"]');
      if (!toggle) return { ok: false, reason: 'media-toggle-not-found' };
      if (toggle.getAttribute('aria-expanded') !== 'true') {
        toggle.click();
      }
      return { ok: true };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, reason: 'no-result' };
      browser.assert.ok(state.ok, 'メディアパネルを開きました(' + (state.reason || 'ok') + ').');
    }
  );
  browser.waitForElementVisible('[data-testid="dialog-edit-post"] .media-input-group', 10000);
};

const openPostDialog = (browser, text) => {
  browser
    .waitForElementVisible('[data-testid="timeline-post-button"]', 10000)
    .perform((done) => {
      clickFirstVisible(browser, '[data-testid="timeline-post-button"]', 'メディア付き投稿のダイアログを開く');
      done();
    })
    .waitForElementVisible('[data-testid="dialog-edit-post"]', 10000)
    .clearValue('#post_content')
    .setValue('#post_content', text);
  ensureMediaPanelOpen(browser);
};

const readSelectedMediaState = (browser, callback) => {
  browser.execute(
    function () {
      const dialog = document.querySelector('[data-testid="dialog-edit-post"]');
      const imageInput = dialog && dialog.querySelector('input[type="file"][accept*="image/jpeg"]');
      const videoInput = dialog && dialog.querySelector('input[type="file"][accept*="video/mp4"]');
      const subtitleInput = dialog && dialog.querySelector('input[type="file"][accept*=".vtt"]');
      const audioInput = dialog && dialog.querySelector('input[type="file"][accept*="audio/mpeg"]');
      const image = dialog && dialog.querySelector('.image-preview-wrapper img');
      const video = dialog && dialog.querySelector('[data-testid="media-video-preview"]');
      const subtitle = video && video.querySelector('track');
      const audio = dialog && dialog.querySelector('.audio-preview-wrapper audio');
      const videoDuration = video ? Number(video.duration) || 0 : 0;
      const audioDuration = audio ? Number(audio.duration) || 0 : 0;
      return {
        found: !!dialog,
        imageReady: !!(imageInput && imageInput.files && imageInput.files.length && image && image.currentSrc),
        videoReady: !!(videoInput && videoInput.files && videoInput.files.length && videoDuration > 0 && videoDuration <= 30),
        subtitleReady: !!(
          subtitleInput && subtitleInput.files && subtitleInput.files.length && subtitle && (subtitle.src || subtitle.getAttribute('src'))
        ),
        audioReady: !!(audioInput && audioInput.files && audioInput.files.length && audioDuration > 0 && audioDuration <= 30),
        videoDuration,
        audioDuration,
      };
    },
    [],
    (result) => callback(result && result.value ? result.value : { found: false })
  );
};

const waitForSelectedMedia = (browser, type, attempt = 0) => {
  const stateKey = type + 'Ready';
  readSelectedMediaState(browser, (state) => {
    if (state[stateKey]) {
      browser.assert.ok(true, type + 'のテストデータを投稿ダイアログで使用できます。');
      return;
    }
    if (attempt >= MEDIA_WAIT_ATTEMPTS) {
      browser.assert.ok(
        false,
        type +
          'のテストデータを使用できませんでした (videoDuration=' +
          (state.videoDuration || 0) +
          ', audioDuration=' +
          (state.audioDuration || 0) +
          ').'
      );
      return;
    }
    browser.pause(500, () => waitForSelectedMedia(browser, type, attempt + 1));
  });
};

const submitPostDialog = (browser, label, expectedText, expectedControls = []) => {
  clickSingleVisibleAfterExactControls(browser, {
    anchorSelector: '#edit_post_dialog_title',
    submitSelector: '[data-testid="dialog-edit-post-submit"]',
    expectedControls: [
      { selector: '#post_content', property: 'value', value: expectedText },
      ...expectedControls,
    ],
    label,
  });
  waitForDialogHidden(browser, '[data-testid="dialog-edit-post"]', label);
};

const waitForPostVisible = (browser, text, label) => {
  browser.useXpath().waitForElementVisible(buildPostXpath(text), 30000, false, (result) => {
    if (typeof result.status === 'number' && result.status !== 0) {
      browser.assert.ok(false, label + ': 投稿が表示されませんでした。');
    }
  });
  browser.useCss();
};

const waitForPostAbsent = (browser, text) => {
  browser.useXpath().waitForElementNotPresent(buildPostXpath(text), 30000, false);
  browser.useCss();
};

const clickPostAction = (browser, postText, testId, prefix, label) => {
  browser.execute(
    function (payload) {
      const articles = Array.from(document.querySelectorAll('article'));
      const article = articles.find(function (candidate) {
        const postRoot = Array.from(candidate.children).find(function (child) {
          return child.classList && child.classList.contains('post');
        });
        if (!postRoot) return false;
        const textNode = postRoot.querySelector('.container > .text') || postRoot.querySelector('.text');
        return !!textNode && textNode.textContent.trim() === payload.postText;
      });
      if (!article) return { clicked: false, reason: 'post-not-found' };
      const selector = payload.prefix
        ? '[data-testid^="' + payload.testId + '"]'
        : '[data-testid="' + payload.testId + '"]';
      const button = article.querySelector(selector);
      if (!button) return { clicked: false, reason: 'button-not-found' };
      button.click();
      return { clicked: true };
    },
    [{ postText, testId, prefix: !!prefix }],
    (result) => {
      const state = result && result.value ? result.value : { clicked: false, reason: 'no-result' };
      browser.assert.ok(state.clicked, label + ': 操作をクリックしました (' + (state.reason || 'ok') + ').');
    }
  );
};

const createImagePost = (browser, { text, imagePath, caption }) => {
  openPostDialog(browser, text);
  makeFileInputInteractable(browser, MEDIA_INPUT_SELECTORS.image);
  browser
    .setValue(MEDIA_INPUT_SELECTORS.image, imagePath)
    .waitForElementVisible('[data-testid="dialog-edit-post"] .media-input-group .image-preview-wrapper img', 20000);
  waitForSelectedMedia(browser, 'image');
  browser
    .clearValue('[data-testid="dialog-edit-post"] [data-testid="media-image-caption"]')
    .setValue('[data-testid="dialog-edit-post"] [data-testid="media-image-caption"]', caption);
  assertPostMediaAccessibility(browser, '投稿の画像メディアの入力欄');
  submitPostDialog(browser, '画像付き投稿を作成', text, [
    { selector: MEDIA_INPUT_SELECTORS.image, property: 'filesLength', value: 1 },
    {
      selector: '[data-testid="dialog-edit-post"] [data-testid="media-image-caption"]',
      property: 'value',
      value: caption,
    },
  ]);
  waitForPostVisible(browser, text, '画像付き投稿を作成');
};

const createVideoPost = (browser, { text, videoPath, subtitlePath }) => {
  openPostDialog(browser, text);
  makeFileInputInteractable(browser, MEDIA_INPUT_SELECTORS.video);
  browser
    .setValue(MEDIA_INPUT_SELECTORS.video, videoPath)
    .waitForElementVisible('[data-testid="dialog-edit-post"] [data-testid="media-video-preview"]', 20000);
  waitForSelectedMedia(browser, 'video');
  makeFileInputInteractable(browser, MEDIA_INPUT_SELECTORS.subtitle);
  browser
    .setValue(MEDIA_INPUT_SELECTORS.subtitle, subtitlePath)
    .waitForElementPresent('[data-testid="dialog-edit-post"] [data-testid="media-video-preview"] track', 10000);
  waitForSelectedMedia(browser, 'subtitle');
  assertPostMediaAccessibility(browser, '投稿の動画メディアの入力欄');
  submitPostDialog(browser, '動画・字幕付き投稿を作成', text, [
    { selector: MEDIA_INPUT_SELECTORS.video, property: 'filesLength', value: 1 },
    { selector: MEDIA_INPUT_SELECTORS.subtitle, property: 'filesLength', value: 1 },
  ]);
  waitForPostVisible(browser, text, '動画・字幕付き投稿を作成');
};

const createAudioPost = (browser, { text, audioPath, title, description }) => {
  openPostDialog(browser, text);
  makeFileInputInteractable(browser, MEDIA_INPUT_SELECTORS.audio);
  browser
    .setValue(MEDIA_INPUT_SELECTORS.audio, audioPath)
    .waitForElementVisible('[data-testid="dialog-edit-post"] .media-input-group .audio-preview-wrapper audio', 20000);
  waitForSelectedMedia(browser, 'audio');
  browser
    .clearValue('[data-testid="dialog-edit-post"] [data-testid="media-audio-title"]')
    .setValue('[data-testid="dialog-edit-post"] [data-testid="media-audio-title"]', title)
    .clearValue('[data-testid="dialog-edit-post"] [data-testid="media-audio-description"]')
    .setValue('[data-testid="dialog-edit-post"] [data-testid="media-audio-description"]', description);
  assertPostMediaAccessibility(browser, '投稿の音声メディアの入力欄');
  submitPostDialog(browser, '音声付き投稿を作成', text, [
    { selector: MEDIA_INPUT_SELECTORS.audio, property: 'filesLength', value: 1 },
    {
      selector: '[data-testid="dialog-edit-post"] [data-testid="media-audio-title"]',
      property: 'value',
      value: title,
    },
    {
      selector: '[data-testid="dialog-edit-post"] [data-testid="media-audio-description"]',
      property: 'value',
      value: description,
    },
  ]);
  waitForPostVisible(browser, text, '音声付き投稿を作成');
};

const editPost = (browser, { currentText, nextText, imageCaption }) => {
  clickPostAction(browser, currentText, 'timeline-post-edit-button', false, '投稿を編集');
  browser
    .waitForElementVisible('[data-testid="dialog-edit-post"]', 10000)
    .clearValue('#post_content')
    .setValue('#post_content', nextText);
  ensureMediaPanelOpen(browser);
  if (typeof imageCaption === 'string') {
    browser
      .waitForElementVisible('[data-testid="dialog-edit-post"] .media-input-group .image-preview-wrapper img', 10000)
      .clearValue('[data-testid="dialog-edit-post"] [data-testid="media-image-caption"]')
      .setValue('[data-testid="dialog-edit-post"] [data-testid="media-image-caption"]', imageCaption);
    assertPostMediaAccessibility(browser, '編集中の投稿の画像メディアの入力欄');
  }
  submitPostDialog(
    browser,
    'メディア付き投稿を編集',
    nextText,
    typeof imageCaption === 'string'
      ? [
          {
            selector: '[data-testid="dialog-edit-post"] [data-testid="media-image-caption"]',
            property: 'value',
            value: imageCaption,
          },
        ]
      : []
  );
  waitForPostVisible(browser, nextText, 'メディア付き投稿を編集');
  waitForPostAbsent(browser, currentText, '編集前のメディア付き投稿の本文');
};

const installTimelineVideoUploadProbe = (browser) => {
  browser.execute(
    function () {
      if (window.__e2eTimelineVideoUploadProbe) return { installed: false, reason: 'already-installed' };
      const prototype = XMLHttpRequest.prototype;
      const originalOpen = prototype.open;
      const originalSend = prototype.send;
      const probe = { originalOpen, originalSend, requests: [] };
      window.__e2eTimelineVideoUploadProbe = probe;

      prototype.open = function (method, url) {
        this.__e2eRequestMethod = method;
        this.__e2eRequestUrl = String(url || '');
        return originalOpen.apply(this, arguments);
      };
      prototype.send = function (body) {
        if (/\/api\/rooms\/[^/]+\/timeline\/uploads\/video(?:\?|$)/.test(this.__e2eRequestUrl)) {
          const keys = body instanceof FormData ? Array.from(body.keys()) : [];
          probe.requests.push({ method: this.__e2eRequestMethod, url: this.__e2eRequestUrl, keys });
        }
        return originalSend.apply(this, arguments);
      };
      return { installed: true };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { installed: false, reason: 'no-result' };
      browser.assert.ok(state.installed, 'タイムラインの動画アップロードの監視を設定しました(' + (state.reason || 'ok') + ').');
    }
  );
};

const assertSubtitleOnlyVideoUpload = (browser) => {
  browser.execute(
    function () {
      const probe = window.__e2eTimelineVideoUploadProbe;
      if (!probe) return { found: false, requests: [] };
      XMLHttpRequest.prototype.open = probe.originalOpen;
      XMLHttpRequest.prototype.send = probe.originalSend;
      const requests = probe.requests.slice();
      delete window.__e2eTimelineVideoUploadProbe;
      return { found: true, requests };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { found: false, requests: [] };
      const requests = Array.isArray(state.requests) ? state.requests : [];
      browser.assert.ok(state.found, 'タイムラインの動画アップロードの監視を利用できます。');
      browser.assert.equal(requests.length, 1, 'タイムラインの動画アップロード要求を1件だけ送信しました。');
      const keys = requests[0] && Array.isArray(requests[0].keys) ? requests[0].keys : [];
      browser.assert.ok(keys.indexOf('video_subtitle_file') >= 0, '字幕だけのアップロードに字幕ファイルが含まれています。');
      browser.assert.ok(keys.indexOf('video_file') < 0, '字幕だけのアップロードに動画ファイルが含まれていません。');
    }
  );
};

const replaceVideoSubtitle = (browser, { currentText, nextText, subtitlePath }) => {
  installTimelineVideoUploadProbe(browser);
  clickPostAction(browser, currentText, 'timeline-post-edit-button', false, '動画の字幕を編集');
  browser
    .waitForElementVisible('[data-testid="dialog-edit-post"]', 10000)
    .clearValue('#post_content')
    .setValue('#post_content', nextText);
  ensureMediaPanelOpen(browser);
  makeFileInputInteractable(browser, MEDIA_INPUT_SELECTORS.subtitle);
  browser
    .waitForElementVisible('[data-testid="dialog-edit-post"] [data-testid="media-video-preview"]', 10000)
    .setValue(MEDIA_INPUT_SELECTORS.subtitle, subtitlePath)
    .waitForElementPresent('[data-testid="dialog-edit-post"] [data-testid="media-video-preview"] track', 10000);
  waitForSelectedMedia(browser, 'subtitle');
  assertPostMediaAccessibility(browser, '編集中の投稿の動画メディアの入力欄');
  submitPostDialog(browser, '動画の字幕を差し替え', nextText, [
    { selector: MEDIA_INPUT_SELECTORS.subtitle, property: 'filesLength', value: 1 },
  ]);
  assertSubtitleOnlyVideoUpload(browser);
  waitForPostVisible(browser, nextText, '動画の字幕を差し替え');
  waitForPostAbsent(browser, currentText, '字幕差し替え前の動画投稿の本文');
};

const capturePostMedia = (browser, postText, callback) => {
  browser.execute(
    function (targetText) {
      const articles = Array.from(document.querySelectorAll('article'));
      const article = articles.find(function (candidate) {
        const postRoot = Array.from(candidate.children).find(function (child) {
          return child.classList && child.classList.contains('post');
        });
        if (!postRoot) return false;
        const textNode = postRoot.querySelector('.container > .text') || postRoot.querySelector('.text');
        return !!textNode && textNode.textContent.trim() === targetText;
      });
      if (!article) return { found: false };
      const image = article.querySelector('[data-testid^="timeline-post-gallery-image-button-"] img');
      const videoThumbnail = article.querySelector('[data-testid^="timeline-post-gallery-video-button-"] img');
      const audio = article.querySelector('.audio audio');
      const audioCaption = article.querySelector('.audio figcaption');
      return {
        found: true,
        imageThumbnailUrl: image ? image.src : '',
        imageAlt: image ? image.getAttribute('alt') || '' : '',
        videoThumbnailUrl: videoThumbnail ? videoThumbnail.src : '',
        audioUrl: audio ? audio.src : '',
        audioTitle: audio ? audio.getAttribute('aria-label') || '' : '',
        audioDescription: audioCaption ? audioCaption.textContent.trim() : '',
      };
    },
    [postText],
    (result) => {
      const state = result && result.value ? result.value : { found: false };
      browser.assert.ok(state.found, 'メディア付き投稿が見つかりました: ' + postText);
      callback(state);
    }
  );
};

const openGalleryAndCapture = (browser, postText, type, callback) => {
  const testId = type === 'image' ? 'timeline-post-gallery-image-button-' : 'timeline-post-gallery-video-button-';
  clickPostAction(browser, postText, testId, true, 'Open ' + type + ' Gallery');
  browser.waitForElementVisible('[data-testid="dialog-gallery"]', 10000);
  if (type === 'image') {
    browser.waitForElementVisible('[data-testid="dialog-gallery-image"]', 10000);
  } else {
    browser
      .waitForElementVisible('[data-testid="dialog-gallery"] video', 10000)
      .waitForElementPresent('[data-testid="dialog-gallery"] video track', 10000);
  }
  browser.execute(
    function (mediaType) {
      const dialog = document.querySelector('[data-testid="dialog-gallery"]');
      if (!dialog) return { found: false };
      const image = dialog.querySelector('[data-testid="dialog-gallery-image"]');
      const video = dialog.querySelector('video');
      const track = video ? video.querySelector('track') : null;
      return {
        found: true,
        imageUrl: image ? image.src : '',
        imageAlt: image ? image.getAttribute('alt') || '' : '',
        imageLoaded: image ? image.complete && image.naturalWidth > 0 : false,
        videoUrl: video ? video.src : '',
        subtitleUrl: track ? track.src : '',
        mediaType,
      };
    },
    [type],
    (result) => {
      const state = result && result.value ? result.value : { found: false };
      browser.assert.ok(state.found, type + 'のギャラリーが見つかりました。');
      if (type === 'image') {
        browser.assert.ok(state.imageLoaded, 'ギャラリー画像が読み込まれました。');
        browser.assert.ok(!!state.imageUrl, 'ギャラリー画像のURLを取得しました。');
      } else {
        browser.assert.ok(!!state.videoUrl, 'ギャラリー動画のURLを取得しました。');
        browser.assert.ok(!!state.subtitleUrl, 'ギャラリー字幕のURLを取得しました。');
      }
      callback(state);
    }
  );
  browser
    .click('[data-testid="dialog-gallery-close"]')
    .waitForElementNotVisible('[data-testid="dialog-gallery"]', 10000);
};

const assertMediaUrlsStatus = (browser, urls, expectedStatus, label, attempt = 0) => {
  const filteredUrls = urls.filter(Boolean);
  browser.assert.equal(filteredUrls.length, urls.length, label + ': すべてのメディアのURLを取得しました。');
  browser.executeAsync(
    function (payload, done) {
      const dedicatedFrontend =
        window.location.protocol === 'http:' &&
        window.location.hostname === 'localhost' &&
        window.location.port === '3100';
      if (!dedicatedFrontend) {
        done([{ url: '', status: 0, error: 'unexpected-frontend-origin' }]);
        return;
      }
      const resolveAllowedMediaUrl = function (rawUrl) {
        const url = new URL(rawUrl, window.location.origin);
        const localHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
        return url.protocol === 'http:' && localHost && (url.port === '3100' || url.port === '5100')
          ? url
          : null;
      };
      Promise.all(
        payload.urls.map(function (rawUrl) {
          const url = resolveAllowedMediaUrl(rawUrl);
          if (!url) {
            return { url: rawUrl, status: 0, error: 'unexpected-media-origin' };
          }
          url.searchParams.set('__e2e_cache_bust', String(Date.now()) + Math.random());
          return fetch(url.toString(), { cache: 'no-store', credentials: 'same-origin' })
            .then(function (response) {
              return { url: rawUrl, status: response.status };
            })
            .catch(function (error) {
              return { url: rawUrl, status: 0, error: String(error && error.message ? error.message : error) };
            });
        })
      ).then(done);
    },
    [{ urls: filteredUrls }],
    (result) => {
      const statuses = result && Array.isArray(result.value) ? result.value : [];
      const matched =
        statuses.length === filteredUrls.length &&
        statuses.every(function (entry) {
          return Number(entry.status) === expectedStatus;
        });
      if (matched) {
        browser.assert.ok(true, label + ': すべてのメディアのURLが返したステータスは' + expectedStatus + '.');
        return;
      }
      if (attempt >= URL_WAIT_ATTEMPTS) {
        browser.assert.ok(false, label + ': メディアのURLが想定外のステータスを返しました: ' + JSON.stringify(statuses) + '.');
        return;
      }
      browser.pause(500, () => assertMediaUrlsStatus(browser, filteredUrls, expectedStatus, label, attempt + 1));
    }
  );
};

const assertBackendMediaAvailability = (
  browser,
  urls,
  expectedAvailable,
  label,
  attempt = 0,
  unavailableConfirmations = 0
) => {
  const filteredUrls = urls.filter(Boolean);
  if (attempt === 0) {
    browser.assert.equal(filteredUrls.length, urls.length, label + ': すべてのメディアのURLを取得しました。');
  }
  browser.executeAsync(
    function (payload, done) {
      const dedicatedFrontend =
        window.location.protocol === 'http:' &&
        window.location.hostname === 'localhost' &&
        window.location.port === '3100';
      if (!dedicatedFrontend) {
        done({ health: { status: 0, error: 'unexpected-frontend-origin' }, statuses: [] });
        return;
      }
      const requestStatus = function (rawUrl) {
        const url = new URL(rawUrl, window.location.origin);
        const allowed =
          url.protocol === 'http:' &&
          url.hostname === 'localhost' &&
          (url.port === '3100' || url.port === '5100') &&
          (url.pathname.startsWith('/media/') || url.pathname.startsWith('/profile/'));
        if (!allowed) {
          return Promise.resolve({ url: rawUrl, status: 0, error: 'unexpected-media-origin' });
        }
        url.port = '3100';
        url.searchParams.set('__e2e_backend_cache_bust', String(Date.now()) + Math.random());
        return fetch(url.toString(), { cache: 'no-store', credentials: 'include', redirect: 'manual' })
          .then(function (response) {
            return { url: rawUrl, status: response.status, error: '' };
          })
          .catch(function (error) {
            return {
              url: rawUrl,
              status: 0,
              error: String(error && error.message ? error.message : error),
            };
          });
      };
      const healthUrl = new URL('/api/capabilities', window.location.origin);
      healthUrl.searchParams.set('__e2e_health_cache_bust', String(Date.now()) + Math.random());
      const healthRequest = fetch(healthUrl.toString(), { cache: 'no-store' })
        .then(function (response) {
          return { status: response.status, error: '' };
        })
        .catch(function (error) {
          return { status: 0, error: String(error && error.message ? error.message : error) };
        });
      Promise.all([healthRequest, Promise.all(payload.urls.map(requestStatus))]).then(function (results) {
        done({ health: results[0], statuses: results[1] });
      });
    },
    [{ urls: filteredUrls }],
    (result) => {
      const value = result && result.value ? result.value : {};
      const health = value.health || { status: 0, error: 'missing-health-result' };
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      const backendHealthy = !health.error && Number(health.status) === 200;
      const matched =
        backendHealthy &&
        statuses.length === filteredUrls.length &&
        statuses.every((entry) => {
          return expectedAvailable
            ? !entry.error && Number(entry.status) === 200
            : Boolean(entry.error) || Number(entry.status) !== 200;
        });
      if (matched) {
        if (!expectedAvailable && unavailableConfirmations < 1) {
          browser.pause(500, () =>
            assertBackendMediaAvailability(
              browser,
              filteredUrls,
              false,
              label,
              attempt + 1,
              unavailableConfirmations + 1
            )
          );
          return;
        }
        browser.assert.ok(
          true,
          label + ': バックエンドのメディアの状態は' + (expectedAvailable ? '利用可能です。' : '削除後のため利用できません。')
        );
        return;
      }
      if (attempt >= URL_WAIT_ATTEMPTS) {
        browser.assert.ok(
          false,
          label +
            ': バックエンドの稼働確認・メディア取得で想定外のステータスが返りました: ' +
            JSON.stringify({ health, statuses }) +
            '.'
        );
        return;
      }
      browser.pause(500, () =>
        assertBackendMediaAvailability(
          browser,
          filteredUrls,
          expectedAvailable,
          label,
          attempt + 1,
          0
        )
      );
    }
  );
};

const assertBackendMediaAvailable = (browser, urls, label) =>
  assertBackendMediaAvailability(browser, urls, true, label);

const assertBackendMediaUnavailable = (browser, urls, label) =>
  assertBackendMediaAvailability(browser, urls, false, label);

const deletePost = (browser, postText) => {
  clickPostAction(browser, postText, 'timeline-post-delete-button', false, '投稿を削除');
  browser.waitForElementVisible('[data-testid="dialog-delete-post"]', 10000);
  browser.execute(
    function () {
      const buttons = Array.from(document.querySelectorAll('.desktop-item[data-testid="dialog-delete-post-confirm"]'));
      const target = buttons.find(function (button) {
        return !!(button.offsetParent || button.getClientRects().length);
      });
      if (!target) return { clicked: false };
      target.click();
      return { clicked: true };
    },
    [],
    (result) => {
      const clicked = !!(result && result.value && result.value.clicked);
      browser.assert.ok(clicked, '投稿削除の確定ボタンをクリックしました。');
    }
  );
  waitForDialogHidden(browser, '[data-testid="dialog-delete-post"]', 'メディア付き投稿を削除');
  waitForPostAbsent(browser, postText, 'メディア付き投稿を削除');
};

module.exports = {
  assertBackendMediaAvailable,
  assertBackendMediaUnavailable,
  assertMediaUrlsStatus,
  capturePostMedia,
  createAudioPost,
  createImagePost,
  createVideoPost,
  deletePost,
  editPost,
  makeFileInputInteractable,
  openGalleryAndCapture,
  replaceVideoSubtitle,
};
