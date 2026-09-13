const fs = require('fs');
const path = require('path');
const { prepareTimelineRoom } = require('../../helpers/timeline-helpers');
const {
  getBaseUrl,
  navigateDirectToApp,
  waitForAppBootstrap,
} = require('../../helpers/login');
const {
  assertBackendMediaAvailable,
  assertBackendMediaUnavailable,
  assertMediaUrlsStatus,
  capturePostMedia,
  createAudioPost,
  createImagePost,
  createVideoPost,
  deletePost,
  editPost,
  openGalleryAndCapture,
  replaceVideoSubtitle,
} = require('../../helpers/timeline-media-lifecycle');

const IMAGE_PATH = path.resolve(__dirname, '../../../fixtures/images/sample-image.png');
const VIDEO_PATH = path.resolve(__dirname, '../../../fixtures/timeline-media/sample-video.mp4');
const SUBTITLE_PATH = path.resolve(__dirname, '../../../fixtures/timeline-media/sample-subtitle.vtt');
const UPDATED_SUBTITLE_PATH = path.resolve(__dirname, '../../../fixtures/timeline-media/sample-subtitle-updated.vtt');
const AUDIO_PATH = path.resolve(__dirname, '../../../../../public/assets/sound/decision34.mp3');

const resetTimelineDocument = (browser, state, label) => {
  browser.perform(() => {
    const base = getBaseUrl(browser).replace(/\/$/, '');
    const target = `${base}/floor/${encodeURIComponent(state.floorId)}/room/${encodeURIComponent(state.roomId)}`;
    navigateDirectToApp(browser, target);
    waitForAppBootstrap(browser, `${label}の初期化`);
    browser
      .waitForElementVisible('.timeline-page', 20000)
      .waitForElementPresent('[data-testid="timeline-connected"]', 20000);
  });
};

module.exports = {
  'タイムラインでメディアのアップロードと削除を確認する': (browser) => {
    const editorMail = process.env.E2E_FLOOR_EDITOR_MAIL || '';
    const editorPassword = process.env.E2E_FLOOR_EDITOR_PASSWORD || '';
    const userMail = process.env.E2E_USER_MAIL || '';
    const userPassword = process.env.E2E_USER_PASSWORD || '';

    if (!editorMail || !editorPassword || !userMail || !userPassword) {
      browser.assert.ok(false, 'タイムラインのメディアのアップロード・更新・削除のテストをスキップします。認証情報が未設定です。');
      browser.end();
      return;
    }

    const fixtures = [IMAGE_PATH, VIDEO_PATH, SUBTITLE_PATH, UPDATED_SUBTITLE_PATH, AUDIO_PATH];
    const missingFixture = fixtures.find((fixturePath) => !fs.existsSync(fixturePath));
    if (missingFixture) {
      browser.assert.ok(false, 'タイムラインのメディアのテストデータがありません: ' + missingFixture);
      browser.end();
      return;
    }

    const stamp = Date.now();
    const floorTitle = 'E2E Timeline Media Floor ' + stamp;
    const roomTitle = 'E2E Timeline Media Room ' + stamp;
    const imageText = 'E2E Media Image ' + stamp;
    const imageEditedText = imageText + ' edited';
    const imageCaption = 'E2E image alt ' + stamp;
    const imageEditedCaption = imageCaption + ' edited';
    const videoText = 'E2E Media Video ' + stamp;
    const videoEditedText = videoText + ' edited';
    const videoSubtitleEditedText = videoEditedText + ' subtitle';
    const audioText = 'E2E Media Audio ' + stamp;
    const audioTitle = 'E2E audio title ' + stamp;
    const audioDescription = 'E2E audio description ' + stamp;

    const mediaUrls = {
      imageThumbnail: '',
      image: '',
      videoThumbnail: '',
      video: '',
      subtitle: '',
      audio: '',
    };
    let originalSubtitleUrl = '';

    const state = prepareTimelineRoom(browser, {
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

    browser.perform(() => {
      if (!state.floorId || !state.roomId) {
        browser.assert.ok(false, 'タイムラインのメディアのアップロード・更新・削除: 専用のフロアまたはルームを準備できませんでした。');
        finish();
        return;
      }

      createImagePost(browser, {
        text: imageText,
        imagePath: IMAGE_PATH,
        caption: imageCaption,
      });
      capturePostMedia(browser, imageText, (postMedia) => {
        mediaUrls.imageThumbnail = postMedia.imageThumbnailUrl;
        browser.assert.equal(postMedia.imageAlt, imageCaption, '画像の代替テキストが表示されています。');
      });
      openGalleryAndCapture(browser, imageText, 'image', (galleryMedia) => {
        mediaUrls.image = galleryMedia.imageUrl;
        browser.assert.equal(galleryMedia.imageAlt, imageCaption, 'ギャラリー画像の代替テキストが表示されています。');
      });
      browser.perform(() => {
        assertMediaUrlsStatus(browser, [mediaUrls.imageThumbnail, mediaUrls.image], 200, '作成した画像メディア');
        assertBackendMediaAvailable(
          browser,
          [mediaUrls.imageThumbnail, mediaUrls.image],
          'バックエンドで作成した画像メディア'
        );
      });

      editPost(browser, {
        currentText: imageText,
        nextText: imageEditedText,
        imageCaption: imageEditedCaption,
      });
      capturePostMedia(browser, imageEditedText, (postMedia) => {
        browser.assert.equal(
          postMedia.imageThumbnailUrl,
          mediaUrls.imageThumbnail,
          '編集後も画像のサムネイルの参照を維持しています。'
        );
        browser.assert.equal(postMedia.imageAlt, imageEditedCaption, '編集した画像の代替テキストが表示されています。');
      });
      openGalleryAndCapture(browser, imageEditedText, 'image', (galleryMedia) => {
        browser.assert.equal(galleryMedia.imageUrl, mediaUrls.image, '編集後も画像の参照を維持しています。');
        browser.assert.equal(
          galleryMedia.imageAlt,
          imageEditedCaption,
          '編集したギャラリー画像の代替テキストが表示されています。'
        );
      });
      resetTimelineDocument(browser, state, '画像メディアの表示を初期化');

      createVideoPost(browser, {
        text: videoText,
        videoPath: VIDEO_PATH,
        subtitlePath: SUBTITLE_PATH,
      });
      capturePostMedia(browser, videoText, (postMedia) => {
        mediaUrls.videoThumbnail = postMedia.videoThumbnailUrl;
        browser.assert.ok(!!mediaUrls.videoThumbnail, '動画のサムネイルURLを取得しました。');
      });
      openGalleryAndCapture(browser, videoText, 'video', (galleryMedia) => {
        mediaUrls.video = galleryMedia.videoUrl;
        mediaUrls.subtitle = galleryMedia.subtitleUrl;
        originalSubtitleUrl = galleryMedia.subtitleUrl;
      });
      browser.perform(() => {
        assertMediaUrlsStatus(
          browser,
          [mediaUrls.videoThumbnail, mediaUrls.video, mediaUrls.subtitle],
          200,
          '作成した動画と字幕のメディア'
        );
        assertBackendMediaAvailable(
          browser,
          [mediaUrls.videoThumbnail, mediaUrls.video, mediaUrls.subtitle],
          'バックエンドで作成した動画と字幕のメディア'
        );
      });

      editPost(browser, {
        currentText: videoText,
        nextText: videoEditedText,
      });
      capturePostMedia(browser, videoEditedText, (postMedia) => {
        browser.assert.equal(
          postMedia.videoThumbnailUrl,
          mediaUrls.videoThumbnail,
          '編集後も動画のサムネイルの参照を維持しています。'
        );
      });
      openGalleryAndCapture(browser, videoEditedText, 'video', (galleryMedia) => {
        browser.assert.equal(galleryMedia.videoUrl, mediaUrls.video, '編集後も動画の参照を維持しています。');
        browser.assert.equal(
          galleryMedia.subtitleUrl,
          mediaUrls.subtitle,
          '編集後も字幕の参照を維持しています。'
        );
      });

      replaceVideoSubtitle(browser, {
        currentText: videoEditedText,
        nextText: videoSubtitleEditedText,
        subtitlePath: UPDATED_SUBTITLE_PATH,
      });
      capturePostMedia(browser, videoSubtitleEditedText, (postMedia) => {
        browser.assert.equal(
          postMedia.videoThumbnailUrl,
          mediaUrls.videoThumbnail,
          '字幕だけを編集した後も動画のサムネイルの参照を維持しています。'
        );
      });
      openGalleryAndCapture(browser, videoSubtitleEditedText, 'video', (galleryMedia) => {
        browser.assert.equal(
          galleryMedia.videoUrl,
          mediaUrls.video,
          '字幕だけを編集した後も動画の参照を維持しています。'
        );
        browser.assert.ok(
          galleryMedia.subtitleUrl !== originalSubtitleUrl,
          '字幕だけを編集すると字幕の参照が変わります。'
        );
        mediaUrls.subtitle = galleryMedia.subtitleUrl;
      });
      resetTimelineDocument(browser, state, '動画メディアの表示を初期化');
      browser.perform(() => {
        assertMediaUrlsStatus(
          browser,
          [mediaUrls.videoThumbnail, mediaUrls.video, mediaUrls.subtitle],
          200,
          '字幕だけを更新したメディア'
        );
        assertBackendMediaAvailable(
          browser,
          [mediaUrls.videoThumbnail, mediaUrls.video, mediaUrls.subtitle],
          '字幕だけの更新後にバックエンドで維持したメディア'
        );
        assertBackendMediaUnavailable(browser, [originalSubtitleUrl], 'バックエンドで差し替えた古い字幕メディア');
      });

      createAudioPost(browser, {
        text: audioText,
        audioPath: AUDIO_PATH,
        title: audioTitle,
        description: audioDescription,
      });
      capturePostMedia(browser, audioText, (postMedia) => {
        mediaUrls.audio = postMedia.audioUrl;
        browser.assert.ok(!!mediaUrls.audio, '音声のURLを取得しました。');
        browser.assert.equal(postMedia.audioTitle, audioTitle, '音声のタイトルが表示されています。');
        browser.assert.equal(postMedia.audioDescription, audioDescription, '音声の説明が表示されています。');
      });
      browser.perform(() => {
        assertMediaUrlsStatus(browser, [mediaUrls.audio], 200, '作成した音声メディア');
        assertBackendMediaAvailable(browser, [mediaUrls.audio], 'バックエンドで作成した音声メディア');
      });

      deletePost(browser, imageEditedText);
      deletePost(browser, videoSubtitleEditedText);
      deletePost(browser, audioText);
      resetTimelineDocument(browser, state, '削除したメディアの表示を初期化');
      browser.perform(() => {
        assertBackendMediaUnavailable(
          browser,
          [
            mediaUrls.imageThumbnail,
            mediaUrls.image,
            mediaUrls.videoThumbnail,
            mediaUrls.video,
            mediaUrls.subtitle,
            mediaUrls.audio,
          ],
          'バックエンドで削除したタイムラインのメディア'
        );
      });

      browser.perform(() => finish());
    });
  },
};
