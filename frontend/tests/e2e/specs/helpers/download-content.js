const fs = require('node:fs');
const path = require('node:path');
const { createApiActor, createFloorRoomFixture } = require('./api-fixture');

const prepareExportContent = async (browser, target, withMedia = false) => {
  const actor = await createApiActor(browser);
  const other = await createFloorRoomFixture(actor, 'export other');
  const content = `E2E export target ${target.roomId}`;
  const foreignContent = `E2E export other ${other.roomId}`;
  const media = [];
  for (const resource of [target, other]) {
    let uploaded = {};
    if (withMedia) {
      const form = new FormData();
      form.append('image_file', new Blob([fs.readFileSync(path.resolve(__dirname, '../../fixtures/images/sample-image.png'))], { type: 'image/png' }), 'sample-image.png');
      uploaded = await actor.request(`/api/rooms/${resource.roomId}/timeline/uploads/image`, form, { status: 201 });
    }
    const post = await actor.request(`/api/rooms/${resource.roomId}/timeline/posts`, {
      content: resource === target ? content : foreignContent, lang: 'ja',
      ...(withMedia ? { media: { image: { file_name: uploaded.image_name, thumbnail_name: uploaded.image_thumbnail_name } } } : {}),
    }, { status: 201 });
    media.push({ ...uploaded, postId: post._id });
  }
  const deleted = await actor.request(`/api/rooms/${target.roomId}/timeline/posts`, { content: 'E2E deleted export post', lang: 'ja' }, { status: 201 });
  await actor.request(`/api/rooms/${target.roomId}/timeline/posts/${deleted._id}`, undefined, { method: 'DELETE', status: 204 });
  return { content, foreignContent, media };
};

const installContentCapture = (browser, name) => {
  browser.execute(function (key) {
    const state = { created: false, clicked: false, revoked: false, ready: false, filename: '', bytes: [] };
    window[key] = state;
    const create = URL.createObjectURL;
    const revoke = URL.revokeObjectURL;
    const click = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = function (blob) {
      state.created = true;
      state.type = blob.type;
      blob.arrayBuffer().then((buffer) => {
        if (buffer.byteLength > 5 * 1024 * 1024) { state.error = 'テスト用のダウンロードサイズが上限を超えています'; }
        else state.bytes = Array.from(new Uint8Array(buffer));
        state.ready = true;
      }, () => { state.error = 'Blobを読み取れませんでした'; state.ready = true; });
      return create.call(URL, blob);
    };
    URL.revokeObjectURL = function (url) {
      state.revoked = true;
      revoke.call(URL, url);
      URL.createObjectURL = create;
      URL.revokeObjectURL = revoke;
      HTMLAnchorElement.prototype.click = click;
    };
    HTMLAnchorElement.prototype.click = function () {
      state.clicked = true;
      state.filename = this.download;
    };
  }, [name]);
};

const readCapturedDownload = (browser, name, verify, finish, attempt = 0) => {
  browser.execute(function (key) { return window[key]; }, [name], (result) => {
    const state = result.value || {};
    if (!(state.ready && state.clicked && state.revoked) && attempt < 40) {
      browser.pause(250, () => readCapturedDownload(browser, name, verify, finish, attempt + 1));
      return;
    }
    browser.assert.ok(state.ready && state.clicked && state.revoked && !state.error, 'ダウンロードが完了し、Blobを読み取れます。');
    if (state.ready && !state.error) verify(Buffer.from(state.bytes), state);
    finish();
  });
};

module.exports = { prepareExportContent, installContentCapture, readCapturedDownload };
