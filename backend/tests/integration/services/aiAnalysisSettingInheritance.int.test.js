const ROLES = require('../../../constants/roles');
const AIAnalysisSetting = require('../../../models/AIAnalysisSetting');
const FloorAIAnalysisSetting = require('../../../models/FloorAIAnalysisSetting');
const RoomAIAnalysisSetting = require('../../../models/RoomAIAnalysisSetting');
const CategoryTag = require('../../../models/CategoryTag');
const FloorTag = require('../../../models/FloorTag');
const RoomTag = require('../../../models/RoomTag');
const {
  provisionFloorResources,
  rollbackFloorProvisioning,
} = require('../../../services/floor/floorProvisioning.service');
const floorTagService = require('../../../services/floor/floorTag.service');
const {
  provisionRoomResources,
  rollbackRoomProvisioning,
} = require('../../../services/room/roomProvisioning.service');
const roomTagService = require('../../../services/room/roomTag.service');
const translationService = require('../../../services/translation.service');
const {
  createTestTempDir,
  removeDirSafe,
} = require('../../_helpers/testRuntime');
const { createFloor, createRoom, createUser } = require('../_helpers/models');

const SETTING_MODELS = Object.freeze({
  AIAnalysisSetting,
  FloorAIAnalysisSetting,
  RoomAIAnalysisSetting,
});

const uniqueName = (prefix) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const createActors = async () => {
  const admin = await createUser({ role: ROLES.ADMINISTRATOR });
  const editor = await createUser({ role: ROLES.EDITOR });
  const resultUser = await createUser({ role: ROLES.AUTHOR });
  return { admin, editor, resultUser };
};

const createCategoryTag = (user, overrides = {}) =>
  CategoryTag.create({
    user: user._id,
    order: 1,
    name: uniqueName('Category'),
    lang: 'ja',
    translations: [],
    ...overrides,
  });

const createCommonSetting = ({ admin, resultUser, categoryTag, kind = 'vision', prompt = '' }) =>
  AIAnalysisSetting.create({
    category_tag: categoryTag._id,
    analysis_kind: kind,
    additional_prompt: prompt,
    result_user: resultUser._id,
    revision: 1,
    user: admin._id,
    updated_by: admin._id,
  });

describe('AI解析設定のタグ継承', () => {
  let mediaRoot;

  beforeEach(async () => {
    await Promise.all(Object.values(SETTING_MODELS).map((Model) => Model.deleteMany({})));
    mediaRoot = createTestTempDir('ai-setting-inheritance');
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await Promise.all(Object.values(SETTING_MODELS).map((Model) => Model.deleteMany({})));
    await removeDirSafe(mediaRoot);
  });

  test('フロア・ルームの初期設定では、有効なAI解析設定を一度だけコピーし、その後の変更は同期しない', async () => {
    const { admin, editor, resultUser } = await createActors();
    const categoryTag = await createCategoryTag(admin, { name: 'Inherited tag' });
    const masterVision = await createCommonSetting({
      admin,
      resultUser,
      categoryTag,
      prompt: 'master vision',
    });
    const masterSpeech = await createCommonSetting({
      admin,
      resultUser,
      categoryTag,
      kind: 'speech',
      prompt: 'master speech',
    });
    const floor = await createFloor(editor);
    const room = await createRoom(editor, floor);

    await provisionFloorResources({
      floorId: floor._id,
      userId: editor._id,
      targetLangs: [],
      mediaRoot,
    });
    const floorTag = await FloorTag.findOne({ floor: floor._id, name: categoryTag.name }).lean();
    const floorSettings = await FloorAIAnalysisSetting.find({ floor: floor._id })
      .sort({ analysis_kind: 1 })
      .lean();
    expect(floorTag.source_category_tag.toString()).toBe(categoryTag._id.toString());
    expect(floorSettings).toHaveLength(2);
    expect(floorSettings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          floor_tag: floorTag._id,
          source_master_setting: masterVision._id,
          source_master_revision: 1,
          additional_prompt: 'master vision',
          result_user: resultUser._id,
          revision: 1,
          user: editor._id,
          updated_by: editor._id,
        }),
        expect.objectContaining({
          source_master_setting: masterSpeech._id,
          additional_prompt: 'master speech',
        }),
      ])
    );

    await AIAnalysisSetting.updateOne(
      { _id: masterVision._id },
      { $set: { additional_prompt: 'changed later' }, $inc: { revision: 1 } }
    );
    expect(
      (await FloorAIAnalysisSetting.findOne({ source_master_setting: masterVision._id }).lean())
        .additional_prompt
    ).toBe('master vision');

    await provisionRoomResources({
      floorId: floor._id,
      roomId: room._id,
      userId: editor._id,
      targetLangs: [],
      mediaRoot,
    });
    const roomTag = await RoomTag.findOne({ room: room._id, name: categoryTag.name }).lean();
    const roomVision = await RoomAIAnalysisSetting.findOne({
      room: room._id,
      analysis_kind: 'vision',
    }).lean();
    const sourceFloorVision = floorSettings.find((setting) => setting.analysis_kind === 'vision');
    expect(roomTag.source_floor_tag.toString()).toBe(floorTag._id.toString());
    expect(roomVision).toEqual(
      expect.objectContaining({
        room_tag: roomTag._id,
        source_floor_setting: sourceFloorVision._id,
          source_floor_revision: 1,
          additional_prompt: 'master vision',
          result_user: resultUser._id,
          revision: 1,
        user: editor._id,
        updated_by: editor._id,
      })
    );

    await FloorAIAnalysisSetting.updateOne(
      { _id: sourceFloorVision._id },
      { $set: { additional_prompt: 'floor changed later' }, $inc: { revision: 1 } }
    );
    expect((await RoomAIAnalysisSetting.findById(roomVision._id).lean()).additional_prompt).toBe(
      'master vision'
    );
  });

  test('initはフロアタグを新規作成し、ルームタグは元のIDで復元する', async () => {
    const { admin, editor, resultUser } = await createActors();
    const targetCategory = await createCategoryTag(admin, { order: 1, name: 'Shared' });
    const storedCategory = await createCategoryTag(admin, { order: 2, name: 'Other' });
    await createCommonSetting({ admin, resultUser, categoryTag: targetCategory });
    const floor = await createFloor(editor);
    const existingFloorTag = await FloorTag.create({
      floor: floor._id,
      source_category_tag: storedCategory._id,
      user: editor._id,
      order: 9,
      name: targetCategory.name,
      lang: 'en',
      translations: [],
      delete_flg: true,
      deleted_at: new Date(),
    });
    const actor = { user_id: admin._id.toString(), user_role: ROLES.ADMINISTRATOR };

    await floorTagService.init({ floor_id: floor._id.toString() }, actor);
    await floorTagService.init({ floor_id: floor._id.toString() }, actor);

    const restoredFloorTag = await FloorTag.findById(existingFloorTag._id).lean();
    expect(restoredFloorTag.delete_flg).toBe(true);
    expect(restoredFloorTag.source_category_tag.toString()).toBe(storedCategory._id.toString());
    expect(await FloorAIAnalysisSetting.countDocuments({ floor_tag: existingFloorTag._id })).toBe(0);

    const storedFloorTag = await FloorTag.findOne({
      floor: floor._id,
      source_category_tag: storedCategory._id,
      name: storedCategory.name,
    }).lean();
    const activeFloorTag = await FloorTag.findOne({ floor: floor._id, name: targetCategory.name, delete_flg: false });
    expect(activeFloorTag._id.toString()).not.toBe(existingFloorTag._id.toString());
    const parentFloorSetting = await FloorAIAnalysisSetting.findOne({ floor_tag: activeFloorTag._id });
    expect(parentFloorSetting).not.toBeNull();
    expect(await FloorAIAnalysisSetting.countDocuments({ floor_tag: activeFloorTag._id })).toBe(1);
    const room = await createRoom(editor, floor);
    const existingRoomTag = await RoomTag.create({
      floor: floor._id,
      room: room._id,
      source_floor_tag: storedFloorTag._id,
      user: editor._id,
      order: 9,
      name: targetCategory.name,
      lang: 'en',
      translations: [],
      delete_flg: true,
      deleted_at: new Date(),
    });

    await roomTagService.init({ room_id: room._id.toString() }, actor);
    await roomTagService.init({ room_id: room._id.toString() }, actor);

    const restoredRoomTag = await RoomTag.findById(existingRoomTag._id).lean();
    expect(restoredRoomTag.delete_flg).toBe(false);
    expect(restoredRoomTag.deleted_at).toBeNull();
    expect(restoredRoomTag.source_floor_tag.toString()).toBe(storedFloorTag._id.toString());
    expect(await RoomAIAnalysisSetting.countDocuments({ room_tag: existingRoomTag._id })).toBe(0);
    expect(await FloorAIAnalysisSetting.countDocuments({ _id: parentFloorSetting._id })).toBe(1);
    const activeRoomTag = await RoomTag.findOne({ room: room._id, name: targetCategory.name, delete_flg: false });
    expect(activeRoomTag._id.toString()).toBe(existingRoomTag._id.toString());
    expect(await RoomAIAnalysisSetting.countDocuments({ room_tag: activeRoomTag._id })).toBe(0);
    expect(await RoomTag.countDocuments({ room: room._id, name: targetCategory.name })).toBe(1);
  });

  test('作成処理を取り消した後に子の設定と対象データを残さない', async () => {
    const { admin, editor, resultUser } = await createActors();
    const categoryTag = await createCategoryTag(admin, { name: 'Rollback tag' });
    await createCommonSetting({ admin, resultUser, categoryTag });
    const floor = await createFloor(editor);
    const room = await createRoom(editor, floor);
    await provisionFloorResources({
      floorId: floor._id,
      userId: editor._id,
      targetLangs: [],
      mediaRoot,
    });
    await provisionRoomResources({
      floorId: floor._id,
      roomId: room._id,
      userId: editor._id,
      targetLangs: [],
      mediaRoot,
    });
    expect(await FloorAIAnalysisSetting.countDocuments({ floor: floor._id })).toBe(1);
    expect(await RoomAIAnalysisSetting.countDocuments({ room: room._id })).toBe(1);

    await rollbackRoomProvisioning({ floorId: floor._id, roomId: room._id, mediaRoot });
    await rollbackFloorProvisioning({ floorId: floor._id, mediaRoot });

    expect(await RoomAIAnalysisSetting.countDocuments({ room: room._id })).toBe(0);
    expect(await FloorAIAnalysisSetting.countDocuments({ floor: floor._id })).toBe(0);
    expect(await RoomTag.countDocuments({ room: room._id })).toBe(0);
    expect(await FloorTag.countDocuments({ floor: floor._id })).toBe(0);
  });

  test('手動作成と初期化が競合しても、コピーした設定は実在する新規タグだけを参照する', async () => {
    const { admin, editor, resultUser } = await createActors();
    const categoryTag = await createCategoryTag(admin, { name: 'Concurrent tag' });
    await createCommonSetting({ admin, resultUser, categoryTag });
    const floor = await createFloor(editor);
    const actor = { user_id: admin._id.toString(), user_role: ROLES.ADMINISTRATOR };

    const [initResult, createResult] = await Promise.allSettled([
      floorTagService.init({ floor_id: floor._id.toString() }, actor),
      floorTagService.create(
        {
          floor_id: floor._id.toString(),
          order: 2,
          name: categoryTag.name,
          lang: 'ja',
        },
        actor
      ),
    ]);
    expect(initResult.status).toBe('fulfilled');
    expect(createResult.status).toBe('fulfilled');

    const tags = await FloorTag.find({ floor: floor._id, name: categoryTag.name }).lean();
    const settings = await FloorAIAnalysisSetting.find({ floor: floor._id }).lean();
    expect(tags.length).toBeGreaterThanOrEqual(1);
    expect(settings.length).toBeLessThanOrEqual(1);
    for (const setting of settings) {
      const referencedTag = tags.find((tag) => tag._id.equals(setting.floor_tag));
      expect(referencedTag).toBeDefined();
      expect(referencedTag.source_category_tag.equals(categoryTag._id)).toBe(true);
    }
  });

  test('確認後に親タグの名前が変わった場合は作成を取り消し、初期化は書込前に止める', async () => {
    const { admin, editor } = await createActors();
    const provisionParent = await createCategoryTag(admin, {
      name: uniqueName('Provision original'),
    });
    const provisionFloor = await createFloor(editor);
    const provisionTranslation = deferred();
    const releaseProvisionTranslation = deferred();
    const translateSpy = jest
      .spyOn(translationService, 'translateTag')
      .mockImplementationOnce(async () => {
        provisionTranslation.resolve();
        await releaseProvisionTranslation.promise;
        return [];
      });

    const provisioning = provisionFloorResources({
      floorId: provisionFloor._id,
      userId: editor._id,
      targetLangs: [],
      mediaRoot,
    });
    const provisioningExpectation = expect(provisioning).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await provisionTranslation.promise;
    await CategoryTag.updateOne(
      { _id: provisionParent._id },
      { $set: { name: uniqueName('Provision renamed') } }
    );
    releaseProvisionTranslation.resolve();

    await provisioningExpectation;
    expect(await FloorTag.countDocuments({ floor: provisionFloor._id })).toBe(0);

    translateSpy.mockRestore();
    const initParent = await createCategoryTag(admin, {
      name: uniqueName('Init original'),
    });
    const initFloor = await createFloor(editor);
    const initTranslation = deferred();
    const releaseInitTranslation = deferred();
    jest.spyOn(translationService, 'translateTag').mockImplementationOnce(async () => {
      initTranslation.resolve();
      await releaseInitTranslation.promise;
      return [];
    });
    const actor = { user_id: admin._id.toString(), user_role: ROLES.ADMINISTRATOR };

    const init = floorTagService.init({ floor_id: initFloor._id.toString() }, actor);
    const initExpectation = expect(init).rejects.toMatchObject({ code: 'CONFLICT' });
    await initTranslation.promise;
    await CategoryTag.updateOne(
      { _id: initParent._id },
      { $set: { name: uniqueName('Init renamed') } }
    );
    releaseInitTranslation.resolve();

    await initExpectation;
    expect(await FloorTag.countDocuments({ floor: initFloor._id })).toBe(0);
  });
});
