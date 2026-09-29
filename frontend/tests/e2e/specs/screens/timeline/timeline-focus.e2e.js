const { createApiActor, createFloorRoomFixture } = require('../../helpers/api-fixture');
const { loginByForm } = require('../../helpers/session-helpers');
const { clearBrowserSession } = require('../../helpers/auth-security');
const { getBaseUrl, navigateToApp, requireEnv } = require('../../helpers/login');
const { closeSoundCautionIfVisible } = require('../../helpers/invite-ui-helpers');
const { sendKeysToActiveElement } = require('../../helpers/dialog-focus');

const luminance = (rgb) => rgb.map((value) => {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);

module.exports = {
  '固定投稿のフォーカス枠が通常幅とスマートフォン幅で背景から見分けられる': (browser) => {
    let target;
    let post;
    browser.perform(async () => {
      const actor = await createApiActor(browser, 'E2E_FLOOR_EDITOR');
      target = await createFloorRoomFixture(actor, 'focus');
      post = await actor.request(`/api/rooms/${target.roomId}/timeline/posts`, {
        content: 'フォーカス枠の確認用投稿', lang: 'ja',
      }, { status: 201 });
    });
    clearBrowserSession(browser);
    loginByForm(browser, {
      mail: requireEnv('E2E_FLOOR_EDITOR_MAIL'), password: requireEnv('E2E_FLOOR_EDITOR_PASSWORD'),
    });
    closeSoundCautionIfVisible(browser);
    browser.perform(() => navigateToApp(browser,
      `${getBaseUrl(browser)}/floor/${target.floorId}/room/${target.roomId}/post/${post._id}`));
    browser.waitForElementVisible('.focus-post-wrapper article', 10000);
    [1280, 390].forEach((width) => {
      browser.windowSize('current', width, 844);
      browser.execute(function () {
        document.querySelector('.focus-post-wrapper article').focus();
      });
      const assertOutline = (targetName, isArticle) => browser.execute(function (expectArticle) {
        const wrapper = document.querySelector('.focus-post-wrapper');
        const article = wrapper?.querySelector('article');
        const element = document.activeElement;
        if (!wrapper || !article ||
            (expectArticle ? element !== article : !article.contains(element) || element.tagName !== 'BUTTON')) {
          return { ready: false };
        }
        const parseColor = (color) => (color.match(/[\d.]+/g) || []).map(Number);
        const columnBackground = parseColor(getComputedStyle(wrapper.closest('.column')).backgroundColor);
        const overlay = parseColor(getComputedStyle(wrapper).backgroundColor);
        const background = columnBackground.slice(0, 3).map((value, index) =>
          overlay[index] * (overlay[3] ?? 1) + value * (1 - (overlay[3] ?? 1)));
        const style = getComputedStyle(element);
        return {
          ready: true, background,
          color: parseColor(style.outlineColor),
          width: style.outlineWidth,
          style: style.outlineStyle,
        };
      }, [isArticle], (result) => {
        const state = result.value;
        browser.assert.ok(state?.ready, `${width}px幅で${targetName}にフォーカスを移します。`);
        if (!state?.ready) return;
        browser.assert.equal(state.width, '2px', `${width}px幅で${targetName}のフォーカス枠は2pxです。`);
        browser.assert.equal(state.style, 'solid', `${width}px幅で${targetName}のフォーカス枠は実線です。`);
        const values = [luminance(state.color.slice(0, 3)), luminance(state.background)].sort((a, b) => b - a);
        browser.assert.ok((values[0] + 0.05) / (values[1] + 0.05) >= 3,
          `${width}px幅でフォーカス枠と実際の背景のコントラスト比が3対1以上です。`);
      });
      assertOutline('投稿', true);
      browser.perform((done) => {
        sendKeysToActiveElement(browser, browser.Keys.TAB, (state) => {
          browser.assert.ok(state.ok, '投稿内の操作ボタンへTabキーで移動します。');
          done();
        });
      });
      assertOutline('投稿内の操作ボタン', false);
    });
    browser.end();
  },
};
