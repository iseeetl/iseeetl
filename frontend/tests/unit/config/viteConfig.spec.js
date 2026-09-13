import path from 'node:path';
import fs from 'node:fs';
import { parseEnv } from 'node:util';

import { expect } from 'vitest';
import viteConfigFactory from '../../../vite.config';

const checkoutRoot = path.resolve(__dirname, '../../../..');
const outsideCheckoutRuntime = path.join(path.dirname(checkoutRoot), 'outside-e2e-runtime');

const {
  e2eApplicationEntryUrl,
  e2eBuildOutput,
  e2eRuntimeRoot,
  productApplicationEntryUrl,
  validateE2EBuildOutput,
} = viteConfigFactory;
const regularDirectory = {
  isDirectory: () => true,
  isSymbolicLink: () => false,
};
let testEnvironment = {};
const loadTestEnvironment = () => ({ ...testEnvironment });
const createTestViteConfig = (options = {}) =>
  viteConfigFactory({ ...options, loadEnvironment: loadTestEnvironment });

const viteConfig = await createTestViteConfig({ command: 'serve', mode: 'test' });
const proxy = viteConfig.server.proxy;

const withE2EServerEnvironment = async (
  { port, target, appUrl = 'http://localhost:3100' },
  callback
) => {
  const originalEnvironment = testEnvironment;
  testEnvironment = {
    VITE_SERVER_PORT: port,
    VITE_BACKEND_PROXY_TARGET: target,
    ...(appUrl === undefined ? {} : { VITE_APP_URL: appUrl }),
  };

  try {
    await callback();
  } finally {
    testEnvironment = originalEnvironment;
  }
};

describe('Viteの設定', () => {
  it('公開設定例からE2Eのポートと転送先を構成できる', async () => {
    const example = parseEnv(fs.readFileSync(path.resolve(__dirname, '../../../.env.e2e.example'), 'utf8'));
    const configured = await viteConfigFactory({
      command: 'serve', mode: 'e2e', loadEnvironment: () => example,
    });
    expect(configured.preview.port).to.equal(3100);
    expect(configured.preview.proxy['^/api(?:/|$)'].target).to.equal('http://127.0.0.1:5100');
  });

  it('E2Eビルド前に実行用ディレクトリを作成し、未作成の出力先も使える', () => {
    const existingPaths = new Set();
    const createdPaths = [];

    const result = validateE2EBuildOutput({
      exists: (targetPath) => existingPaths.has(targetPath),
      mkdir: (targetPath) => {
        existingPaths.add(targetPath);
        createdPaths.push(targetPath);
      },
      lstat: () => regularDirectory,
      realpath: (targetPath) => targetPath,
    });

    expect(result).to.equal(e2eBuildOutput);
    expect(createdPaths).to.deep.equal([e2eRuntimeRoot]);
  });

  it('E2Eのビルド出力先がシンボリックリンクなら拒否する', () => {
    expect(() =>
      validateE2EBuildOutput({
        exists: () => true,
        mkdir: () => undefined,
        lstat: (targetPath) =>
          targetPath === e2eBuildOutput
            ? { isDirectory: () => false, isSymbolicLink: () => true }
            : regularDirectory,
        realpath: (targetPath) => targetPath,
      })
    ).to.throw('E2Eのビルド出力先には、リポジトリ内の実ディレクトリを指定してください。');
  });

  it('リポジトリの外を指すE2E実行用ディレクトリを拒否する', () => {
    expect(() =>
      validateE2EBuildOutput({
        exists: () => true,
        mkdir: () => undefined,
        lstat: () => regularDirectory,
        realpath: (targetPath) =>
          targetPath === e2eRuntimeRoot ? outsideCheckoutRuntime : targetPath,
      })
    ).to.throw('E2Eのビルド出力先には、リポジトリ内の実ディレクトリを指定してください。');
  });

  it('Vite標準のpublicディレクトリを配信・ビルド対象にする', () => {
    expect(viteConfig.publicDir).to.equal('public');
    expect(viteConfig.build.copyPublicDir).to.equal(true);
  });

  it('特定の作業ディレクトリのキャッシュディレクトリへ依存しない', () => {
    expect(viteConfig).to.not.have.own.property('cacheDir');
  });

  it('実行環境が明示したキャッシュディレクトリを使用できる', async () => {
    const configured = await createTestViteConfig({
      command: 'build',
      mode: 'development',
      cacheDir: '.cache/vite-test',
    });

    expect(configured.cacheDir).to.equal('.cache/vite-test');
  });

  it('モード別のVITE公開設定を許可リストだけへ注入する', async () => {
    const originalEnvironment = testEnvironment;
    testEnvironment = {
      VITE_GOOGLE_OAUTH_CLIENT_ID: 'unit-google-client-id',
      VITE_GOOGLE_ANALYTICS_ENABLED: 'true',
      VITE_GOOGLE_ANALYTICS_MEASUREMENT_ID: 'G-UNIT1234',
      VITE_SUPPORT_USER_ID: 'legacy-support-user',
      VITE_UNAPPROVED_VALUE: 'must-not-be-exposed',
    };

    try {
      const configured = await createTestViteConfig({ command: 'serve', mode: 'development' });

      expect(JSON.parse(configured.define['import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID'])).to.equal(
        'unit-google-client-id'
      );
      expect(configured.define).to.not.have.own.property('import.meta.env.VITE_UNAPPROVED_VALUE');
      expect(configured.define).to.not.have.own.property(
        'import.meta.env.VITE_GOOGLE_ANALYTICS_ENABLED'
      );
      expect(configured.define).to.not.have.own.property(
        'import.meta.env.VITE_GOOGLE_ANALYTICS_MEASUREMENT_ID'
      );
      expect(configured.define).to.not.have.own.property('import.meta.env.VITE_SUPPORT_USER_ID');
      expect(configured.envDir).to.equal(false);
    } finally {
      testEnvironment = originalEnvironment;
    }
  });

  it('ステージングのビルドを本番と同じ設定で最適化する', async () => {
    const configured = await createTestViteConfig({ command: 'build', mode: 'staging' });

    expect(configured.build.minify).to.equal('oxc');
    expect(configured.build.cssMinify).to.equal('lightningcss');
  });

  it('コンテナ内のソース変更を定期的に検知し、E2E実行用ディレクトリを対象外にする', () => {
    expect(viteConfig.server.watch).to.deep.equal({
      usePolling: true,
      interval: 1000,
      ignored: [
        '**/public/media/**',
        '**/public/profile/**',
        '**/public/upload/**',
      ],
    });
  });

  it('開発モードでは通常のフロントエンドポートとバックエンドの転送先を使う', async () => {
    const configured = await createTestViteConfig({ command: 'serve', mode: 'development' });

    expect(configured.server.port).to.equal(3000);
    expect(configured.server.hmr).to.deep.equal({ overlay: true });
    expect(configured.server.ws).to.deep.equal({ clientPort: 3000 });
    expect(configured.server.cors.origin.test('http://localhost:3000')).to.equal(true);
    expect(configured.server.cors.origin.test('http://localhost:3100')).to.equal(false);
    expect(configured.server.proxy['^/api(?:/|$)'].target).to.equal(
      'http://127.0.0.1:5000'
    );
    expect(configured.plugins.some(({ name }) => name === 'iseeetl-e2e-application-entry')).to.equal(
      false
    );
  });

  it('E2Eモードでは専用ポートとバックエンドの転送先を使う', async () => {
    let configured;
    await withE2EServerEnvironment(
      { port: '3100', target: 'http://127.0.0.1:5100' },
      async () => {
        configured = await createTestViteConfig({ command: 'serve', mode: 'e2e' });
      }
    );
    const e2eProxy = configured.server.proxy;

    expect(configured.server.port).to.equal(3100);
    expect(configured.server.hmr).to.deep.equal({ overlay: true });
    expect(configured.server.ws).to.deep.equal({ clientPort: 3100 });
    expect(configured.server.cors.origin.test('http://127.0.0.1:3100')).to.equal(true);
    expect(configured.server.cors.origin.test('http://127.0.0.1:3000')).to.equal(false);
    expect(e2eProxy['^/api(?:/|$)'].target).to.equal('http://127.0.0.1:5100');
    expect(e2eProxy['^/media/'].target).to.equal('http://127.0.0.1:5100');
    expect(e2eProxy['^/profile/'].target).to.equal('http://127.0.0.1:5100');
    expect(e2eProxy['^/socket\\.io(?:/|$)']).to.deep.equal({
      target: 'http://127.0.0.1:5100',
      ws: true,
      rewriteWsOrigin: false,
    });
    expect(configured.build.outDir).to.equal(
      path.resolve(__dirname, '../../../../.e2e-runtime/frontend-dist')
    );
    expect(configured.preview.port).to.equal(3100);
    expect(configured.preview.strictPort).to.equal(true);
    expect(configured.preview.allowedHosts).to.deep.equal(['localhost']);
    expect(configured.preview.proxy).to.deep.equal(e2eProxy);
    const applicationEntryPlugin = configured.plugins.find(
      ({ name }) => name === 'iseeetl-e2e-application-entry'
    );
    expect(applicationEntryPlugin).to.be.an('object');
    expect(
      applicationEntryPlugin.transformIndexHtml.handler(
        `<script type="module" src="${productApplicationEntryUrl}"></script>`
      )
    ).to.equal(`<script type="module" src="${e2eApplicationEntryUrl}"></script>`);
  });

  it('サーバ専用の環境変数をフロントエンドの公開設定に含めない', async () => {
    let configured;
    await withE2EServerEnvironment(
      { port: '3100', target: 'http://127.0.0.1:5100' },
      async () => {
        configured = await createTestViteConfig({ command: 'serve', mode: 'e2e' });
      }
    );

    expect(configured.define).to.not.have.own.property('import.meta.env.VITE_SERVER_PORT');
    expect(configured.define).to.not.have.own.property(
      'import.meta.env.VITE_BACKEND_PROXY_TARGET'
    );
  });

  it.each([
    'VITE_ONESIGNAL_APP_ID',
    'VITE_GOOGLE_OAUTH_CLIENT_ID',
  ])('E2Eモードでは親プロセス由来の公開外部サービス設定を拒否する: %s', async (key) => {
    const originalEnvironment = testEnvironment;
    testEnvironment = {
      VITE_SERVER_PORT: '3100',
      VITE_BACKEND_PROXY_TARGET: 'http://127.0.0.1:5100',
      VITE_APP_URL: 'http://localhost:3100',
      [key]: 'inherited-provider-setting',
    };

    try {
      await expect(
        createTestViteConfig({ command: 'build', mode: 'e2e' })
      ).rejects.toThrow(`E2Eモードでは外部サービスの公開設定を空にしてください: ${key}`);
    } finally {
      testEnvironment = originalEnvironment;
    }
  });

  it.each(['', 'invalid', '0', '65536', '3100.5'])(
    'E2Eモードの不正なフロントエンドポートを拒否する: %s',
    async (port) => {
      await withE2EServerEnvironment(
        { port, target: 'http://127.0.0.1:5100' },
        async () => {
          await expect(
            createTestViteConfig({ command: 'serve', mode: 'e2e' })
          ).rejects.toThrow('VITE_SERVER_PORTには1～65535の整数を指定してください');
        }
      );
    }
  );

  it.each(['3000', '3101', '65535'])(
    'E2Eモードではフロントエンドポートを3100へ固定する: %s',
    async (port) => {
      await withE2EServerEnvironment(
        { port, target: 'http://127.0.0.1:5100' },
        async () => {
          await expect(
            createTestViteConfig({ command: 'serve', mode: 'e2e' })
          ).rejects.toThrow('E2EモードではVITE_SERVER_PORTに3100を指定してください');
        }
      );
    }
  );

  it.each([
    '',
    'invalid',
    'ftp://127.0.0.1:5100',
    'http://user@127.0.0.1:5100',
    'http://127.0.0.1:5100/path',
  ])(
    'E2Eモードの不正なバックエンドの転送先を拒否する: %s',
    async (target) => {
      await withE2EServerEnvironment({ port: '3100', target }, async () => {
        await expect(createTestViteConfig({ command: 'serve', mode: 'e2e' })).rejects.toThrow(
          'VITE_BACKEND_PROXY_TARGETにはHTTP(S)のオリジンを指定してください'
        );
      });
    }
  );

  it.each(['', 'http://localhost:3000', 'http://127.0.0.1:3100', 'https://example.invalid'])(
    'E2Eモードでは公開フロントエンドURLをhttp://localhost:3100に固定する: %s',
    async (appUrl) => {
      await withE2EServerEnvironment(
        { port: '3100', target: 'http://127.0.0.1:5100', appUrl },
        async () => {
          await expect(createTestViteConfig({ command: 'serve', mode: 'e2e' })).rejects.toThrow(
            'E2EモードではVITE_APP_URLにhttp://localhost:3100を指定してください'
          );
        }
      );
    }
  );

  it.each([
    'http://127.0.0.1:5000',
    'http://localhost:5100',
    'https://127.0.0.1:5100',
    'https://example.invalid',
  ])(
    'E2Eモードではバックエンドの転送先をhttp://127.0.0.1:5100に固定する: %s',
    async (target) => {
      await withE2EServerEnvironment({ port: '3100', target }, async () => {
        await expect(createTestViteConfig({ command: 'serve', mode: 'e2e' })).rejects.toThrow(
          'E2EモードではVITE_BACKEND_PROXY_TARGETにhttp://127.0.0.1:5100を指定してください'
        );
      });
    }
  );

  it('/profile/配下だけをバックエンドへ転送する', () => {
    expect(proxy['^/profile/'].target).to.equal('http://127.0.0.1:5000');
  });

  it('/profileの完全一致パスを転送対象にしない', () => {
    expect(proxy).to.not.have.own.property('/profile');
    expect(proxy).to.not.have.own.property('^/profile$');
  });

  it('/media/配下をバックエンドへ転送する', () => {
    expect(proxy['^/media/'].target).to.equal('http://127.0.0.1:5000');
  });

  it('/apiとSocket.IOを同じバックエンドへ転送し、Socket.IOのWebSocket接続を維持する', () => {
    expect(proxy['^/api(?:/|$)'].target).to.equal('http://127.0.0.1:5000');
    expect(proxy['^/socket\\.io(?:/|$)']).to.deep.equal({
      target: 'http://127.0.0.1:5000',
      ws: true,
      rewriteWsOrigin: false,
    });
  });
});
