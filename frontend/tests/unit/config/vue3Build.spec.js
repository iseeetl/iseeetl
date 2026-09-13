import { describe, expect, it } from 'vitest';
import {
  parseArguments,
  resolveBuildRequest,
} from '../../../scripts/vue3-build-contract.mjs';

const releaseCommit = 'a'.repeat(40);

describe('フロントエンドのビルド設定', () => {
  it('開発ビルドはリリース情報を付けずに構成する', () => {
    const request = resolveBuildRequest(parseArguments(['--mode', 'development']));

    expect(request.kind).to.equal('local');
    expect(request.mode).to.equal('development');
    expect(request.releaseTag).to.equal(null);
    expect(request.releaseCommit).to.equal(null);
    expect(request.releaseId).to.match(/^local@development@/);
  });

  it('ステージングビルドはリリース情報を付けずに構成する', () => {
    const request = resolveBuildRequest(parseArguments(['--mode', 'staging']));

    expect(request.kind).to.equal('local');
    expect(request.mode).to.equal('staging');
    expect(request.releaseTag).to.equal(null);
    expect(request.releaseCommit).to.equal(null);
    expect(request.releaseId).to.match(/^local@staging@/);
  });

  it('指定されたタグとコミットを本番ビルドのリリース情報にする', () => {
    const request = resolveBuildRequest(
      parseArguments([
        '--mode',
        'production',
        '--release-tag',
        'v2.0.0',
        '--release-commit',
        releaseCommit,
      ])
    );

    expect(request).to.deep.equal({
      mode: 'production',
      kind: 'release',
      releaseTag: 'v2.0.0',
      releaseCommit,
      releaseId: `v2.0.0@${releaseCommit}`,
    });
  });

  it('リリースのタグとコミットの片方だけが指定された場合は拒否する', () => {
    expect(() =>
      resolveBuildRequest(
        parseArguments(['--mode', 'production', '--release-tag', 'v2.0.0'])
      )
    ).to.throw('リリースのタグとコミットを両方指定してください');
  });

  it('開発モードへのリリース情報の指定を拒否する', () => {
    expect(() =>
      resolveBuildRequest(
        parseArguments([
          '--mode',
          'development',
          '--release-tag',
          'v2.0.0',
          '--release-commit',
          releaseCommit,
        ])
      )
    ).to.throw('リリース情報を指定する場合はproductionモードを使用してください');
  });

  it('ビルド時に未知の引数を受け付けない', () => {
    expect(() =>
      parseArguments(['--mode', 'development', '--unsupported-option', 'value'])
    ).to.throw('未対応・重複・値のない引数があります');
  });
});
