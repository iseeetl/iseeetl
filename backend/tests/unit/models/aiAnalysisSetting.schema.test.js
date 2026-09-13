const mongoose = require('mongoose');

const {
  ANALYSIS_KINDS,
  REQUIRED_INDEXES,
} = require('../../../constants/aiAnalysisSettings');
const AIAnalysisSetting = require('../../../models/AIAnalysisSetting');
const FloorAIAnalysisSetting = require('../../../models/FloorAIAnalysisSetting');
const RoomAIAnalysisSetting = require('../../../models/RoomAIAnalysisSetting');

const id = () => new mongoose.Types.ObjectId();

const commonFields = (overrides = {}) => ({
  analysis_kind: 'vision',
  additional_prompt: '',
  result_user: id(),
  revision: 1,
  user: id(),
  updated_by: id(),
  ...overrides,
});

const models = [
  ['common', AIAnalysisSetting],
  ['floor', FloorAIAnalysisSetting],
  ['room', RoomAIAnalysisSetting],
];

describe('AI解析設定のスキーマ', () => {
  test.each(models)('%sモデルはMongoose標準のコレクションと索引の管理を使う', (_name, Model) => {
    expect(Model.schema.options.autoCreate).not.toBe(false);
    expect(Model.schema.options.autoIndex).not.toBe(false);
  });

  test.each(models)('%sモデルは共通の項目を定義する', (_name, Model) => {
    const { schema } = Model;

    expect(schema.path('analysis_kind').isRequired).toBe(true);
    expect(schema.path('analysis_kind').options.enum).toEqual(ANALYSIS_KINDS);
    expect(schema.path('additional_prompt').defaultValue).toBe('');
    expect(schema.path('result_user').isRequired).toBe(true);
    expect(schema.path('result_user').options.ref).toBe('User');
    expect(schema.path('revision').isRequired).toBe(true);
    expect(schema.path('revision').defaultValue).toBe(1);
    expect(schema.path('revision').options.min).toBe(1);
    expect(schema.path('user').isRequired).toBe(true);
    expect(schema.path('updated_by').isRequired).toBe(true);
    expect(schema.path('delete_flg').defaultValue).toBe(false);
    expect(schema.path('created_at').defaultValue).toBe(Date.now);
    expect(schema.path('updated_at').defaultValue).toBe(null);
  });

  test.each(models)('%sモデルは有効な設定を対象とする部分一意索引を定義する', (_name, Model) => {
    const expected = REQUIRED_INDEXES.find(({ modelName }) => modelName === Model.modelName);
    const found = Model.schema.indexes().find(([, options]) => options.name === expected.name);

    expect(found).toEqual([
      expected.key,
      expect.objectContaining({
        name: expected.name,
        unique: true,
        partialFilterExpression: { delete_flg: false },
      }),
    ]);
  });

  test('所属先と複製元の参照に対応するモデルを指定する', () => {
    expect(AIAnalysisSetting.schema.path('category_tag').options.ref).toBe('CategoryTag');
    expect(FloorAIAnalysisSetting.schema.path('floor').options.ref).toBe('Floor');
    expect(FloorAIAnalysisSetting.schema.path('floor_tag').options.ref).toBe('FloorTag');
    expect(FloorAIAnalysisSetting.schema.path('source_master_setting').options.ref).toBe(
      'AIAnalysisSetting'
    );
    expect(RoomAIAnalysisSetting.schema.path('floor').options.ref).toBe('Floor');
    expect(RoomAIAnalysisSetting.schema.path('room').options.ref).toBe('Room');
    expect(RoomAIAnalysisSetting.schema.path('room_tag').options.ref).toBe('RoomTag');
    expect(RoomAIAnalysisSetting.schema.path('source_floor_setting').options.ref).toBe(
      'FloorAIAnalysisSetting'
    );
  });

  test('追加プロンプトをNFCで正規化し、前後の空白を除去して空文字を許可する', async () => {
    const setting = new AIAnalysisSetting({
      category_tag: id(),
      ...commonFields({ additional_prompt: '  e\u0301  ' }),
    });

    expect(setting.additional_prompt).toBe('é');
    await expect(setting.validate()).resolves.toBeUndefined();

    setting.additional_prompt = '   ';
    expect(setting.additional_prompt).toBe('');
    await expect(setting.validate()).resolves.toBeUndefined();
  });

  test('追加プロンプトが2000文字を超える場合は拒否する', async () => {
    const setting = new AIAnalysisSetting({
      category_tag: id(),
      ...commonFields({ additional_prompt: '😀'.repeat(2001) }),
    });

    await expect(setting.validate()).rejects.toMatchObject({
      errors: { additional_prompt: expect.any(Object) },
    });
  });

  test('文字起こしの追加プロンプトはUTF-8で224バイトまでに制限する', async () => {
    const accepted = new AIAnalysisSetting({
      category_tag: id(),
      ...commonFields({ analysis_kind: 'speech', additional_prompt: 'a'.repeat(224) }),
    });
    const rejected = new AIAnalysisSetting({
      category_tag: id(),
      ...commonFields({ analysis_kind: 'speech', additional_prompt: 'a'.repeat(225) }),
    });

    await expect(accepted.validate()).resolves.toBeUndefined();
    await expect(rejected.validate()).rejects.toMatchObject({
      errors: { additional_prompt: expect.any(Object) },
    });
  });

  test.each([0, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'リビジョンが正の安全な整数でなければ拒否する: %p',
    async (revision) => {
      const setting = new AIAnalysisSetting({
        category_tag: id(),
        ...commonFields({ revision }),
      });

      await expect(setting.validate()).rejects.toMatchObject({
        errors: { revision: expect.any(Object) },
      });
    }
  );

  test.each([
    [
      FloorAIAnalysisSetting,
      'source_master_setting',
      'source_master_revision',
      { floor: id(), floor_tag: id() },
    ],
    [
      RoomAIAnalysisSetting,
      'source_floor_setting',
      'source_floor_revision',
      { floor: id(), room: id(), room_tag: id() },
    ],
  ])(
    '%sは複製元設定と安全な整数のリビジョンをセットで必須にする',
    async (Model, settingField, revisionField, scope) => {
      const valid = new Model({
        ...scope,
        ...commonFields(),
        [settingField]: id(),
        [revisionField]: 3,
      });
      await expect(valid.validate()).resolves.toBeUndefined();

      const missingRevision = new Model({
        ...scope,
        ...commonFields(),
        [settingField]: id(),
      });
      await expect(missingRevision.validate()).rejects.toMatchObject({
        errors: { [revisionField]: expect.any(Object) },
      });

      const orphanRevision = new Model({
        ...scope,
        ...commonFields(),
        [revisionField]: 3,
      });
      await expect(orphanRevision.validate()).rejects.toMatchObject({
        errors: { [revisionField]: expect.any(Object) },
      });

      const unsafeRevision = new Model({
        ...scope,
        ...commonFields(),
        [settingField]: id(),
        [revisionField]: Number.MAX_SAFE_INTEGER + 1,
      });
      await expect(unsafeRevision.validate()).rejects.toMatchObject({
        errors: { [revisionField]: expect.any(Object) },
      });
    }
  );
});
