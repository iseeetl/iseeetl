import { expect } from 'vitest';
import manifestApi from '../../../public/web-app-manifest';
import homeManifest from '../../../public/manifest.json';
import shortcutManifest from '../../../public/shortcut-manifest.json';

const FLOOR_ID = '0123456789abcdef01234567';
const ROOM_ID = '89abcdef0123456701234567';
const IOS_SAFARI_NAVIGATOR = {
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
  maxTouchPoints: 5,
  standalone: false,
};

const createTestDocument = () => document.implementation.createHTMLDocument('manifest test');
const browserMode = () => ({ matches: false });

describe('ホーム画面追加用マニフェスト', () => {
  it('ホームではホーム用manifestを返す', () => {
    const href = manifestApi.resolveManifestHref({ pathname: '/', search: '', hash: '' });

    expect(href).to.equal('/manifest.json');
  });

  it('フロアでは対象パス付きのショートカット用manifestを返す', () => {
    const pathname = `/floor/${FLOOR_ID}`;
    const href = manifestApi.resolveManifestHref({ pathname, search: '', hash: '' });

    expect(href).to.equal(`/shortcut-manifest.json?target=${encodeURIComponent(pathname)}`);
  });

  it('ルームでは対象パス付きのショートカット用manifestを返す', () => {
    const pathname = `/floor/${FLOOR_ID}/room/${ROOM_ID}`;
    const href = manifestApi.resolveManifestHref({ pathname, search: '', hash: '' });

    expect(href).to.equal(`/shortcut-manifest.json?target=${encodeURIComponent(pathname)}`);
  });

  it('投稿詳細ではホーム用manifestへ戻す', () => {
    const pathname = `/floor/${FLOOR_ID}/room/${ROOM_ID}/post/${ROOM_ID}`;
    const href = manifestApi.resolveManifestHref({ pathname, search: '', hash: '' });

    expect(href).to.equal('/manifest.json');
  });

  it('MongoDB ID形式でないパスではホーム用manifestへ戻す', () => {
    const href = manifestApi.resolveManifestHref({
      pathname: '/floor/not-a-mongo-id',
      search: '',
      hash: '',
    });

    expect(href).to.equal('/manifest.json');
  });

  it('クエリまたはハッシュ付きURLではホーム用manifestへ戻す', () => {
    const pathname = `/floor/${FLOOR_ID}`;

    expect(manifestApi.resolveManifestHref({ pathname, search: '?page=1', hash: '' })).to.equal('/manifest.json');
    expect(manifestApi.resolveManifestHref({ pathname, search: '', hash: '#section' })).to.equal('/manifest.json');
  });

  it('manifestリンクが無い場合は生成して対象URLを設定する', () => {
    const testDocument = document.implementation.createHTMLDocument('manifest test');
    const pathname = `/floor/${FLOOR_ID}`;

    const href = manifestApi.updateManifestLink(testDocument, { pathname, search: '', hash: '' });
    const link = testDocument.getElementById('web-app-manifest');

    expect(link).to.not.equal(null);
    expect(link.getAttribute('rel')).to.equal('manifest');
    expect(link.getAttribute('href')).to.equal(href);
  });

  it('既存のmanifestリンクをSPA遷移後のURLへ更新する', () => {
    const testDocument = document.implementation.createHTMLDocument('manifest test');
    const link = testDocument.createElement('link');
    link.id = 'web-app-manifest';
    link.rel = 'manifest';
    link.href = '/manifest.json';
    testDocument.head.appendChild(link);

    const pathname = `/floor/${FLOOR_ID}/room/${ROOM_ID}`;
    const href = manifestApi.updateManifestLink(testDocument, { pathname, search: '', hash: '' });

    expect(testDocument.querySelectorAll('link[rel="manifest"]')).to.have.lengthOf(1);
    expect(link.getAttribute('href')).to.equal(href);
  });

  it('iPhone Safariで初回ロード後にルーム用manifestへ変わった場合は再読み込み対象にする', () => {
    manifestApi.initializeManifestLink(createTestDocument(), { pathname: '/', search: '', hash: '' });
    const location = { pathname: '/floor/' + FLOOR_ID + '/room/' + ROOM_ID, search: '', hash: '' };

    expect(manifestApi.shouldReloadForManifest(location, IOS_SAFARI_NAVIGATOR, browserMode)).to.equal(true);
  });

  it('ルームURLを初回ロードした場合はiPhone Safariでも再読み込みしない', () => {
    const location = { pathname: '/floor/' + FLOOR_ID + '/room/' + ROOM_ID, search: '', hash: '' };
    manifestApi.initializeManifestLink(createTestDocument(), location);

    expect(manifestApi.shouldReloadForManifest(location, IOS_SAFARI_NAVIGATOR, browserMode)).to.equal(false);
  });

  it('ホーム画面アプリではmanifestが変わっても再読み込みしない', () => {
    manifestApi.initializeManifestLink(createTestDocument(), { pathname: '/', search: '', hash: '' });
    const location = { pathname: '/floor/' + FLOOR_ID, search: '', hash: '' };

    expect(
      manifestApi.shouldReloadForManifest(location, { ...IOS_SAFARI_NAVIGATOR, standalone: true }, browserMode)
    ).to.equal(false);
    expect(manifestApi.shouldReloadForManifest(location, IOS_SAFARI_NAVIGATOR, () => ({ matches: true }))).to.equal(
      false
    );
  });

  it('iOS以外のSafariではmanifestが変わっても再読み込みしない', () => {
    manifestApi.initializeManifestLink(createTestDocument(), { pathname: '/', search: '', hash: '' });
    const macSafariNavigator = {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
      maxTouchPoints: 0,
      standalone: false,
    };

    expect(
      manifestApi.shouldReloadForManifest(
        { pathname: '/floor/' + FLOOR_ID, search: '', hash: '' },
        macSafariNavigator,
        browserMode
      )
    ).to.equal(false);
  });

  it('ホーム用とショートカット用manifestで共通IDと対象範囲を使用する', () => {
    expect(homeManifest.start_url).to.equal('/');
    expect(homeManifest.id).to.equal('/');
    expect(homeManifest.scope).to.equal('/');
    expect(shortcutManifest).to.not.have.property('start_url');
    expect(shortcutManifest.id).to.equal('/');
    expect(shortcutManifest.scope).to.equal('/');
  });
});
