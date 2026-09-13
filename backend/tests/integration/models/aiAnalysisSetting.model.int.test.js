const mongoose = require('mongoose');

const { REQUIRED_INDEXES } = require('../../../constants/aiAnalysisSettings');
const AIAnalysisSetting = require('../../../models/AIAnalysisSetting');
const FloorAIAnalysisSetting = require('../../../models/FloorAIAnalysisSetting');
const RoomAIAnalysisSetting = require('../../../models/RoomAIAnalysisSetting');

const MONGO_URI_ENV_KEY = 'JEST_MONGODB_MEMORY_SERVER_URI';
const sourceModels = [AIAnalysisSetting, FloorAIAnalysisSetting, RoomAIAnalysisSetting];

const commonPayload = () => {
  const auditUser = new mongoose.Types.ObjectId();
  return {
    analysis_kind: 'vision',
    additional_prompt: '',
    result_user: new mongoose.Types.ObjectId(),
    revision: 1,
    user: auditUser,
    updated_by: auditUser,
  };
};

const settingPayload = (modelName) => {
  if (modelName === 'AIAnalysisSetting') {
    return {
      category_tag: new mongoose.Types.ObjectId(),
      ...commonPayload(),
    };
  }
  if (modelName === 'FloorAIAnalysisSetting') {
    return {
      floor: new mongoose.Types.ObjectId(),
      floor_tag: new mongoose.Types.ObjectId(),
      ...commonPayload(),
    };
  }
  return {
    floor: new mongoose.Types.ObjectId(),
    room: new mongoose.Types.ObjectId(),
    room_tag: new mongoose.Types.ObjectId(),
    ...commonPayload(),
  };
};

describe('AI解析設定モデルの初期化', () => {
  let isolatedConnection;

  beforeAll(async () => {
    const uri = process.env[MONGO_URI_ENV_KEY];
    if (!uri) throw new Error('JestのglobalSetupで共有MongoDBのURIが設定されていません');

    isolatedConnection = mongoose.createConnection(uri, {
      dbName: `ai_analysis_model_init_${process.pid}_${Date.now()}`,
    });
    await isolatedConnection.asPromise();
  });

  afterAll(async () => {
    if (!isolatedConnection) return;
    try {
      if (isolatedConnection.readyState === 1) {
        await isolatedConnection.dropDatabase();
      }
    } finally {
      await isolatedConnection.close();
    }
  });

  test('空のDBでコレクションと有効な設定だけを対象にする一意索引を作成する', async () => {
    const before = await isolatedConnection.db.listCollections({}, { nameOnly: true }).toArray();
    expect(before).toEqual([]);

    const models = sourceModels.map((SourceModel) =>
      isolatedConnection.model(SourceModel.modelName, SourceModel.schema)
    );
    await Promise.all(models.map((Model) => Model.init()));

    const collections = await isolatedConnection.db
      .listCollections({}, { nameOnly: true })
      .toArray();
    expect(collections.map(({ name }) => name).sort()).toEqual(
      REQUIRED_INDEXES.map(({ collectionName }) => collectionName).sort()
    );

    for (const expected of REQUIRED_INDEXES) {
      const Model = models.find(({ modelName }) => modelName === expected.modelName);
      const indexes = await Model.collection.indexes();
      const actual = indexes.find(({ name }) => name === expected.name);

      expect(indexes.map(({ name }) => name).sort()).toEqual(['_id_', expected.name].sort());
      expect({
        collectionName: Model.collection.collectionName,
        key: actual?.key,
        name: actual?.name,
        unique: actual?.unique,
        partialFilterExpression: actual?.partialFilterExpression,
      }).toEqual({
        collectionName: expected.collectionName,
        key: expected.key,
        name: expected.name,
        unique: true,
        partialFilterExpression: expected.partialFilterExpression,
      });
      expect(actual).not.toHaveProperty('sparse');
      expect(actual).not.toHaveProperty('hidden');
      expect(actual).not.toHaveProperty('expireAfterSeconds');
      expect(actual).not.toHaveProperty('collation');

      const payload = settingPayload(Model.modelName);
      await Model.create(payload);
      await expect(Model.create(payload)).rejects.toMatchObject({ code: 11000 });
      await expect(Model.create({ ...payload, delete_flg: true })).resolves.toMatchObject({
        delete_flg: true,
      });

      const uniqueFilter = Object.fromEntries(
        Object.keys(expected.key).map((field) => [field, payload[field]])
      );
      await expect(Model.countDocuments(uniqueFilter)).resolves.toBe(2);
    }
  });
});
