const { makeFileInputInteractable } = require('./timeline-media-lifecycle');

// 再表示後も画像が保存されていることを確認できるよう、元のURLをNode.js側で保持する。
const exerciseImageReplacementCancel = (browser, filePath) => {
  const state = { original: '' };
  browser.waitForElementVisible('.image-uploaded-wrapper img', 10000);
  browser.getAttribute('.image-uploaded-wrapper img', 'src', (result) => { state.original = result.value; });
  for (let selection = 0; selection < 2; selection += 1) {
    makeFileInputInteractable(browser, '[role="dialog"] input[type="file"]');
    browser.setValue('[role="dialog"] input[type="file"]', filePath)
      .waitForElementVisible('.image-preview-wrapper img', 10000);
    browser.execute(function () {
      const image = document.querySelector('.image-preview-wrapper img');
      const button = document.querySelector('.image-preview-wrapper .image-remove-button');
      const imageRect = image.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      return buttonRect.top >= imageRect.bottom - 1 && button.textContent.includes('差し替えを取り消す');
    }, [], (result) => browser.assert.ok(result.value, '差し替えのキャンセルにラベルがあり、プレビューの下に表示されています。'));
    browser.click('.image-preview-wrapper .image-remove-button')
      .waitForElementVisible('.image-uploaded-wrapper img', 10000);
    browser.execute(function () {
      const input = document.querySelector('[role="dialog"] input[type="file"]');
      return input.files.length;
    }, [], (result) => browser.assert.equal(result.value, 0, 'キャンセルでファイル入力が空になり、同じファイルを再選択できます。'));
    assertOriginalImage(browser, state);
  }
  return state;
};

const assertOriginalImage = (browser, state) => {
  browser.waitForElementVisible('.image-uploaded-wrapper img', 10000)
    .getAttribute('.image-uploaded-wrapper img', 'src', (result) => {
      browser.assert.ok(Boolean(state.original) && result.value === state.original, '保存済みの元の画像を維持しています。');
    });
};

module.exports = { exerciseImageReplacementCancel, assertOriginalImage };
