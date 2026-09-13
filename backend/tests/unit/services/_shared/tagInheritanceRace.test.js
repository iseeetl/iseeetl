jest.mock('../../../../services/translation.service', () => ({
  translateTag: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../../../config/featureFlags', () => ({
  isGoogleTranslateEnabled: jest.fn(() => true),
}));

const {
  createTranslatedTag,
  reconcileTagsByName,
} = require('../../../../services/_shared/tagServiceHelpers');

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const matchesScope = (row, query) =>
  Object.entries(query).every(([key, value]) => row[key] === value);

const createMemoryTagModel = () => {
  const rows = [];
  return {
    modelName: 'FloorTag',
    rows,
    find: jest.fn((scope) => ({
      lean: jest.fn().mockImplementation(async () =>
        rows.filter((row) => matchesScope(row, scope)).map((row) => ({ ...row }))
      ),
    })),
    create: jest.fn(async (document) => {
      const created = { _id: `manual-${rows.length + 1}`, delete_flg: false, ...document };
      rows.push(created);
      return created;
    }),
    bulkWrite: jest.fn(async (operations) => {
      for (const operation of operations) {
        if (operation.updateOne) {
          const { filter, update } = operation.updateOne;
          let row = rows.find(
            (candidate) => candidate.floor === filter.floor && candidate.name === filter.name
          );
          if (!row) {
            row = { ...update.$setOnInsert, ...update.$set };
            rows.push(row);
          } else {
            Object.assign(row, update.$set);
          }
        }
      }
      return {};
    }),
    deleteMany: jest.fn(async ({ _id }) => {
      const ids = new Set((_id?.$in || []).map(String));
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (ids.has(String(rows[index]._id))) rows.splice(index, 1);
      }
      return {};
    }),
  };
};

describe('タグの継承と手動作成の排他制御', () => {
  test('手動作成が先にロックを取得したら、初期化では同名タグを新規作成せず設定も複製しない', async () => {
    const Model = createMemoryTagModel();
    const createStarted = deferred();
    const releaseCreate = deferred();
    Model.create.mockImplementationOnce(async (document) => {
      createStarted.resolve();
      await releaseCreate.promise;
      const created = { _id: 'manual-real-id', delete_flg: false, ...document };
      Model.rows.push(created);
      return created;
    });
    const inheritance = {
      prepare: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
    };

    const manualPromise = createTranslatedTag({
      Model,
      data: { floor: 'floor-1', user: 'user-1', order: 1, name: 'Tag', lang: 'ja' },
      userId: 'user-1',
      targetLangs: [],
    });
    await createStarted.promise;
    const initPromise = reconcileTagsByName({
      Model,
      scope: { floor: 'floor-1' },
      userId: 'user-1',
      tags: [{ name: 'Tag', order: 1, source_category_tag: 'category-1' }],
      insertOnlyFields: ['source_category_tag'],
      inheritance,
    });
    releaseCreate.resolve();

    await expect(manualPromise).resolves.toMatchObject({ _id: 'manual-real-id' });
    await expect(initPromise).resolves.toBeUndefined();
    expect(Model.rows).toHaveLength(1);
    expect(Model.rows[0]._id).toBe('manual-real-id');
    expect(Model.rows[0]).not.toHaveProperty('source_category_tag');
    expect(inheritance.prepare).not.toHaveBeenCalled();
  });

  test('初期化が先にロックを取得したら、後続の手動作成にかかわらず実際の登録先へ設定を複製する', async () => {
    const Model = createMemoryTagModel();
    const bulkStarted = deferred();
    const releaseBulk = deferred();
    const originalBulkWrite = Model.bulkWrite.getMockImplementation();
    Model.bulkWrite.mockImplementationOnce(async (operations) => {
      bulkStarted.resolve();
      await releaseBulk.promise;
      return originalBulkWrite(operations);
    });
    const inheritancePlan = { type: 'floor', documents: [] };
    const inheritance = {
      prepare: jest.fn().mockResolvedValue(inheritancePlan),
      commit: jest.fn().mockResolvedValue([]),
      rollback: jest.fn(),
    };

    const initPromise = reconcileTagsByName({
      Model,
      scope: { floor: 'floor-1' },
      userId: 'user-1',
      tags: [{ name: 'Tag', order: 1, source_category_tag: 'category-1' }],
      insertOnlyFields: ['source_category_tag'],
      inheritance,
    });
    await bulkStarted.promise;
    const manualPromise = createTranslatedTag({
      Model,
      data: { floor: 'floor-1', user: 'user-1', order: 2, name: 'Tag', lang: 'ja' },
      userId: 'user-1',
      targetLangs: [],
    });
    releaseBulk.resolve();

    await expect(initPromise).resolves.toBeUndefined();
    await expect(manualPromise).resolves.toMatchObject({ name: 'Tag' });
    expect(Model.rows).toHaveLength(2);
    const preparedTag = inheritance.prepare.mock.calls[0][0][0];
    const inheritedTag = Model.rows.find(
      (tag) => String(tag._id) === String(preparedTag._id)
    );
    expect(inheritedTag.source_category_tag).toBe('category-1');
    expect(inheritance.commit).toHaveBeenCalledWith(inheritancePlan);
  });
});
