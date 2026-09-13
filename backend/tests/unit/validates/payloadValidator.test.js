const { buildReq, runValidators } = require('./_helpers');
const { ALLOWED_LANGUAGES } = require('../../../constants/languages');
const base = require('../../../validates/base.validate');
const media = require('../../../validates/media.validate');
const user = require('../../../validates/user.validate');
const auth = require('../../../validates/auth.validate');
const spam = require('../../../validates/spam.validate');
const member = require('../../../validates/member.validate');
const tag = require('../../../validates/tag.validate');
const room = require('../../../validates/room.validate');
const floor = require('../../../validates/floor.validate');
const pushFilter = require('../../../validates/pushFilter.validate');
const reaction = require('../../../validates/reaction.validate');
const { finalize, requireFiles } = require('../../../middlewares/validation');

const validators = {
  ...base,
  ...media,
  ...user,
  ...auth,
  ...spam,
  ...member,
  ...tag,
  ...room,
  ...floor,
  ...pushFilter,
  ...reaction,
  finalize,
  requireFiles,
};

let currentValidator = null;
let currentFileConfig = null;

const runValidation = async (body = {}) => {
  const req = buildReq({ body });
  const result = await runValidators(currentValidator, req);
  if (!result.isEmpty()) {
    return { status: 400, text: 'INVALID_PARAMS' };
  }
  return { status: 200, text: 'OK' };
};

const runFilesValidation = async () => {
  const fields = currentFileConfig?.fields || [];
  const files = currentFileConfig?.initialFiles || null;
  const missing = fields.filter((name) => !(files && Array.isArray(files[name]) && files[name].length > 0));
  if (missing.length) return { status: 400, text: 'INVALID_PARAMS' };
  return { status: 200, text: 'OK' };
};

const request = () => ({
  post: (path) => ({
    send: async (body) => {
      if (path === '/test') return runValidation(body);
      if (path === '/test-files') return runFilesValidation();
      return { status: 404, text: 'NOT_FOUND' };
    },
  }),
});

describe('リクエストの入力検証と確定処理', () => {
  let app;

  beforeEach(() => {
    app = {};
    currentValidator = null;
    currentFileConfig = null;
  });

  const createTestEndpoint = (validator) => {
    currentValidator = validator;
    currentFileConfig = null;
  };

  const createFilesEndpoint = (fields, initialFiles) => {
    currentFileConfig = { fields, initialFiles };
    currentValidator = null;
  };

  it('ページ番号が整数なら受け付ける', async () => {
    createTestEndpoint(validators.validatePage('page'));
    const res = await request(app).post('/test').send({ page: 5 });
    expect(res.status).toBe(200);
  });

  it('ページ番号が未指定または整数以外なら拒否する', async () => {
    createTestEndpoint(validators.validatePage('page'));
    expect((await request(app).post('/test').send({})).status).toBe(400);
    expect((await request(app).post('/test').send({ page: 'five' })).status).toBe(400);
  });

  it('検索語が100文字以内の文字列なら受け付ける', async () => {
    createTestEndpoint(validators.validateSearch('search'));
    const res = await request(app).post('/test').send({ search: 'hello' });
    expect(res.status).toBe(200);
  });

  it('検索語が未指定または不正なら拒否する', async () => {
    createTestEndpoint(validators.validateSearch('search'));
    expect((await request(app).post('/test').send({})).status).toBe(400);
    expect((await request(app).post('/test').send({ search: 12345 })).status).toBe(400);
    expect(
      (
        await request(app)
          .post('/test')
          .send({ search: 'a'.repeat(101) })
      ).status
    ).toBe(400);
  });

  it('開始日時と終了日時はnullまたはISO 8601形式なら受け付ける', async () => {
    createTestEndpoint(validators.validateFrom('from'));
    expect((await request(app).post('/test').send({ from: null })).status).toBe(200);
    expect((await request(app).post('/test').send({ from: '2023-10-13T08:05:00' })).status).toBe(200);

    app = {};
    createTestEndpoint(validators.validateTo('to'));
    expect((await request(app).post('/test').send({ to: null })).status).toBe(200);
    expect((await request(app).post('/test').send({ to: '2023-10-13T08:05:00' })).status).toBe(200);
  });

  it('開始日時と終了日時が未指定または形式不正なら拒否する', async () => {
    createTestEndpoint(validators.validateFrom('from'));
    expect((await request(app).post('/test').send({})).status).toBe(400);
    expect((await request(app).post('/test').send({ from: '13-10-2023' })).status).toBe(400);

    app = {};
    createTestEndpoint(validators.validateTo('to'));
    expect((await request(app).post('/test').send({})).status).toBe(400);
    expect((await request(app).post('/test').send({ to: '13-10-2023' })).status).toBe(400);
  });

  it('有効なUUIDとMongoDBのIDを受け付ける', async () => {
    createTestEndpoint(validators.validateUUID('uuid'));
    expect((await request(app).post('/test').send({ uuid: '123e4567-e89b-12d3-a456-426614174000' })).status).toBe(200);

    app = {};
    createTestEndpoint(validators.validateMongoId('mongoid'));
    expect((await request(app).post('/test').send({ mongoid: '507f1f77bcf86cd799439011' })).status).toBe(200);
  });

  it('不正なUUIDとMongoDBのIDを拒否する', async () => {
    createTestEndpoint(validators.validateUUID('uuid'));
    expect((await request(app).post('/test').send({})).status).toBe(400);
    expect((await request(app).post('/test').send({ uuid: 'not-a-uuid' })).status).toBe(400);

    app = {};
    createTestEndpoint(validators.validateMongoId('mongoid'));
    expect((await request(app).post('/test').send({})).status).toBe(400);
    expect((await request(app).post('/test').send({ mongoid: 'invalid' })).status).toBe(400);
  });

  it('有効なタイトルとユーザ名を受け付ける', async () => {
    createTestEndpoint(validators.validateTitle('title'));
    expect((await request(app).post('/test').send({ title: 't' })).status).toBe(200);

    app = {};
    createTestEndpoint(validators.validateUserName('username'));
    expect((await request(app).post('/test').send({ username: 'user' })).status).toBe(200);
  });

  it('不正なタイトルとユーザ名を拒否する', async () => {
    createTestEndpoint(validators.validateTitle('title'));
    expect((await request(app).post('/test').send({})).status).toBe(400);
    expect((await request(app).post('/test').send({ title: 1 })).status).toBe(400);
    expect(
      (
        await request(app)
          .post('/test')
          .send({ title: 'a'.repeat(101) })
      ).status
    ).toBe(400);
    expect((await request(app).post('/test').send({ title: '' })).status).toBe(400);

    app = {};
    createTestEndpoint(validators.validateUserName('username'));
    expect((await request(app).post('/test').send({})).status).toBe(400);
    expect((await request(app).post('/test').send({ username: 1 })).status).toBe(400);
    expect(
      (
        await request(app)
          .post('/test')
          .send({ username: 'a'.repeat(21) })
      ).status
    ).toBe(400);
    expect((await request(app).post('/test').send({ username: '' })).status).toBe(400);
  });

  it('本文の有効値を受け付け、不正値を拒否する', async () => {
    createTestEndpoint(validators.validateContent('content'));
    expect((await request(app).post('/test').send({ content: null })).status).toBe(200);
    expect(
      (
        await request(app)
          .post('/test')
          .send({ content: 'a'.repeat(400) })
      ).status
    ).toBe(200);

    expect((await request(app).post('/test').send({})).status).toBe(400);
    expect((await request(app).post('/test').send({ content: 1 })).status).toBe(400);
    expect(
      (
        await request(app)
          .post('/test')
          .send({ content: 'a'.repeat(401) })
      ).status
    ).toBe(400);
  });

  it('有効な翻訳先言語と言語を受け付ける', async () => {
    createTestEndpoint(validators.validateTargetLangs('targetLangs'));
    expect(
      (
        await request(app)
          .post('/test')
          .send({ targetLangs: ['en'] })
      ).status
    ).toBe(200);

    app = {};
    createTestEndpoint(validators.validateLang('lang'));
    expect((await request(app).post('/test').send({ lang: 'ja' })).status).toBe(200);
  });

  it('不正な翻訳先言語と言語を拒否する', async () => {
    createTestEndpoint(validators.validateTargetLangs('targetLangs'));
    expect((await request(app).post('/test').send({})).status).toBe(400);
    expect((await request(app).post('/test').send({ targetLangs: 'en' })).status).toBe(400);
    expect((await request(app).post('/test').send({ targetLangs: ['zz'] })).status).toBe(400);
    expect((await request(app).post('/test').send({ targetLangs: ['en', 1] })).status).toBe(400);
    expect(
      (
        await request(app)
          .post('/test')
          .send({ targetLangs: Array(ALLOWED_LANGUAGES.length + 1).fill('en') })
      ).status
    ).toBe(400);

    app = {};
    createTestEndpoint(validators.validateLang('lang'));
    expect((await request(app).post('/test').send({})).status).toBe(400);
    expect((await request(app).post('/test').send({ lang: 'JAPAN' })).status).toBe(400);
  });

  it('ルームタグとタグ項目の有効値を受け付け、不正値を拒否する', async () => {
    createTestEndpoint(validators.validateRoomTags('roomTags'));
    expect((await request(app).post('/test').send({ roomTags: [] })).status).toBe(200);
    expect((await request(app).post('/test').send({})).status).toBe(400);
    expect((await request(app).post('/test').send({ roomTags: 'a' })).status).toBe(400);

    app = {};
    createTestEndpoint(validators.validateRoomTagItem('roomTagItem'));
    expect((await request(app).post('/test').send({ roomTagItem: '507f1f77bcf86cd799439011' })).status).toBe(200);
    expect((await request(app).post('/test').send({})).status).toBe(400);
    expect((await request(app).post('/test').send({ roomTagItem: 'invalid' })).status).toBe(400);
  });

  it('アニメーションとキー入力の有効値を受け付け、不正値を拒否する', async () => {
    createTestEndpoint(validators.validateAnimation('animation'));
    expect((await request(app).post('/test').send({ animation: 'move-and-erase' })).status).toBe(200);
    expect((await request(app).post('/test').send({ animation: null })).status).toBe(200);
    expect((await request(app).post('/test').send({})).status).toBe(400);
    expect((await request(app).post('/test').send({ animation: 'x' })).status).toBe(400);

    app = {};
    createTestEndpoint(validators.validateKeyup('keyup'));
    expect((await request(app).post('/test').send({ keyup: 'a' })).status).toBe(200);
    expect((await request(app).post('/test').send({})).status).toBe(400);
    expect((await request(app).post('/test').send({ keyup: 1 })).status).toBe(400);
    expect(
      (
        await request(app)
          .post('/test')
          .send({ keyup: 'a'.repeat(5001) })
      ).status
    ).toBe(400);
  });

  it('ファイル名・サムネイル名・画像説明の有効値を受け付け、不正値を拒否する', async () => {
    createTestEndpoint(validators.validateFileName('fileName'));
    expect((await request(app).post('/test').send({ fileName: null })).status).toBe(200);
    expect(
      (await request(app).post('/test').send({ fileName: '1634123456_507f1f77bcf86cd799439011.png' })).status
    ).toBe(200);
    expect((await request(app).post('/test').send({})).status).toBe(400);
    expect((await request(app).post('/test').send({ fileName: 'bad.png' })).status).toBe(400);

    app = {};
    createTestEndpoint(validators.validateFileThumbnailName('fileThumb'));
    expect((await request(app).post('/test').send({ fileThumb: null })).status).toBe(200);
    expect(
      (await request(app).post('/test').send({ fileThumb: '1634123456_507f1f77bcf86cd799439011_thumbnail.png' })).status
    ).toBe(200);
    expect((await request(app).post('/test').send({})).status).toBe(400);
    expect((await request(app).post('/test').send({ fileThumb: 'x.png' })).status).toBe(400);

    app = {};
    createTestEndpoint(validators.validateImageCaption('cap'));
    expect((await request(app).post('/test').send({ cap: null })).status).toBe(200);
    expect((await request(app).post('/test').send({ cap: 'a' })).status).toBe(200);
    expect((await request(app).post('/test').send({})).status).toBe(400);
    expect((await request(app).post('/test').send({ cap: 1 })).status).toBe(400);
    expect(
      (
        await request(app)
          .post('/test')
          .send({ cap: 'a'.repeat(201) })
      ).status
    ).toBe(400);
  });

  it('動画と音声の入力項目の有効値を受け付け、不正値を拒否する', async () => {
    createTestEndpoint(validators.validateVideoSubtitleOriginalname('sub'));
    expect((await request(app).post('/test').send({ sub: null })).status).toBe(200);
    expect((await request(app).post('/test').send({ sub: 'a' })).status).toBe(200);
    expect((await request(app).post('/test').send({})).status).toBe(400);

    app = {};
    createTestEndpoint(validators.validateAudioTitle('at'));
    expect((await request(app).post('/test').send({ at: null })).status).toBe(200);
    expect((await request(app).post('/test').send({ at: 't' })).status).toBe(200);
    expect((await request(app).post('/test').send({})).status).toBe(400);

    app = {};
    createTestEndpoint(validators.validateAudioDescription('ad'));
    expect((await request(app).post('/test').send({ ad: null })).status).toBe(200);
    expect((await request(app).post('/test').send({ ad: 't' })).status).toBe(200);
    expect((await request(app).post('/test').send({})).status).toBe(400);
  });

  it('画像名の有効値を受け付け、不正値を拒否する', async () => {
    createTestEndpoint(validators.validateImageName('imageName'));
    expect((await request(app).post('/test').send({ imageName: null })).status).toBe(200);
    expect(
      (await request(app).post('/test').send({ imageName: '1634123456_507f1f77bcf86cd799439011.png' })).status
    ).toBe(200);
    expect((await request(app).post('/test').send({})).status).toBe(400);
    expect((await request(app).post('/test').send({ imageName: 'bad.png' })).status).toBe(400);
  });

  it('現在と変更後のパスワードの有効値を受け付け、不正値を拒否する', async () => {
    createTestEndpoint(validators.validatePassword('p'));
    expect((await request(app).post('/test').send({ p: 'Password1' })).status).toBe(200);
    expect((await request(app).post('/test').send({})).status).toBe(400);

    app = {};
    createTestEndpoint(validators.validateOldPassword('op'));
    expect((await request(app).post('/test').send({ op: 'Password1' })).status).toBe(200);

    app = {};
    createTestEndpoint(validators.validateNewPassword('np'));
    expect((await request(app).post('/test').send({ np: 'Password1' })).status).toBe(200);
  });

  it('ユーザ検索・メール・権限・フラグ・パスワード未設定の入力を検証する', async () => {
    createTestEndpoint(validators.validateUserSearch('us'));
    expect((await request(app).post('/test').send({ us: null })).status).toBe(200);
    expect((await request(app).post('/test').send({ us: 'a' })).status).toBe(200);
    expect((await request(app).post('/test').send({})).status).toBe(400);

    app = {};
    createTestEndpoint(validators.validateMail('mail'));
    expect((await request(app).post('/test').send({ mail: 'test@example.com' })).status).toBe(200);
    expect((await request(app).post('/test').send({})).status).toBe(400);

    app = {};
    createTestEndpoint(validators.validateNullableMail('mail'));
    expect((await request(app).post('/test').send({ mail: null })).status).toBe(200);
    expect((await request(app).post('/test').send({ mail: 'test@example.com' })).status).toBe(200);
    expect((await request(app).post('/test').send({})).status).toBe(400);
    expect((await request(app).post('/test').send({ mail: '' })).status).toBe(400);

    app = {};
    createTestEndpoint(validators.validateUserRole('role'));
    expect((await request(app).post('/test').send({ role: 'Administrator' })).status).toBe(200);
    expect((await request(app).post('/test').send({ role: 'invalid' })).status).toBe(400);

    app = {};
    createTestEndpoint(validators.validateDeleteFlg('del'));
    expect((await request(app).post('/test').send({ del: true })).status).toBe(200);
    expect((await request(app).post('/test').send({ del: 'x' })).status).toBe(400);

    app = {};
    createTestEndpoint(validators.validatePasswordNone('pn'));
    expect((await request(app).post('/test').send({})).status).toBe(200);
    expect((await request(app).post('/test').send({ pn: 'password' })).status).toBe(200);
    expect((await request(app).post('/test').send({ pn: 'short' })).status).toBe(400);
  });

  it('トークンの有効値を受け付け、不正値を拒否する', async () => {
    const token = '1234567890abcdef1234567890abcdef1234567890abcdef';

    createTestEndpoint(validators.validate24BytesHexToken('t'));
    expect((await request(app).post('/test').send({ t: token })).status).toBe(200);
    expect((await request(app).post('/test').send({})).status).toBe(400);
    expect((await request(app).post('/test').send({ t: '1234' })).status).toBe(400);

    app = {};
    createTestEndpoint(validators.validateResetPasswordToken('rt'));
    expect((await request(app).post('/test').send({ rt: token })).status).toBe(200);
    expect((await request(app).post('/test').send({})).status).toBe(400);

    app = {};
    createTestEndpoint(validators.validateInviteToken('it'));
    expect((await request(app).post('/test').send({ it: token })).status).toBe(200);
    expect((await request(app).post('/test').send({})).status).toBe(400);
  });

  it('共通タグの検索条件の有効値を受け付け、不正値を拒否する', async () => {
    createTestEndpoint(validators.validateCategoryTagSearch('q'));
    expect((await request(app).post('/test').send({})).status).toBe(200);
    expect((await request(app).post('/test').send({ q: null })).status).toBe(200);
    expect((await request(app).post('/test').send({ q: 'tag' })).status).toBe(200);
    expect(
      (
        await request(app)
          .post('/test')
          .send({ q: 'a'.repeat(51) })
      ).status
    ).toBe(400);
  });

  it('タグと共通タグの表示順の有効値を受け付け、不正値を拒否する', async () => {
    createTestEndpoint(validators.validateTagOrder('o'));
    expect((await request(app).post('/test').send({ o: 1 })).status).toBe(200);
    expect((await request(app).post('/test').send({ o: 101 })).status).toBe(400);

    app = {};
    createTestEndpoint(validators.validateCategoryTagOrder('co'));
    expect((await request(app).post('/test').send({ co: 50 })).status).toBe(200);
    expect((await request(app).post('/test').send({ co: 0 })).status).toBe(400);
  });

  it('タグと共通タグの名称の有効値を受け付け、不正値を拒否する', async () => {
    createTestEndpoint(validators.validateTagName('n'));
    expect((await request(app).post('/test').send({ n: 'X' })).status).toBe(200);
    expect((await request(app).post('/test').send({})).status).toBe(400);

    app = {};
    createTestEndpoint(validators.validateCategoryTagName('cn'));
    expect((await request(app).post('/test').send({ cn: 'Y' })).status).toBe(200);
    expect((await request(app).post('/test').send({ cn: '' })).status).toBe(400);
  });

  it('CSVは各行2列の二次元配列を受け付け、不正値を拒否する', async () => {
    createTestEndpoint(validators.validateCsv('csv'));
    expect(
      (
        await request(app)
          .post('/test')
          .send({
            csv: [
              ['a', '1'],
              ['b', '2'],
            ],
          })
      ).status
    ).toBe(200);
    expect((await request(app).post('/test').send({ csv: 'not' })).status).toBe(400);
    expect(
      (
        await request(app)
          .post('/test')
          .send({ csv: [['only1']] })
      ).status
    ).toBe(400);

    app = {};
    createTestEndpoint(validators.validateCategoryTagCsv('ccsv'));
    expect(
      (
        await request(app)
          .post('/test')
          .send({ ccsv: [['n', '1']] })
      ).status
    ).toBe(200);

    app = {};
    createTestEndpoint(validators.validateFloorTagCsv('fcsv'));
    expect(
      (
        await request(app)
          .post('/test')
          .send({ fcsv: [['n', '1']] })
      ).status
    ).toBe(200);

    app = {};
    createTestEndpoint(validators.validateRoomTagCsv('rcsv'));
    expect(
      (
        await request(app)
          .post('/test')
          .send({ rcsv: [['n', '1']] })
      ).status
    ).toBe(200);
  });

  it('スパムの検索条件と語句の有効値を受け付け、不正値を拒否する', async () => {
    createTestEndpoint(validators.validateSpamSearch('search'));
    expect((await request(app).post('/test').send({})).status).toBe(200);
    expect((await request(app).post('/test').send({ search: null })).status).toBe(200);
    expect((await request(app).post('/test').send({ search: '  hello  ' })).status).toBe(200);
    expect(
      (
        await request(app)
          .post('/test')
          .send({ search: 'a'.repeat(51) })
      ).status
    ).toBe(400);

    app = {};
    createTestEndpoint(validators.validateSpamWord('spamWord'));
    expect((await request(app).post('/test').send({ spamWord: 'a' })).status).toBe(200);
    expect(
      (
        await request(app)
          .post('/test')
          .send({ spamWord: 'a'.repeat(50) })
      ).status
    ).toBe(200);
    expect((await request(app).post('/test').send({ spamWord: '   x   ' })).status).toBe(200);
    expect((await request(app).post('/test').send({})).status).toBe(400);
    expect(
      (
        await request(app)
          .post('/test')
          .send({ spamWord: ' '.repeat(5) })
      ).status
    ).toBe(400);
    expect(
      (
        await request(app)
          .post('/test')
          .send({ spamWord: 'a'.repeat(51) })
      ).status
    ).toBe(400);
  });

  it('フロアとルームのメンバー招待トークンの有効値を受け付け、不正値を拒否する', async () => {
    const token = '1234567890abcdef1234567890abcdef1234567890abcdef';

    createTestEndpoint(validators.validateFloorMemberInviteToken('floorToken'));
    expect((await request(app).post('/test').send({ floorToken: token })).status).toBe(200);
    expect((await request(app).post('/test').send({})).status).toBe(400);

    app = {};
    createTestEndpoint(validators.validateRoomMemberInviteToken('roomToken'));
    expect((await request(app).post('/test').send({ roomToken: token })).status).toBe(200);
    expect((await request(app).post('/test').send({ roomToken: 'short' })).status).toBe(400);
  });

  it('フロアタグとルームタグの入力項目の有効値を受け付け、不正値を拒否する', async () => {
    createTestEndpoint(validators.validateFloorTagOrder('o'));
    expect((await request(app).post('/test').send({ o: 1 })).status).toBe(200);
    expect((await request(app).post('/test').send({ o: 101 })).status).toBe(400);

    app = {};
    createTestEndpoint(validators.validateFloorTagName('n'));
    expect((await request(app).post('/test').send({ n: 'X' })).status).toBe(200);
    expect((await request(app).post('/test').send({ n: '' })).status).toBe(400);

    app = {};
    createTestEndpoint(validators.validateFloorTagCsv('c'));
    expect(
      (
        await request(app)
          .post('/test')
          .send({ c: [['a', '1']] })
      ).status
    ).toBe(200);

    app = {};
    createTestEndpoint(validators.validateRoomTagOrder('ro'));
    expect((await request(app).post('/test').send({ ro: 100 })).status).toBe(200);

    app = {};
    createTestEndpoint(validators.validateRoomTagName('rn'));
    expect((await request(app).post('/test').send({ rn: 'Name' })).status).toBe(200);

    app = {};
    createTestEndpoint(validators.validateRoomTagCsv('rc'));
    expect(
      (
        await request(app)
          .post('/test')
          .send({ rc: [['x', '2']] })
      ).status
    ).toBe(200);
  });

  it('音タグの有効値を受け付け、不正値を拒否する', async () => {
    createTestEndpoint(validators.validateSoundTags('soundTags'));
    expect((await request(app).post('/test').send({ soundTags: [] })).status).toBe(200);
    expect((await request(app).post('/test').send({})).status).toBe(400);
    expect((await request(app).post('/test').send({ soundTags: 'notAnArray' })).status).toBe(400);
  });

  it('ルームの入力項目の有効値を受け付け、不正値を拒否する', async () => {
    createTestEndpoint(validators.validateRoomTitle('t'));
    expect((await request(app).post('/test').send({ t: 'Title' })).status).toBe(200);

    app = {};
    createTestEndpoint(validators.validateRoomDescription('d'));
    expect((await request(app).post('/test').send({ d: null })).status).toBe(200);
    expect(
      (
        await request(app)
          .post('/test')
          .send({ d: 'a'.repeat(201) })
      ).status
    ).toBe(400);

    app = {};
    createTestEndpoint(validators.validateMemberOnly('m'));
    expect((await request(app).post('/test').send({ m: true })).status).toBe(200);

    app = {};
    createTestEndpoint(validators.validateRoomDisplayHidden('h'));
    expect((await request(app).post('/test').send({ h: false })).status).toBe(200);

    app = {};
    createTestEndpoint(validators.validateRoomDisplayOrders('os'));
    expect(
      (
        await request(app)
          .post('/test')
          .send({ os: [1, 2] })
      ).status
    ).toBe(200);

    app = {};
    createTestEndpoint(validators.validateRoomDisplayOrder('o'));
    expect((await request(app).post('/test').send({ o: 0 })).status).toBe(200);
    expect((await request(app).post('/test').send({ o: 101 })).status).toBe(200);
    expect((await request(app).post('/test').send({ o: -1 })).status).toBe(400);
  });

  it('フロアの入力項目の有効値を受け付け、不正値を拒否する', async () => {
    createTestEndpoint(validators.validateFloorSearch('s'));
    expect((await request(app).post('/test').send({ s: null })).status).toBe(200);

    app = {};
    createTestEndpoint(validators.validateFloorTitle('t'));
    expect((await request(app).post('/test').send({ t: 'Floor' })).status).toBe(200);

    app = {};
    createTestEndpoint(validators.validateFloorDescription('d'));
    expect(
      (
        await request(app)
          .post('/test')
          .send({ d: 'a'.repeat(200) })
      ).status
    ).toBe(200);

    app = {};
    createTestEndpoint(validators.validateFloorDisplayHidden('h'));
    expect((await request(app).post('/test').send({ h: true })).status).toBe(200);
  });

  it('通知条件の有効値を受け付け、不正値を拒否する', async () => {
    createTestEndpoint(validators.validateConditions('conditions'));
    const ok = {
      filterMode: 'include',
      showRange: 'all',
      keyword: null,
      keywordArray: ['k1'],
      logicalOperator: 'or',
      tags: ['507f1f77bcf86cd799439011'],
      tagSearchOperator: 'and',
      noTags: false,
      animation: true,
      displayOrder: [{ key: 'created_at', display: 'desc' }],
      userName: 'alice',
    };
    expect((await request(app).post('/test').send({ conditions: ok })).status).toBe(200);

    const bad = {
      filterMode: 'bad',
      showRange: 'all',
      keyword: 1,
      keywordArray: ['ok', 2],
      logicalOperator: 'xor',
      tags: ['not-mongoid'],
      tagSearchOperator: 'nand',
      noTags: 'no',
      animation: 'yes',
      displayOrder: [{ key: 'k' }],
      userName: 1,
    };
    expect((await request(app).post('/test').send({ conditions: bad })).status).toBe(400);
  });

  it('finalize: 事前に入力検証エラーが無ければ next で 200', async () => {
    createTestEndpoint((req, _res, next) => next());
    const res = await request(app).post('/test').send({});
    expect(res.status).toBe(200);
  });

  it('requireFiles: 必須フィールドのファイルが存在すれば 200', async () => {
    createFilesEndpoint(['image_file'], { image_file: [{ filename: 'x.png' }] });
    const res = await request(app).post('/test-files').send({});
    expect(res.status).toBe(200);
  });

  it('requireFiles: req.files 未設定は 400', async () => {
    createFilesEndpoint(['image_file'], undefined);
    const res = await request(app).post('/test-files').send({});
    expect(res.status).toBe(400);
  });

  it('requireFiles: 配列が空でも 400', async () => {
    createFilesEndpoint(['image_file'], { image_file: [] });
    const res = await request(app).post('/test-files').send({});
    expect(res.status).toBe(400);
  });

  it('requireFiles: 複数必須のうち 1 つ欠けても 400', async () => {
    createFilesEndpoint(['video_file', 'video_subtitle_file'], { video_file: [{ filename: 'v.mp4' }] });
    const res = await request(app).post('/test-files').send({});
    expect(res.status).toBe(400);
  });

  it('requireFiles: 複数必須が全て揃っていれば 200', async () => {
    createFilesEndpoint(['video_file', 'video_subtitle_file'], {
      video_file: [{ filename: 'v.mp4' }],
      video_subtitle_file: [{ filename: 'v.vtt' }],
    });
    const res = await request(app).post('/test-files').send({});
    expect(res.status).toBe(200);
  });
});
