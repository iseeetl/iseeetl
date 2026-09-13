import { createRequire } from 'node:module';
import fs from 'node:fs';
import { expect } from 'vitest';

const require = createRequire(import.meta.url);
const {
  ACCOUNT_KEYS,
  E2E_ENV_FILE,
  NIGHTWATCH_ENV_KEYS,
  loadE2EAccountEnvironment,
} = require('../../../scripts/e2e-account-environment');

const regularFile = { isFile: () => true, isSymbolicLink: () => false };
const buildEnvironmentFile = (keys = NIGHTWATCH_ENV_KEYS) =>
  [
    ...keys.map((key) => `${key}=dummy-${key.toLowerCase()}`),
    'DB_CONNECT=must-not-be-copied',
    'JWT_SECRET=must-not-be-copied',
  ].join('\n');
const loadFixture = ({ environment = {}, keys, ...overrides } = {}) =>
  loadE2EAccountEnvironment({
    environment,
    readFile: () => buildEnvironmentFile(keys),
    lstat: () => regularFile,
    realpath: () => E2E_ENV_FILE,
    ...overrides,
  });

describe('E2Eアカウント設定の読込', () => {
  it('公開設定例から、ローカル設定に依存せずアカウント項目を読み込む', () => {
    const environment = {};

    loadFixture({
      environment,
      readFile: () => fs.readFileSync(`${E2E_ENV_FILE}.example`, 'utf8'),
    });

    NIGHTWATCH_ENV_KEYS.forEach((key) => {
      expect(environment[key]).to.be.a('string').and.not.equal('');
    });
  });

  it('E2E設定から固定アカウントとMailpit APIの項目だけを取り込む', () => {
    const environment = {
      DB_CONNECT: 'ambient-database-value',
      JWT_SECRET: 'ambient-jwt-value',
    };

    loadFixture({ environment });

    expect(ACCOUNT_KEYS).to.deep.equal([
      'E2E_ADMIN_MAIL',
      'E2E_ADMIN_PASSWORD',
      'E2E_FLOOR_EDITOR_MAIL',
      'E2E_FLOOR_EDITOR_PASSWORD',
      'E2E_USER_MAIL',
      'E2E_USER_PASSWORD',
    ]);
    NIGHTWATCH_ENV_KEYS.forEach((key) => {
      expect(environment[key]).to.equal(`dummy-${key.toLowerCase()}`);
    });
    expect(environment.DB_CONNECT).to.equal('ambient-database-value');
    expect(environment.JWT_SECRET).to.equal('ambient-jwt-value');
  });

  it.each(NIGHTWATCH_ENV_KEYS)('必須のE2E設定値%sがなければ拒否する', (missingKey) => {
    const keys = NIGHTWATCH_ENV_KEYS.filter((key) => key !== missingKey);

    expect(() => loadFixture({ keys }))
      .to.throw(`backend/.env.e2eの設定が不足しています: ${missingKey}。`);
  });

  it('別の設定ファイル・存在しないファイル・シンボリックリンクを拒否する', () => {
    expect(() => loadFixture({ envFilePath: `${E2E_ENV_FILE}.example` }))
      .to.throw('フロントエンドのE2Eにはbackend/.env.e2eを使用してください。');
    expect(() => loadFixture({ envFilePath: `${E2E_ENV_FILE}.local` }))
      .to.throw('フロントエンドのE2Eにはbackend/.env.e2eを使用してください。');
    expect(() => loadFixture({ lstat: () => { throw new Error('missing'); } }))
      .to.throw('backend/.env.e2eが通常ファイルとして必要です。');
    expect(() => loadFixture({
      lstat: () => ({ isFile: () => false, isSymbolicLink: () => true }),
    })).to.throw('backend/.env.e2eが通常ファイルとして必要です。');
    expect(() => loadFixture({ realpath: () => `${E2E_ENV_FILE}.outside` }))
      .to.throw('backend/.env.e2eが通常ファイルとして必要です。');
  });

  it('設定ファイルがない場合は設定例からの作成を案内し、自動読込しない', () => {
    let readCount = 0;
    expect(() => loadFixture({
      lstat: () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); },
      readFile: () => { readCount += 1; return buildEnvironmentFile(); },
    })).to.throw('backend/.env.e2eがありません。.env.e2e.exampleをコピーし、E2E環境に合わせて設定してください。');
    expect(readCount).to.equal(0);
  });

  it('解析エラーに設定ファイルの内容を含めない', () => {
    const value = 'sensitive-dummy-value';
    let thrownError;

    try {
      loadFixture({ parse: () => { throw new Error(value); } });
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).to.be.an('error');
    expect(thrownError.message).to.equal('backend/.env.e2eを読み取れないか、解析できませんでした。');
    expect(thrownError.message).not.to.contain(value);
  });
});
