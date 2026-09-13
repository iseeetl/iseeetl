const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createTestTempDir, removeDirSafe, trailingSlash } = require('../../_helpers/testRuntime');

const ORIGINAL_ENV = {
  JWT_SECRET: process.env.JWT_SECRET,
  MEDIA_PATH: process.env.MEDIA_PATH,
};

if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-jwt-secret';

const tempMediaRoot = createTestTempDir('floor-room-media');
process.env.MEDIA_PATH = trailingSlash(tempMediaRoot);

jest.mock('../../../services/translation.service', () => ({
  translateTitleAndDescription: jest.fn().mockResolvedValue([]),
  translateTag: jest.fn().mockResolvedValue([]),
  translateQuickTextGroup: jest.fn().mockResolvedValue([]),
  translateQuickTextItem: jest.fn().mockResolvedValue([]),
  translateContent: jest.fn().mockResolvedValue([]),
  translateGuestContent: jest.fn().mockResolvedValue([]),
}));
const mockIsGoogleTranslateEnabled = jest.fn(() => true);
jest.mock('../../../config/featureFlags', () => ({
  ...jest.requireActual('../../../config/featureFlags'),
  isGoogleTranslateEnabled: mockIsGoogleTranslateEnabled,
}));

const floorRouter = require('../../../routes/floor/floor.route');
const roomRouter = require('../../../routes/room/room.route');
const { attachErrorHandler } = require('../_helpers/app');
const User = require('../../../models/User');
const Floor = require('../../../models/Floor');
const Room = require('../../../models/Room');
const FloorMember = require('../../../models/FloorMember');
const RoomMember = require('../../../models/RoomMember');
const FloorTag = require('../../../models/FloorTag');
const RoomTag = require('../../../models/RoomTag');
const FloorAIAnalysisSetting = require('../../../models/FloorAIAnalysisSetting');
const RoomAIAnalysisSetting = require('../../../models/RoomAIAnalysisSetting');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/floor', floorRouter);
  app.use('/room', roomRouter);
  return attachErrorHandler(app);
};

const buildToken = (user) =>
  jwt.sign({ user_id: user._id.toString(), user_role: user.role }, process.env.JWT_SECRET);

const baseFloorPayload = (overrides = {}) => ({
  title: 'Floor Title',
  description: 'Floor Desc',
  floor_display_hidden: false,
  lang: 'ja',
  target_langs: ['en'],
  ...overrides,
});

const baseRoomPayload = (floorId, overrides = {}) => ({
  floor_id: floorId,
  title: 'Room Title',
  description: 'Room Desc',
  lang: 'ja',
  guest_reaction_only: false,
  member_only: false,
  room_display_hidden: false,
  notification: true,
  external_sns_button: false,
  ...overrides,
});

const createActiveFloorAISetting = async ({ floor, user, name }) => {
  const floorTag = await FloorTag.create({
    floor,
    user,
    order: 1,
    name,
    lang: 'ja',
  });
  return FloorAIAnalysisSetting.create({
    floor,
    floor_tag: floorTag._id,
    analysis_kind: 'vision',
    additional_prompt: 'keep floor setting',
    result_user: user,
    user,
    updated_by: user,
  });
};

const createActiveRoomAISetting = async ({ floor, room, user, name }) => {
  const roomTag = await RoomTag.create({
    floor,
    room,
    user,
    order: 1,
    name,
    lang: 'ja',
  });
  return RoomAIAnalysisSetting.create({
    floor,
    room,
    room_tag: roomTag._id,
    analysis_kind: 'vision',
    additional_prompt: 'keep room setting',
    result_user: user,
    user,
    updated_by: user,
  });
};

describe('フロア・ルームの作成・取得・更新・削除と権限', () => {
  let app;

  afterAll(async () => {
    await removeDirSafe(tempMediaRoot);
    if (ORIGINAL_ENV.JWT_SECRET === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL_ENV.JWT_SECRET;
    if (ORIGINAL_ENV.MEDIA_PATH === undefined) delete process.env.MEDIA_PATH;
    else process.env.MEDIA_PATH = ORIGINAL_ENV.MEDIA_PATH;
  });

  beforeEach(() => {
    mockIsGoogleTranslateEnabled.mockReturnValue(true);
    app = buildApp();
  });

  test('フロアは管理者が作成でき、一般ユーザは作成できない', async () => {
    const admin = await User.create({
      username: 'Admin',
      mail: `admin-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Administrator',
    });
    const author = await User.create({
      username: 'Author',
      mail: `author-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Author',
    });

    const ok = await request(app)
      .post('/floor/create')
      .set('Authorization', `Bearer ${buildToken(admin)}`)
      .send(baseFloorPayload());
    expect(ok.status).toBe(200);
    expect(ok.body).toHaveProperty('_id');
    expect(ok.body.title).toBe('Floor Title');

    const ng = await request(app)
      .post('/floor/create')
      .set('Authorization', `Bearer ${buildToken(author)}`)
      .send(baseFloorPayload({ title: 'Denied' }));
    expect(ng.status).toBe(401);
    expect(ng.body?.error?.code).toBe('INVALID_PERMISSION');
  });

  test('作成者以外のフロア編集ユーザはフロアを更新できない', async () => {
    const owner = await User.create({
      username: 'Owner',
      mail: `owner-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });
    const otherEditor = await User.create({
      username: 'Other',
      mail: `other-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });

    const created = await request(app)
      .post('/floor/create')
      .set('Authorization', `Bearer ${buildToken(owner)}`)
      .send(baseFloorPayload({ title: 'Owner Floor' }));

    const floorId = created.body._id;

    const res = await request(app)
      .post('/floor/update')
      .set('Authorization', `Bearer ${buildToken(otherEditor)}`)
      .send({
        _id: floorId,
        title: 'Updated',
        description: 'Desc',
        lang: 'ja',
        target_langs: ['en'],
        image_name: null,
        floor_display_hidden: false,
      });
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
  });

  test('作成者はフロアを更新でき、無関係のユーザは削除できない', async () => {
    const owner = await User.create({
      username: 'OwnerUpdate',
      mail: `owner-update-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });
    const outsider = await User.create({
      username: 'OutsiderUpdate',
      mail: `outsider-update-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Author',
    });

    const created = await request(app)
      .post('/floor/create')
      .set('Authorization', `Bearer ${buildToken(owner)}`)
      .send(baseFloorPayload({ title: 'Before Update' }));

    const floorId = created.body._id;

    const updated = await request(app)
      .post('/floor/update')
      .set('Authorization', `Bearer ${buildToken(owner)}`)
      .send({
        _id: floorId,
        title: 'After Update',
        description: 'Updated Desc',
        lang: 'ja',
        target_langs: ['en'],
        image_name: null,
        floor_display_hidden: false,
      });
    expect(updated.status).toBe(200);
    expect(updated.body.title).toBe('After Update');

    const forbidden = await request(app)
      .post('/floor/delete')
      .set('Authorization', `Bearer ${buildToken(outsider)}`)
      .send({ _id: floorId });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body?.error?.code).toBe('FORBIDDEN');

    const deleted = await request(app)
      .post('/floor/delete')
      .set('Authorization', `Bearer ${buildToken(owner)}`)
      .send({ _id: floorId });
    expect(deleted.status).toBe(200);
    expect(deleted.body.delete_flg).toBe(true);
  });

  test('有効なAI解析設定があってもフロアを削除でき、復元後も設定を保持する', async () => {
    const admin = await User.create({
      username: 'FloorAISettingDeleteAdmin',
      mail: `floor-ai-setting-delete-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Administrator',
    });
    const floor = await Floor.create({
      user: admin._id,
      title: 'Floor With Active AI Settings',
      description: 'desc',
      lang: 'ja',
      target_langs: [],
    });
    const room = await Room.create({
      user: admin._id,
      floor: floor._id,
      title: 'Room With Active AI Setting',
      description: 'desc',
      lang: 'ja',
    });
    const floorSetting = await createActiveFloorAISetting({
      floor: floor._id,
      user: admin._id,
      name: 'Floor Delete Setting Tag',
    });
    const roomSetting = await createActiveRoomAISetting({
      floor: floor._id,
      room: room._id,
      user: admin._id,
      name: 'Floor Delete Room Setting Tag',
    });
    const token = buildToken(admin);

    const deleted = await request(app)
      .post('/floor/delete')
      .set('Authorization', `Bearer ${token}`)
      .send({ _id: floor._id.toString() });

    expect(deleted.status).toBe(200);
    expect(deleted.body.delete_flg).toBe(true);
    expect((await Room.findById(room._id).lean()).delete_flg).toBe(false);
    expect(await FloorAIAnalysisSetting.findById(floorSetting._id).lean()).toMatchObject({
      analysis_kind: 'vision',
      additional_prompt: 'keep floor setting',
      delete_flg: false,
    });
    expect(await RoomAIAnalysisSetting.findById(roomSetting._id).lean()).toMatchObject({
      analysis_kind: 'vision',
      additional_prompt: 'keep room setting',
      delete_flg: false,
    });

    const restored = await request(app)
      .post('/floor/management/delete-state')
      .set('Authorization', `Bearer ${token}`)
      .send({ _id: floor._id.toString(), delete_flg: false });

    expect(restored.status).toBe(200);
    expect((await Floor.findById(floor._id).lean()).delete_flg).toBe(false);
    expect((await FloorAIAnalysisSetting.findById(floorSetting._id).lean()).delete_flg).toBe(false);
    expect((await RoomAIAnalysisSetting.findById(roomSetting._id).lean()).delete_flg).toBe(false);
  });

  test('作成者・メンバー・一般ユーザに応じたフロアのロールを返す', async () => {
    const owner = await User.create({
      username: 'Owner',
      mail: `owner-role-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });
    const member = await User.create({
      username: 'Member',
      mail: `member-role-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Author',
    });
    const outsider = await User.create({
      username: 'Outsider',
      mail: `outsider-role-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Author',
    });

    const floor = await Floor.create({
      user: owner._id,
      title: 'Role Floor',
      description: 'desc',
      lang: 'ja',
    });
    await FloorMember.create({ floor: floor._id, user: member._id });

    const ownerRole = await request(app)
      .post('/floor/role')
      .set('Authorization', `Bearer ${buildToken(owner)}`)
      .send({ floor_id: floor._id.toString() });
    expect(ownerRole.status).toBe(200);
    expect(ownerRole.body.role).toBe('FloorEditor');

    const memberRole = await request(app)
      .post('/floor/role')
      .set('Authorization', `Bearer ${buildToken(member)}`)
      .send({ floor_id: floor._id.toString() });
    expect(memberRole.status).toBe(200);
    expect(memberRole.body.role).toBe('FloorMember');

    const outsiderRole = await request(app)
      .post('/floor/role')
      .set('Authorization', `Bearer ${buildToken(outsider)}`)
      .send({ floor_id: floor._id.toString() });
    expect(outsiderRole.status).toBe(200);
    expect(outsiderRole.body.role).toBe('Author');
  });

  test('作成したフロアを一覧と詳細で取得できる', async () => {
    const admin = await User.create({
      username: 'PaginateAdmin',
      mail: `paginate-admin-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Administrator',
    });

    const floor = await Floor.create({
      user: admin._id,
      title: 'Paginate Floor',
      description: 'desc',
      lang: 'ja',
      target_langs: [],
    });

    const list = await request(app)
      .post('/floor/paginate')
      .set('Authorization', `Bearer ${buildToken(admin)}`)
      .send({ page: 1, search: '' });

    expect(list.status).toBe(200);
    expect(list.body.docs.some((row) => row._id === floor._id.toString())).toBe(true);

    const detail = await request(app).post('/floor/detail').send({ _id: floor._id.toString() });
    expect(detail.status).toBe(200);
    expect(detail.body._id).toBe(floor._id.toString());
  });

  test('フロア編集ユーザがフロアの表示・非表示を一括変更できる', async () => {
    const editor = await User.create({
      username: 'DisplayEditor',
      mail: `display-editor-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });
    await Floor.create({
      user: editor._id,
      title: 'Display Floor',
      description: 'desc',
      lang: 'ja',
      target_langs: [],
      floor_display_hidden: false,
    });

    const res = await request(app)
      .post('/floor/update/floordisplayhidden')
      .set('Authorization', `Bearer ${buildToken(editor)}`)
      .send({ floor_display_hidden: true });

    expect(res.status).toBe(200);
    expect(res.body.modified).toBeGreaterThanOrEqual(1);
  });

  test('フロアの表示・非表示は管理者が変更でき、一般ユーザは変更できない', async () => {
    const admin = await User.create({
      username: 'DisplayAdmin',
      mail: `display-admin-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Administrator',
    });
    const author = await User.create({
      username: 'DisplayAuthor',
      mail: `display-author-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Author',
    });

    await Floor.create({
      user: admin._id,
      title: 'Admin Floor',
      description: 'desc',
      lang: 'ja',
      target_langs: [],
      floor_display_hidden: false,
    });

    const adminRes = await request(app)
      .post('/floor/update/floordisplayhidden')
      .set('Authorization', `Bearer ${buildToken(admin)}`)
      .send({ floor_display_hidden: true });
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.modified).toBeGreaterThanOrEqual(1);

    const authorRes = await request(app)
      .post('/floor/update/floordisplayhidden')
      .set('Authorization', `Bearer ${buildToken(author)}`)
      .send({ floor_display_hidden: false });
    expect(authorRes.status).toBe(401);
    expect(authorRes.body?.error?.code).toBe('INVALID_PERMISSION');
  });
  test('フロア編集ユーザは所属する非表示フロアを一覧で取得できる', async () => {
    const editor = await User.create({
      username: 'EditorViewer',
      mail: `editor-viewer-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });
    const other = await User.create({
      username: 'OtherOwner',
      mail: `other-owner-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });

    const visible = await Floor.create({
      user: other._id,
      title: 'Visible Floor',
      description: 'desc',
      lang: 'ja',
      floor_display_hidden: false,
    });
    const hiddenOwned = await Floor.create({
      user: editor._id,
      title: 'Hidden Owned',
      description: 'desc',
      lang: 'ja',
      floor_display_hidden: true,
    });
    const hiddenMember = await Floor.create({
      user: other._id,
      title: 'Hidden Member',
      description: 'desc',
      lang: 'ja',
      floor_display_hidden: true,
    });
    await FloorMember.create({ floor: hiddenMember._id, user: editor._id });
    const hiddenOther = await Floor.create({
      user: other._id,
      title: 'Hidden Other',
      description: 'desc',
      lang: 'ja',
      floor_display_hidden: true,
    });

    const res = await request(app)
      .post('/floor/paginate')
      .set('Authorization', `Bearer ${buildToken(editor)}`)
      .send({ page: 1, search: '' });

    expect(res.status).toBe(200);
    const ids = res.body.docs.map((row) => row._id);
    expect(ids).toEqual(expect.arrayContaining([visible._id.toString(), hiddenOwned._id.toString(), hiddenMember._id.toString()]));
    expect(ids).not.toContain(hiddenOther._id.toString());

    const searchRes = await request(app)
      .post('/floor/paginate')
      .set('Authorization', `Bearer ${buildToken(editor)}`)
      .send({ page: 1, search: 'Hidden Member' });
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.docs.some((row) => row._id === hiddenMember._id.toString())).toBe(true);
  });

  test('一般ユーザは所属する非表示フロアを一覧で取得できる', async () => {
    const author = await User.create({
      username: 'AuthorViewer',
      mail: `author-viewer-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Author',
    });
    const other = await User.create({
      username: 'AuthorOwner',
      mail: `author-owner-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });

    const visible = await Floor.create({
      user: other._id,
      title: 'Author Visible',
      description: 'desc',
      lang: 'ja',
      floor_display_hidden: false,
    });
    const hiddenMember = await Floor.create({
      user: other._id,
      title: 'Author Hidden Member',
      description: 'desc',
      lang: 'ja',
      floor_display_hidden: true,
    });
    await FloorMember.create({ floor: hiddenMember._id, user: author._id });
    const hiddenOther = await Floor.create({
      user: other._id,
      title: 'Author Hidden Other',
      description: 'desc',
      lang: 'ja',
      floor_display_hidden: true,
    });

    const res = await request(app)
      .post('/floor/paginate')
      .set('Authorization', `Bearer ${buildToken(author)}`)
      .send({ page: 1, search: '' });

    expect(res.status).toBe(200);
    const ids = res.body.docs.map((row) => row._id);
    expect(ids).toEqual(expect.arrayContaining([visible._id.toString(), hiddenMember._id.toString()]));
    expect(ids).not.toContain(hiddenOther._id.toString());
  });

  test('管理者は管理用のフロア一覧取得と更新ができる', async () => {
    const admin = await User.create({
      username: 'ManageAdmin',
      mail: `manage-admin-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Administrator',
    });
    const floor = await Floor.create({
      user: admin._id,
      title: 'Manage Floor',
      description: 'desc',
      lang: 'ja',
      target_langs: ['en'],
      floor_display_hidden: false,
    });

    const token = buildToken(admin);

    const paginate = await request(app)
      .get('/floor/management/paginate?page=1&search=')
      .set('Authorization', `Bearer ${token}`);
    expect(paginate.status).toBe(200);
    expect(paginate.body).toHaveProperty('docs');

    const update = await request(app)
      .post('/floor/management/update')
      .set('Authorization', `Bearer ${token}`)
      .send({
        _id: floor._id.toString(),
        title: 'Manage Floor Updated',
        description: 'updated',
        lang: 'ja',
        target_langs: ['en'],
        image_name: null,
        floor_display_hidden: false,
        delete_flg: false,
      });
    expect(update.status).toBe(200);
    expect(update.body.title).toBe('Manage Floor Updated');

    const conflict = await request(app)
      .post('/floor/management/update')
      .set('Authorization', `Bearer ${token}`)
      .send({
        _id: floor._id.toString(),
        title: 'Stale Floor Update',
        description: 'stale',
        lang: 'ja',
        target_langs: ['en'],
        image_name: null,
        floor_display_hidden: false,
        delete_flg: true,
      });
    expect(conflict.status).toBe(409);
    const unchanged = await Floor.findById(floor._id).lean();
    expect(unchanged).toMatchObject({
      title: 'Manage Floor Updated',
      description: 'updated',
      delete_flg: false,
    });
    expect(unchanged.deleted_at).toBeNull();
  });

  test('管理用フロア一覧で検索語と有効・削除済み・全件の条件を組み合わせる', async () => {
    const admin = await User.create({
      username: 'FloorFilterAdmin',
      mail: `floor-filter-admin-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Administrator',
    });
    const prefix = 'FloorLifecycleFilter';
    await Floor.create([
      ...Array.from({ length: 11 }, (_, index) => ({
        user: admin._id,
        title: `${prefix} Active ${index}`,
        description: 'matching floor',
        lang: 'ja',
        target_langs: [],
        delete_flg: false,
      })),
      ...Array.from({ length: 2 }, (_, index) => ({
        user: admin._id,
        title: `${prefix} Deleted ${index}`,
        description: 'matching floor',
        lang: 'ja',
        target_langs: [],
        delete_flg: true,
        deleted_at: new Date(),
      })),
      {
        user: admin._id,
        title: 'Unmatched Floor',
        description: 'noise',
        lang: 'ja',
        target_langs: [],
      },
    ]);
    const paginate = (payload) =>
      request(app)
        .post('/floor/management/paginate')
        .set('Authorization', `Bearer ${buildToken(admin)}`)
        .send({ page: 1, search: prefix, ...payload });

    const [active, deleted, all] = await Promise.all([
      paginate({ delete_flg: false }),
      paginate({ delete_flg: true }),
      paginate({}),
    ]);

    expect(active.status).toBe(200);
    expect(active.body).toMatchObject({ total: 11, pages: 2, page: 1 });
    expect(active.body.docs).toHaveLength(10);
    expect(active.body.docs.every((floor) => floor.delete_flg === false)).toBe(true);
    expect(deleted.status).toBe(200);
    expect(deleted.body).toMatchObject({ total: 2, pages: 1, page: 1 });
    expect(deleted.body.docs).toHaveLength(2);
    expect(deleted.body.docs.every((floor) => floor.delete_flg === true)).toBe(true);
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ total: 13, pages: 2, page: 1 });
    expect(all.body.docs).toHaveLength(10);
    expect(all.body.docs.every((floor) => floor.title.includes(prefix))).toBe(true);
    expect(all.body.docs.every((floor) => floor.user.username === 'FloorFilterAdmin')).toBe(true);
  });

  test('管理者は論理削除済みのフロアの詳細を取得できる', async () => {
    const admin = await User.create({
      username: 'FloorDetailAdmin',
      mail: `floor-detail-admin-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Administrator',
    });
    const deletedFloor = await Floor.create({
      user: admin._id,
      title: 'Deleted Detail Floor',
      description: 'recover timeline data',
      lang: 'ja',
      target_langs: [],
      delete_flg: true,
      deleted_at: new Date(),
    });

    const response = await request(app)
      .post('/floor/management/detail')
      .set('Authorization', `Bearer ${buildToken(admin)}`)
      .send({ _id: deletedFloor._id.toString() });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      _id: deletedFloor._id.toString(),
      title: 'Deleted Detail Floor',
      delete_flg: true,
    });
    expect(response.body.user.username).toBe('FloorDetailAdmin');
  });

  test('フロアの削除状態を変えても入力項目とAI解析設定を復元まで保持する', async () => {
    const admin = await User.create({
      username: 'FloorLifecycleAdmin',
      mail: `floor-lifecycle-admin-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Administrator',
    });
    const floor = await Floor.create({
      user: admin._id,
      title: 'Lifecycle Floor',
      description: 'Lifecycle floor description',
      lang: 'ja',
      target_langs: ['en'],
      image_name: 'floor.png',
      floor_display_hidden: true,
    });
    const room = await Room.create({
      user: admin._id,
      floor: floor._id,
      title: 'Lifecycle Child Room',
      description: 'desc',
      lang: 'ja',
    });
    const floorSetting = await createActiveFloorAISetting({
      floor: floor._id,
      user: admin._id,
      name: 'Lifecycle Floor Setting Tag',
    });
    const roomSetting = await createActiveRoomAISetting({
      floor: floor._id,
      room: room._id,
      user: admin._id,
      name: 'Lifecycle Room Setting Tag',
    });
    const setState = (target, delete_flg) =>
      request(app)
        .post('/floor/management/delete-state')
        .set('Authorization', `Bearer ${buildToken(admin)}`)
        .send({ _id: target._id.toString(), delete_flg });

    const deleted = await setState(floor, true);
    const deletedFloor = await Floor.findById(floor._id).lean();
    expect(deleted.status).toBe(200);
    expect(deletedFloor).toMatchObject({
      title: 'Lifecycle Floor',
      description: 'Lifecycle floor description',
      lang: 'ja',
      target_langs: ['en'],
      image_name: 'floor.png',
      floor_display_hidden: true,
      delete_flg: true,
    });
    expect(deletedFloor.user.toString()).toBe(admin._id.toString());
    expect(deletedFloor.deleted_at).toBeInstanceOf(Date);
    expect((await FloorAIAnalysisSetting.findById(floorSetting._id).lean()).delete_flg).toBe(false);
    expect((await RoomAIAnalysisSetting.findById(roomSetting._id).lean()).delete_flg).toBe(false);

    const restored = await setState(floor, false);
    const restoredFloor = await Floor.findById(floor._id).lean();
    expect(restored.status).toBe(200);
    expect(restoredFloor).toMatchObject({
      title: 'Lifecycle Floor',
      description: 'Lifecycle floor description',
      lang: 'ja',
      target_langs: ['en'],
      image_name: 'floor.png',
      floor_display_hidden: true,
      delete_flg: false,
    });
    expect(restoredFloor.deleted_at).toBeNull();
    expect((await FloorAIAnalysisSetting.findById(floorSetting._id).lean()).delete_flg).toBe(false);
    expect((await RoomAIAnalysisSetting.findById(roomSetting._id).lean()).delete_flg).toBe(false);
  });

  test('フロアメンバーはルームを作成でき、無関係のユーザは作成できない', async () => {
    const owner = await User.create({
      username: 'Owner2',
      mail: `owner2-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });
    const member = await User.create({
      username: 'Member2',
      mail: `member2-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Author',
    });
    const outsider = await User.create({
      username: 'Outsider2',
      mail: `outsider2-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Author',
    });

    const floor = await Floor.create({
      user: owner._id,
      title: 'Room Floor',
      description: 'desc',
      lang: 'ja',
      target_langs: [],
    });

    const forbidden = await request(app)
      .post('/room/create')
      .set('Authorization', `Bearer ${buildToken(outsider)}`)
      .send(baseRoomPayload(floor._id.toString()));
    expect(forbidden.status).toBe(403);
    expect(forbidden.body?.error?.code).toBe('FORBIDDEN');

    await FloorMember.create({ floor: floor._id, user: member._id });

    const created = await request(app)
      .post('/room/create')
      .set('Authorization', `Bearer ${buildToken(member)}`)
      .send(baseRoomPayload(floor._id.toString(), { title: 'Member Room' }));
    expect(created.status).toBe(200);
    expect(created.body).toHaveProperty('_id');
    expect(created.body.title).toBe('Member Room');
  });

  test('フロアメンバーはルームを更新・削除でき、無関係のユーザは操作できない', async () => {
    const owner = await User.create({
      username: 'RoomOwner',
      mail: `room-owner-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });
    const member = await User.create({
      username: 'RoomMember',
      mail: `room-member-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Author',
    });
    const outsider = await User.create({
      username: 'RoomOutsider',
      mail: `room-outsider-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Author',
    });

    const floor = await Floor.create({
      user: owner._id,
      title: 'Room Update Floor',
      description: 'desc',
      lang: 'ja',
      target_langs: [],
    });

    await FloorMember.create({ floor: floor._id, user: member._id });

    const created = await request(app)
      .post('/room/create')
      .set('Authorization', `Bearer ${buildToken(owner)}`)
      .send(baseRoomPayload(floor._id.toString(), { title: 'Room Before' }));
    expect(created.status).toBe(200);

    const roomId = created.body._id;

    const updated = await request(app)
      .post('/room/update')
      .set('Authorization', `Bearer ${buildToken(member)}`)
      .send({
        _id: roomId,
        title: 'Room After',
        description: 'Updated Desc',
        lang: 'ja',
        image_name: null,
        guest_reaction_only: false,
        member_only: false,
        room_display_hidden: false,
        notification: true,
        external_sns_button: false,
      });
    expect(updated.status).toBe(200);
    expect(updated.body.title).toBe('Room After');

    const forbidden = await request(app)
      .post('/room/delete')
      .set('Authorization', `Bearer ${buildToken(outsider)}`)
      .send({ _id: roomId });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body?.error?.code).toBe('FORBIDDEN');

    const deleted = await request(app)
      .post('/room/delete')
      .set('Authorization', `Bearer ${buildToken(member)}`)
      .send({ _id: roomId });
    expect(deleted.status).toBe(200);
    expect(deleted.body.delete_flg).toBe(true);
  });

  test('有効なAI解析設定があってもルームを削除でき、復元後も設定を保持する', async () => {
    const admin = await User.create({
      username: 'RoomAISettingDeleteAdmin',
      mail: `room-ai-setting-delete-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Administrator',
    });
    const floor = await Floor.create({
      user: admin._id,
      title: 'Room AI Setting Delete Floor',
      description: 'desc',
      lang: 'ja',
      target_langs: [],
    });
    const room = await Room.create({
      user: admin._id,
      floor: floor._id,
      title: 'Room With Active AI Setting',
      description: 'desc',
      lang: 'ja',
    });
    const roomSetting = await createActiveRoomAISetting({
      floor: floor._id,
      room: room._id,
      user: admin._id,
      name: 'Room Delete Setting Tag',
    });
    const token = buildToken(admin);

    const deleted = await request(app)
      .post('/room/delete')
      .set('Authorization', `Bearer ${token}`)
      .send({ _id: room._id.toString() });

    expect(deleted.status).toBe(200);
    expect(deleted.body.delete_flg).toBe(true);
    expect(await RoomAIAnalysisSetting.findById(roomSetting._id).lean()).toMatchObject({
      analysis_kind: 'vision',
      additional_prompt: 'keep room setting',
      delete_flg: false,
    });

    const restored = await request(app)
      .post('/room/management/delete-state')
      .set('Authorization', `Bearer ${token}`)
      .send({ _id: room._id.toString(), delete_flg: false });

    expect(restored.status).toBe(200);
    expect((await Room.findById(room._id).lean()).delete_flg).toBe(false);
    expect((await RoomAIAnalysisSetting.findById(roomSetting._id).lean()).delete_flg).toBe(false);
  });

  test('作成したルームを一覧と詳細で取得できる', async () => {
    const owner = await User.create({
      username: 'RoomLister',
      mail: `room-lister-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });
    const floor = await Floor.create({
      user: owner._id,
      title: 'List Floor',
      description: 'desc',
      lang: 'ja',
      target_langs: [],
    });
    const room = await Room.create({
      user: owner._id,
      floor: floor._id,
      title: 'List Room',
      description: 'desc',
      lang: 'ja',
      guest_reaction_only: false,
      member_only: true,
      room_display_hidden: false,
      notification: true,
      external_sns_button: false,
    });

    const list = await request(app)
      .post('/room')
      .set('Authorization', `Bearer ${buildToken(owner)}`)
      .send({ floor_id: floor._id.toString() });
    expect(list.status).toBe(200);
    const ownerRoom = list.body.find((row) => row._id === room._id.toString());
    expect(ownerRoom).toBeDefined();
    expect(ownerRoom.current_user_is_room_member).toBe(false);

    const roomMemberUser = await User.create({
      username: 'RoomListMember',
      mail: `room-list-member-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Author',
    });
    await RoomMember.create({ floor: floor._id, room: room._id, user: roomMemberUser._id });

    const memberList = await request(app)
      .post('/room')
      .set('Authorization', `Bearer ${buildToken(roomMemberUser)}`)
      .send({ floor_id: floor._id.toString() });
    expect(memberList.status).toBe(200);
    expect(
      memberList.body.find((row) => row._id === room._id.toString()).current_user_is_room_member
    ).toBe(true);

    const detail = await request(app).post('/room/detail').send({ _id: room._id.toString() });
    expect(detail.status).toBe(200);
    expect(detail.body._id).toBe(room._id.toString());
  });

  test('ユーザ削除後はそのトークンでフロア・ルーム一覧を取得できない', async () => {
    const user = await User.create({
      username: 'DeletedListUser',
      mail: `deleted-list-user-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Administrator',
    });
    const floor = await Floor.create({
      user: user._id,
      title: 'Deleted User Floor',
      description: 'desc',
      lang: 'ja',
      target_langs: [],
    });
    const token = buildToken(user);
    await User.updateOne({ _id: user._id }, { $set: { delete_flg: true, deleted_at: new Date() } });

    const floorList = await request(app)
      .post('/floor/paginate')
      .set('Authorization', `Bearer ${token}`)
      .send({ page: 1, search: '' });
    expect(floorList.status).toBe(401);
    expect(floorList.body?.error?.code).toBe('TOKEN_INVALID');

    const roomList = await request(app)
      .post('/room')
      .set('Authorization', `Bearer ${token}`)
      .send({ floor_id: floor._id.toString() });
    expect(roomList.status).toBe(401);
    expect(roomList.body?.error?.code).toBe('TOKEN_INVALID');
  });

  test('親フロアが削除済みなら有効なルームの詳細も取得できない', async () => {
    const owner = await User.create({
      username: 'DeletedFloorRoomOwner',
      mail: `deleted-floor-room-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });
    const floor = await Floor.create({
      user: owner._id,
      title: 'Deleted Parent Floor',
      description: 'desc',
      lang: 'ja',
      target_langs: [],
    });
    const room = await Room.create({
      user: owner._id,
      floor: floor._id,
      title: 'Active Child Room',
      description: 'desc',
      lang: 'ja',
      guest_reaction_only: false,
      member_only: false,
      room_display_hidden: false,
      notification: true,
      external_sns_button: false,
    });

    const deletedFloor = await request(app)
      .post('/floor/delete')
      .set('Authorization', `Bearer ${buildToken(owner)}`)
      .send({ _id: floor._id.toString() });
    expect(deletedFloor.status).toBe(200);

    const detail = await request(app).post('/room/detail').send({ _id: room._id.toString() });
    expect(detail.status).toBe(404);
    expect(detail.body?.error?.code).toBe('NOT_FOUND');

    const persistedRoom = await Room.findById(room._id);
    expect(persistedRoom.delete_flg).toBe(false);
  });

  test('ルームの表示・非表示と表示順を更新できる', async () => {
    const owner = await User.create({
      username: 'OrderOwner',
      mail: `order-owner-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });
    const floor = await Floor.create({
      user: owner._id,
      title: 'Order Floor',
      description: 'desc',
      lang: 'ja',
      target_langs: [],
    });
    const roomA = await Room.create({
      user: owner._id,
      floor: floor._id,
      title: 'Order Room A',
      description: 'desc',
      lang: 'ja',
      display_order: 1,
      guest_reaction_only: false,
      member_only: false,
      room_display_hidden: false,
      notification: true,
      external_sns_button: false,
    });
    const roomB = await Room.create({
      user: owner._id,
      floor: floor._id,
      title: 'Order Room B',
      description: 'desc',
      lang: 'ja',
      display_order: 2,
      guest_reaction_only: false,
      member_only: false,
      room_display_hidden: false,
      notification: true,
      external_sns_button: false,
    });

    const hidden = await request(app)
      .post('/room/update/roomdisplayhidden')
      .set('Authorization', `Bearer ${buildToken(owner)}`)
      .send({ floor_id: floor._id.toString(), room_display_hidden: true });
    expect(hidden.status).toBe(200);
    expect(hidden.body.modified).toBeGreaterThanOrEqual(2);

    const order = await request(app)
      .post('/room/update/displayorder')
      .set('Authorization', `Bearer ${buildToken(owner)}`)
      .send({
        floor_id: floor._id.toString(),
        displayorders: [
          { _id: roomA._id.toString(), display_order: 101 },
          { _id: roomB._id.toString(), display_order: 1 },
        ],
      });
    expect(order.status).toBe(200);
    expect(order.body).toBe(200);

    const updatedA = await Room.findById(roomA._id);
    const updatedB = await Room.findById(roomB._id);
    expect(updatedA.display_order).toBe(101);
    expect(updatedB.display_order).toBe(1);
  });

  test('無関係のユーザはルームの表示・非表示と表示順を変更できない', async () => {
    const owner = await User.create({
      username: 'RoomOwnerReject',
      mail: `room-owner-reject-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });
    const outsider = await User.create({
      username: 'RoomOutsiderReject',
      mail: `room-outsider-reject-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Author',
    });
    const floor = await Floor.create({
      user: owner._id,
      title: 'Reject Floor',
      description: 'desc',
      lang: 'ja',
      target_langs: [],
    });
    const room = await Room.create({
      user: owner._id,
      floor: floor._id,
      title: 'Reject Room',
      description: 'desc',
      lang: 'ja',
      guest_reaction_only: false,
      member_only: false,
      room_display_hidden: false,
      notification: true,
      external_sns_button: false,
    });

    const hiddenRes = await request(app)
      .post('/room/update/roomdisplayhidden')
      .set('Authorization', `Bearer ${buildToken(outsider)}`)
      .send({ floor_id: floor._id.toString(), room_display_hidden: true });
    expect(hiddenRes.status).toBe(403);
    expect(hiddenRes.body?.error?.code).toBe('FORBIDDEN');

    const orderRes = await request(app)
      .post('/room/update/displayorder')
      .set('Authorization', `Bearer ${buildToken(outsider)}`)
      .send({
        floor_id: floor._id.toString(),
        displayorders: [{ _id: room._id.toString(), display_order: 1 }],
      });
    expect(orderRes.status).toBe(403);
    expect(orderRes.body?.error?.code).toBe('FORBIDDEN');
  });

  test('管理者は管理用のルーム一覧取得と更新ができる', async () => {
    const admin = await User.create({
      username: 'RoomAdmin',
      mail: `room-admin-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Administrator',
    });
    const floor = await Floor.create({
      user: admin._id,
      title: 'Room Manage Floor',
      description: 'desc',
      lang: 'ja',
      target_langs: [],
    });
    const room = await Room.create({
      user: admin._id,
      floor: floor._id,
      title: 'Room Manage',
      description: 'desc',
      lang: 'ja',
      guest_reaction_only: false,
      member_only: false,
      room_display_hidden: false,
      notification: true,
      external_sns_button: false,
    });
    const otherFloor = await Floor.create({
      user: admin._id,
      title: 'Other Room Manage Floor',
      description: 'desc',
      lang: 'ja',
      target_langs: [],
    });
    const otherRoom = await Room.create({
      user: admin._id,
      floor: otherFloor._id,
      title: 'Other Room Manage',
      description: 'desc',
      lang: 'ja',
      guest_reaction_only: false,
      member_only: false,
      room_display_hidden: false,
      notification: true,
      external_sns_button: false,
    });

    const token = buildToken(admin);

    const paginate = await request(app)
      .get('/room/management/paginate?page=1')
      .query({ search: '', floor_id: floor._id.toString() })
      .set('Authorization', `Bearer ${token}`);
    expect(paginate.status).toBe(200);
    expect(paginate.body).toHaveProperty('docs');
    expect(paginate.body.docs.some((row) => row._id === room._id.toString())).toBe(true);
    expect(paginate.body.docs.some((row) => row._id === otherRoom._id.toString())).toBe(false);

    const update = await request(app)
      .post('/room/management/update')
      .set('Authorization', `Bearer ${token}`)
      .send({
        _id: room._id.toString(),
        title: 'Room Manage Updated',
        description: 'updated',
        lang: 'ja',
        image_name: null,
        guest_reaction_only: false,
        member_only: false,
        room_display_hidden: false,
        notification: true,
        external_sns_button: false,
        delete_flg: false,
      });
    expect(update.status).toBe(200);
    expect(update.body.title).toBe('Room Manage Updated');

    const conflict = await request(app)
      .post('/room/management/update')
      .set('Authorization', `Bearer ${token}`)
      .send({
        _id: room._id.toString(),
        title: 'Stale Room Update',
        description: 'stale',
        lang: 'ja',
        image_name: null,
        guest_reaction_only: false,
        member_only: false,
        room_display_hidden: false,
        notification: true,
        external_sns_button: false,
        delete_flg: true,
      });
    expect(conflict.status).toBe(409);
    const unchanged = await Room.findById(room._id).lean();
    expect(unchanged).toMatchObject({
      title: 'Room Manage Updated',
      description: 'updated',
      delete_flg: false,
    });
    expect(unchanged.deleted_at).toBeNull();
  });

  test('管理用ルーム一覧で検索語と有効・削除済み・全件の条件を組み合わせる', async () => {
    const admin = await User.create({
      username: 'RoomFilterAdmin',
      mail: `room-filter-admin-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Administrator',
    });
    const floor = await Floor.create({
      user: admin._id,
      title: 'Room Filter Floor',
      description: 'desc',
      lang: 'ja',
      target_langs: [],
    });
    const prefix = 'RoomLifecycleFilter';
    await Room.create([
      ...Array.from({ length: 11 }, (_, index) => ({
        user: admin._id,
        floor: floor._id,
        title: `${prefix} Active ${index}`,
        description: 'matching room',
        lang: 'ja',
        delete_flg: false,
      })),
      ...Array.from({ length: 2 }, (_, index) => ({
        user: admin._id,
        floor: floor._id,
        title: `${prefix} Deleted ${index}`,
        description: 'matching room',
        lang: 'ja',
        delete_flg: true,
        deleted_at: new Date(),
      })),
      {
        user: admin._id,
        floor: floor._id,
        title: 'Unmatched Room',
        description: 'noise',
        lang: 'ja',
      },
    ]);
    const paginate = (payload) =>
      request(app)
        .post('/room/management/paginate')
        .set('Authorization', `Bearer ${buildToken(admin)}`)
        .send({ page: 1, search: prefix, floor_id: floor._id.toString(), ...payload });

    const [active, deleted, all] = await Promise.all([
      paginate({ delete_flg: false }),
      paginate({ delete_flg: true }),
      paginate({}),
    ]);

    expect(active.status).toBe(200);
    expect(active.body).toMatchObject({ total: 11, pages: 2, page: 1 });
    expect(active.body.docs).toHaveLength(10);
    expect(active.body.docs.every((room) => room.delete_flg === false)).toBe(true);
    expect(deleted.status).toBe(200);
    expect(deleted.body).toMatchObject({ total: 2, pages: 1, page: 1 });
    expect(deleted.body.docs).toHaveLength(2);
    expect(deleted.body.docs.every((room) => room.delete_flg === true)).toBe(true);
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ total: 13, pages: 2, page: 1 });
    expect(all.body.docs).toHaveLength(10);
    expect(all.body.docs.every((room) => room.title.includes(prefix))).toBe(true);
    expect(all.body.docs.every((room) => room.floor.title === 'Room Filter Floor')).toBe(true);
  });

  test('ルームの削除状態を変えても項目とAI解析設定を保持し、親フロア削除中の復元は拒否する', async () => {
    const admin = await User.create({
      username: 'RoomLifecycleAdmin',
      mail: `room-lifecycle-admin-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Administrator',
    });
    const floor = await Floor.create({
      user: admin._id,
      title: 'Room Lifecycle Floor',
      description: 'desc',
      lang: 'ja',
      target_langs: [],
    });
    const room = await Room.create({
      user: admin._id,
      floor: floor._id,
      display_order: 7,
      title: 'Lifecycle Room',
      description: 'Lifecycle room description',
      lang: 'ja',
      image_name: 'room.png',
      guest_reaction_only: true,
      member_only: true,
      room_display_hidden: true,
      notification: false,
      external_sns_button: true,
    });
    const roomSetting = await createActiveRoomAISetting({
      floor: floor._id,
      room: room._id,
      user: admin._id,
      name: 'Lifecycle Room Setting Tag',
    });
    const setState = (target, delete_flg) =>
      request(app)
        .post('/room/management/delete-state')
        .set('Authorization', `Bearer ${buildToken(admin)}`)
        .send({ _id: target._id.toString(), delete_flg });

    const deleted = await setState(room, true);
    const deletedRoom = await Room.findById(room._id).lean();
    expect(deleted.status).toBe(200);
    expect(deletedRoom).toMatchObject({
      display_order: 7,
      title: 'Lifecycle Room',
      description: 'Lifecycle room description',
      lang: 'ja',
      image_name: 'room.png',
      guest_reaction_only: true,
      member_only: true,
      room_display_hidden: true,
      notification: false,
      external_sns_button: true,
      delete_flg: true,
    });
    expect(deletedRoom.floor.toString()).toBe(floor._id.toString());
    expect(deletedRoom.user.toString()).toBe(admin._id.toString());
    expect(deletedRoom.deleted_at).toBeInstanceOf(Date);
    expect((await RoomAIAnalysisSetting.findById(roomSetting._id).lean()).delete_flg).toBe(false);

    const restored = await setState(room, false);
    const restoredRoom = await Room.findById(room._id).lean();
    expect(restored.status).toBe(200);
    expect(restoredRoom).toMatchObject({
      display_order: 7,
      title: 'Lifecycle Room',
      description: 'Lifecycle room description',
      lang: 'ja',
      image_name: 'room.png',
      guest_reaction_only: true,
      member_only: true,
      room_display_hidden: true,
      notification: false,
      external_sns_button: true,
      delete_flg: false,
    });
    expect(restoredRoom.deleted_at).toBeNull();
    expect((await RoomAIAnalysisSetting.findById(roomSetting._id).lean()).delete_flg).toBe(false);

    expect((await setState(room, true)).status).toBe(200);
    await Floor.updateOne(
      { _id: floor._id },
      { $set: { delete_flg: true, deleted_at: new Date() } }
    );
    const parentConflict = await setState(room, false);
    expect(parentConflict.status).toBe(409);
    expect(parentConflict.body?.error?.code).toBe('CONFLICT');
    const stillDeletedRoom = await Room.findById(room._id).lean();
    expect(stillDeletedRoom.delete_flg).toBe(true);
    expect(stillDeletedRoom.deleted_at).toBeInstanceOf(Date);
  });

  test('管理者以外は管理用ルーム一覧を取得できない', async () => {
    const user = await User.create({
      username: 'RoomUserReject',
      mail: `room-user-reject-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'User',
    });

    const paginate = await request(app)
      .get('/room/management/paginate?page=1')
      .query({ search: '' })
      .set('Authorization', `Bearer ${buildToken(user)}`);
    expect(paginate.status).toBe(403);
    expect(paginate.body?.error?.code).toBe('FORBIDDEN');
  });

  test('ゲストのフロア一覧には表示中のフロアだけを返す', async () => {
    const owner = await User.create({
      username: 'GuestFloorOwner',
      mail: `guest-floor-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });

    const visibleFloor = await Floor.create({
      user: owner._id,
      title: 'Visible Floor',
      description: 'desc',
      lang: 'ja',
      floor_display_hidden: false,
    });
    await Floor.create({
      user: owner._id,
      title: 'Hidden Floor',
      description: 'desc',
      lang: 'ja',
      floor_display_hidden: true,
    });

    const res = await request(app).post('/floor/guest/paginate').send({ page: 1, search: '' });
    expect(res.status).toBe(200);
    expect(res.body?.docs?.some((f) => f._id === visibleFloor._id.toString())).toBe(true);
    expect(res.body?.docs?.some((f) => f.title === 'Hidden Floor')).toBe(false);
  });

  test('ゲストのルーム一覧には表示中のルームだけを返す', async () => {
    const owner = await User.create({
      username: 'GuestRoomOwner',
      mail: `guest-room-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });

    const floor = await Floor.create({
      user: owner._id,
      title: 'Guest Floor',
      description: 'desc',
      lang: 'ja',
      floor_display_hidden: false,
    });

    const visibleRoom = await Room.create({
      user: owner._id,
      floor: floor._id,
      title: 'Visible Room',
      description: 'desc',
      lang: 'ja',
      room_display_hidden: false,
    });
    await Room.create({
      user: owner._id,
      floor: floor._id,
      title: 'Hidden Room',
      description: 'desc',
      lang: 'ja',
      room_display_hidden: true,
    });

    const res = await request(app).post('/room/guest').send({ floor_id: floor._id.toString() });
    expect(res.status).toBe(200);
    expect(res.body.some((r) => r._id === visibleRoom._id.toString())).toBe(true);
    expect(res.body.some((r) => r.title === 'Hidden Room')).toBe(false);
    expect(res.body.find((r) => r._id === visibleRoom._id.toString())).not.toHaveProperty(
      'current_user_is_room_member'
    );
  });
  describe.each(['/room/update', '/room/management/update'])('画像の採用と回収 %s', (route) => {
    const fs = require('fs').promises;
    const path = require('path');
    const Chat = require('../../../models/Chat');
    let user, floor, room, directory;
    const updateImage = (imageName) => request(app).post(route).set('Authorization', `Bearer ${buildToken(user)}`)
      .send(baseRoomPayload(String(floor._id), { _id: String(room._id), image_name: imageName, delete_flg: false }));
    beforeEach(async () => {
      user = await User.create({ username: 'Image editor', mail: 'image-editor@example.invalid', role: 'Administrator' });
      floor = await Floor.create({ user: user._id, title: 'Image floor', lang: 'ja', target_langs: [] });
      room = await Room.create({ user: user._id, floor: floor._id, title: 'Image room', lang: 'ja' });
      directory = path.join(tempMediaRoot, String(floor._id), String(room._id));
      await fs.mkdir(directory, { recursive: true });
    });
    test('他人の画像・不存在・サムネイル・動画・投稿で使用中の画像を拒否する', async () => {
      const other = '1_000000000000000000000001.png';
      await fs.writeFile(path.join(directory, other), 'fixture');
      const inUse = `2_${user._id}.png`;
      await fs.writeFile(path.join(directory, inUse), 'fixture');
      await Chat.create({ user: user._id, floor: floor._id, room: room._id, content: 'fixture', lang: 'ja', image_name: inUse });
      for (const imageName of [other, `3_${user._id}.png`, `4_${user._id}_thumbnail.png`, `5_${user._id}.mp4`, inUse]) {
        const response = await updateImage(imageName);
        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('INVALID_PARAMS');
      }
      expect((await Room.findById(room._id)).image_name).toBeFalsy();
      expect(await fs.readFile(path.join(directory, inUse), 'utf8')).toBe('fixture');
    });
    test('既存の他人の画像は維持でき、交換しても投稿の参照ファイルは消さない', async () => {
      const shared = '6_000000000000000000000001.png';
      const own = `7_${user._id}.png`;
      await fs.writeFile(path.join(directory, shared), 'shared fixture');
      await fs.writeFile(path.join(directory, own), 'own fixture');
      await Room.updateOne({ _id: room._id }, { image_name: shared });
      await Chat.create({ user: user._id, floor: floor._id, room: room._id, content: 'fixture', lang: 'ja', image_name: shared });
      expect((await updateImage(shared)).status).toBe(200);
      expect((await updateImage(own)).status).toBe(200);
      expect((await Room.findById(room._id)).image_name).toBe(own);
      expect(await fs.readFile(path.join(directory, shared), 'utf8')).toBe('shared fixture');
      expect((await updateImage(null)).status).toBe(200);
      await expect(fs.access(path.join(directory, own))).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await fs.readFile(path.join(directory, shared), 'utf8')).toBe('shared fixture');
    });
  });

});
