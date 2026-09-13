import { afterEach, expect, vi } from 'vitest';

const {
  captureInviteUrl,
  createInviteUrl,
  normalizeInviteUrl,
} = require('../../e2e/specs/helpers/invite-ui-helpers');

const browser = { launchUrl: 'http://localhost:3100' };

describe('E2Eの招待画面操作', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it.each(['floor', 'room'])('%s招待の現行期間と表示中の作成操作を検査する', (kind) => {
    document.body.innerHTML = `
      <section role="dialog">
        <h2 id="invite_${kind}_member_dialog_title">招待</h2>
        <select id="invite_${kind}_member_period"><option value="8h">8時間</option></select>
        <button style="display:none" data-testid="dialog-invite-${kind}-member-create-button">作成</button>
        <button data-testid="dialog-invite-${kind}-member-create-button">作成</button>
      </section>`;
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}]);
    const buttons = document.querySelectorAll('button');
    const hiddenClick = vi.spyOn(buttons[0], 'click');
    const visibleClick = vi.spyOn(buttons[1], 'click');
    const testBrowser = {
      execute(script, args, callback) { callback({ value: script(...args) }); },
      assert: { ok: vi.fn() },
    };

    createInviteUrl(testBrowser, kind);

    expect(visibleClick).toHaveBeenCalledTimes(1);
    expect(hiddenClick).not.toHaveBeenCalled();
    expect(testBrowser.assert.ok.mock.calls[0][0]).to.equal(true);
  });

  it('期間が期待値と異なる場合は招待URLを作成しない', () => {
    document.body.innerHTML = `
      <section role="dialog">
        <h2 id="invite_floor_member_dialog_title">招待</h2>
        <select id="invite_floor_member_period"><option value="1d">1日</option></select>
        <button data-testid="dialog-invite-floor-member-create-button">作成</button>
      </section>`;
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}]);
    const click = vi.spyOn(document.querySelector('button'), 'click');
    const testBrowser = {
      execute(script, args, callback) { callback({ value: script(...args) }); },
      assert: { ok: vi.fn() },
    };

    createInviteUrl(testBrowser, 'floor');

    expect(click).not.toHaveBeenCalled();
    expect(testBrowser.assert.ok.mock.calls[0][0]).to.equal(false);
  });

  it('相対招待URLを専用フロントエンドオリジンへ解決する', () => {
    expect(normalizeInviteUrl(browser, '/floor/floor-id/invite/dummy-token')).to.equal(
      'http://localhost:3100/floor/floor-id/invite/dummy-token'
    );
  });

  it('同一オリジンの絶対招待URLだけを維持する', () => {
    expect(normalizeInviteUrl(browser, 'http://localhost:3100/floor/floor-id/invite/dummy-token')).to.equal(
      'http://localhost:3100/floor/floor-id/invite/dummy-token'
    );
    expect(() =>
      normalizeInviteUrl(browser, 'http://localhost:5100/floor/floor-id/invite/dummy-token')
    ).to.throw('招待URLにはE2E用フロントエンドの専用オリジンを使用してください。');
  });

  it.each([
    ['読取専用の入力欄', '<input id="invite-url" readonly value="/invite/input-token">'],
    ['テキスト要素', '<div id="invite-url">/invite/text-token</div>'],
  ])('%sから招待URLを取得する', (_label, markup) => {
    document.body.innerHTML = markup;
    const captured = [];
    const testBrowser = {
      execute(script, args, callback) {
        callback({ value: script(...args) });
      },
      assert: { ok: vi.fn() },
      pause: vi.fn(),
    };

    captureInviteUrl(testBrowser, '#invite-url', 'ルーム', (value) => captured.push(value));

    expect(captured).to.deep.equal([
      markup.startsWith('<input') ? '/invite/input-token' : '/invite/text-token',
    ]);
    expect(testBrowser.assert.ok).toHaveBeenCalledWith(true, 'ルームの招待URLを取得しました。');
    expect(testBrowser.pause).not.toHaveBeenCalled();
  });
});
