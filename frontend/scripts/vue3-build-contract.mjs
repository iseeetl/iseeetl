import crypto from 'node:crypto';

const releaseTagPattern =
  /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;

const fail = (message) => {
  throw new Error(`[vue3-build] ${message}`);
};

export const parseArguments = (argumentsList) => {
  const allowed = new Set(['--mode', '--release-tag', '--release-commit']);
  const values = {};
  for (let index = 0; index < argumentsList.length; index += 2) {
    const key = argumentsList[index];
    const value = argumentsList[index + 1];
    if (
      !allowed.has(key) ||
      !value ||
      value.startsWith('--') ||
      Object.hasOwn(values, key)
    ) {
      fail('未対応・重複・値のない引数があります');
    }
    values[key] = value;
  }
  if (Object.keys(values).length * 2 !== argumentsList.length) {
    fail('各引数に値を1つ指定してください');
  }
  return values;
};

const createRunId = () =>
  `${new Date().toISOString().replace(/[-:.]/g, '')}-${crypto
    .randomBytes(4)
    .toString('hex')}`;

export const resolveBuildRequest = (values) => {
  const mode = values['--mode'];
  if (!['development', 'staging', 'production'].includes(mode)) fail('対応していないビルドモードです');

  const releaseTag = values['--release-tag'];
  const releaseCommit = values['--release-commit'];
  if (Boolean(releaseTag) !== Boolean(releaseCommit)) {
    fail('リリースのタグとコミットを両方指定してください');
  }
  if (releaseTag) {
    if (mode !== 'production') fail('リリース情報を指定する場合はproductionモードを使用してください');
    if (!releaseTagPattern.test(releaseTag)) fail('リリースタグの形式が不正です');
    if (!/^[0-9a-f]{40}$/.test(releaseCommit)) fail('リリースのコミットIDの形式が不正です');
    return {
      mode,
      kind: 'release',
      releaseTag,
      releaseCommit,
      releaseId: `${releaseTag}@${releaseCommit}`,
    };
  }

  const runId = createRunId();
  return {
    mode,
    kind: 'local',
    releaseTag: null,
    releaseCommit: null,
    releaseId: `local@${mode}@${runId}`,
  };
};
