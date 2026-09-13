import { expect } from 'vitest';
import publicRoutes from '@/routes/public';

describe('公開画面のルート定義', () => {
  const staticDocumentRoutes = [
    ['Terms', '/terms', '利用許諾・著作権・禁止事項・免責事項', 'terms'],
    ['Privacy', '/privacy', 'プライバシーポリシー', 'privacy'],
    ['CookiePolicy', '/cookie', 'Cookieポリシー', 'cookie'],
    ['Accessibility', '/accessibility', 'アクセシビリティ', 'accessibility'],
    ['Contact', '/contact', 'お問い合わせ', 'contact'],
  ];

  it('公開対象ルートにはisPublicが設定されている', () => {
    const authenticatedRouteNames = ['ChangePassword'];

    publicRoutes
      .filter((route) => !authenticatedRouteNames.includes(route.name))
      .forEach((route) => {
        expect(route.meta && route.meta.isPublic).to.equal(true);
      });
  });

  it('ChangePasswordは認証必須である', () => {
    const route = publicRoutes.find((candidate) => candidate.name === 'ChangePassword');

    expect(route && route.meta && route.meta.requiresAuth).to.equal(true);
    expect(route && route.meta && route.meta.isPublic).to.not.equal(true);
  });

  it('プロフィールは独立ルートを持たない', () => {
    expect(publicRoutes.some((route) => route.name === 'Profile' || route.path === '/profile')).to.equal(false);
  });

  it('コンポーネントは動的 import 関数で定義されている', () => {
    publicRoutes.forEach((route) => {
      expect(typeof route.component).to.equal('function');
    });
  });


  it('Cookieポリシーを認証不要の固定パスで公開する', () => {
    const route = publicRoutes.find((candidate) => candidate.name === 'CookiePolicy');

    expect(route.path).to.equal('/cookie');
    expect(route.meta).to.deep.equal({
      isPublic: true,
      title: 'Cookieポリシー',
      staticContentName: 'cookie',
    });
  });

  it('プライバシーポリシーを認証不要の固定パスで公開する', () => {
    const route = publicRoutes.find((candidate) => candidate.name === 'Privacy');

    expect(route.path).to.equal('/privacy');
    expect(route.meta).to.deep.equal({
      isPublic: true,
      title: 'プライバシーポリシー',
      staticContentName: 'privacy',
    });
  });

  it('5種類の静的文書を共通画面と文書情報で公開する', () => {
    const routes = staticDocumentRoutes.map(([name]) =>
      publicRoutes.find((candidate) => candidate.name === name));
    const sharedComponent = routes[0].component;

    routes.forEach((route, index) => {
      const [name, path, title, staticContentName] = staticDocumentRoutes[index];
      expect(route.name).to.equal(name);
      expect(route.path).to.equal(path);
      expect(route.component).to.equal(sharedComponent);
      expect(route.meta).to.deep.equal({ isPublic: true, title, staticContentName });
    });
  });
});
