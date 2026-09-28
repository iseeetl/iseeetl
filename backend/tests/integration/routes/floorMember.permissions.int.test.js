const express = require('express');
const request = require('supertest');
const { attachErrorHandler } = require('../_helpers/app');
const { createUserToken } = require('../_helpers/auth');
const { createUser, createFloor, createRoom } = require('../_helpers/models');
const Floor = require('../../../models/Floor');
const FloorMember = require('../../../models/FloorMember');
const RoomMember = require('../../../models/RoomMember');
const FloorTag = require('../../../models/FloorTag');
const RoomTag = require('../../../models/RoomTag');
const KickedUser = require('../../../models/KickedUser');

const app = express();
app.use(express.json());
app.use('/api', require('../../../routes/floor')());
app.use('/api', require('../../../routes/room')());
app.use('/api/flooraianalysissetting', require('../../../routes/floor/floorAIAnalysisSetting.route'));
app.use('/api/roomaianalysissetting', require('../../../routes/room/roomAIAnalysisSetting.route'));
app.use('/api/aianalysissetting', require('../../../routes/aiAnalysisSetting.route'));
app.use('/api', require('../../../routes/floor/floorQuickText.route'));
attachErrorHandler(app);

const post = (actor, path, body) => request(app).post(`/api/${path}`)
  .set('Authorization', `Bearer ${createUserToken(actor)}`).send(body);
const floorPayload = (floor) => ({
  _id: String(floor._id), title: '変更後のフロア', description: '説明', lang: 'ja',
  target_langs: [], image_name: null, floor_display_hidden: true,
});
const setup = async () => {
  const owner = await createUser({ role: 'Editor' });
  const member = await createUser({ role: 'Author' });
  const target = await createUser({ role: 'Author' });
  const floor = await createFloor(owner);
  const otherFloor = await createFloor(owner);
  const room = await createRoom(owner, floor, { member_only: true });
  await FloorMember.create({ floor: floor._id, user: member._id });
  return { owner, member, target, floor, otherFloor, room };
};

describe('フロアメンバーの管理範囲', () => {
  test('所属フロアだけに管理可否を返し、編集・非表示・再表示・削除できる', async () => {
    const { member, floor, otherFloor } = await setup();
    const list = await post(member, 'floor/paginate', { page: 1, search: '' });
    expect(list.status).toBe(200);
    expect(list.body.docs.find((item) => item._id === String(floor._id)).can_manage).toBe(true);
    expect(list.body.docs.find((item) => item._id === String(otherFloor._id)).can_manage).toBe(false);
    const update = await post(member, 'floor/update', floorPayload(floor));
    expect(update.status).toBe(200);
    expect(update.body.floor_display_hidden).toBe(true);
    expect(update.body.user._id).toBe(String(floor.user));
    const show = await post(member, 'floor/update', { ...floorPayload(floor), floor_display_hidden: false });
    expect(show.status).toBe(200);
    expect(show.body.floor_display_hidden).toBe(false);
    expect((await post(member, 'floor/delete', { _id: String(floor._id) })).status).toBe(200);
    expect((await Floor.findById(floor._id)).delete_flg).toBe(true);
    expect((await Floor.findById(otherFloor._id)).delete_flg).toBe(false);
  });

  test('別フロア、全フロア一括操作、新規作成、管理画面のAPIは許可しない', async () => {
    const { member, otherFloor } = await setup();
    const cases = [
      ['floor/update', floorPayload(otherFloor), 403],
      ['floor/delete', { _id: String(otherFloor._id) }, 403],
      ['floor/update/floordisplayhidden', { floor_display_hidden: true }, 401],
      ['floor/create', { title: '新規フロア', description: '', lang: 'ja', target_langs: [], floor_display_hidden: false }, 401],
      ['floor/management/paginate', { page: 1, search: '' }, 403],
      ['aianalysissetting/management/default-result-user', {}, 403],
    ];
    for (const [path, body, status] of cases) {
      const result = await post(member, path, body);
      expect({ path, status: result.status }).toEqual({ path, status });
    }
    expect(await Floor.countDocuments({ delete_flg: false })).toBe(2);
  });

  test('フロアタグの作成・編集・取り込み・初期化・削除ができる', async () => {
    const { member, floor } = await setup();
    const scope = { floor_id: String(floor._id) };
    const created = await post(member, 'floortag/create', { ...scope, order: 1, name: 'タグ', lang: 'ja' });
    expect(created.status).toBe(200);
    expect((await post(member, 'floortag/update', { _id: created.body._id, order: 2, name: '変更タグ', lang: 'ja' })).status).toBe(200);
    expect((await post(member, 'floortag', scope)).body).toHaveLength(1);
    expect((await post(member, 'floortag/delete', { _id: created.body._id })).status).toBe(200);
    expect((await post(member, 'floortag/import', { ...scope, csv: [[1, '取込タグ']] })).status).toBe(200);
    expect((await post(member, 'floortag/init', scope)).status).toBe(200);
  });

  test.each(['別フロアのメンバー', 'ルームメンバーのみ'])('%sにはフロアの管理権限を与えない', async (actorState) => {
    const { member, floor, otherFloor, room } = await setup();
    const targetFloor = actorState === '別フロアのメンバー' ? otherFloor : floor;
    if (actorState === 'ルームメンバーのみ') {
      await FloorMember.deleteMany({ user: member._id });
      await RoomMember.create({ floor: floor._id, room: room._id, user: member._id });
    }
    const scope = { floor_id: String(targetFloor._id) };
    for (const [path, body] of [
      ['floortag/create', { ...scope, order: 1, name: '拒否されるタグ', lang: 'ja' }],
      ['floormember/invite', { ...scope, period: '8h' }],
      ['flooraianalysissetting', scope],
      ['flooraianalysissetting/result-users/search', { ...scope, search: '' }],
    ]) {
      const response = await post(member, path, body);
      expect({ path, status: response.status }).toEqual({ path, status: 403 });
    }
    expect((await post(member, `floors/${targetFloor._id}/quick-text/groups`, { title: '拒否される単語', lang: 'ja' })).status).toBe(403);
    expect(await FloorTag.countDocuments({ floor: targetFloor._id })).toBe(0);
  });

  test('他のフロアメンバーの招待・解除と、他人が作成したルームのメンバー解除ができる', async () => {
    const { member, target, floor, room } = await setup();
    const scope = { floor_id: String(floor._id) };
    expect((await post(member, 'floormember/invite', { ...scope, period: '8h' })).status).toBe(200);
    const floorMembership = await FloorMember.create({ floor: floor._id, user: target._id });
    expect((await post(member, 'floormember/delete', { ...scope, _id: String(floorMembership._id) })).status).toBe(200);
    expect(await FloorMember.findById(floorMembership._id)).toBeNull();
    const roomMembership = await RoomMember.create({ floor: floor._id, room: room._id, user: target._id });
    expect((await post(member, 'roommember/delete', { _id: String(roomMembership._id) })).status).toBe(200);
    expect(await RoomMember.findById(roomMembership._id)).toBeNull();
  });

  test.each(['脱退', '登録解除', '既存のキック'])('%s後は、同じトークンでもフロア管理権限を使えない', async (state) => {
    const { owner, member, floor, room, target } = await setup();
    const token = createUserToken(member);
    if (state === '脱退') {
      expect((await post(member, 'floormember/leave', { floor_id: String(floor._id) })).status).toBe(200);
    } else if (state === '登録解除') {
      const membership = await FloorMember.findOne({ floor: floor._id, user: member._id });
      expect((await post(owner, 'floormember/delete', { floor_id: String(floor._id), _id: String(membership._id) })).status).toBe(200);
    } else {
      await KickedUser.create({ floor: floor._id, room: room._id, user: member._id, kicked_by: owner._id });
    }
    const result = await request(app).post('/api/floor/update')
      .set('Authorization', `Bearer ${token}`).send(floorPayload(floor));
    expect(result.status).toBe(403);
    const list = await post(member, 'floor/paginate', { page: 1, search: '' });
    expect(list.body.docs.find((item) => item._id === String(floor._id)).can_manage).toBe(false);
    expect((await post(member, 'floormember/invite', { floor_id: String(floor._id), period: '8h' })).status).toBe(403);
    expect((await post(member, 'floortag/create', { floor_id: String(floor._id), order: 1, name: '拒否', lang: 'ja' })).status).toBe(403);
    expect((await post(member, 'flooraianalysissetting', { floor_id: String(floor._id) })).status).toBe(403);
    expect((await post(member, `floors/${floor._id}/quick-text/groups`, { title: '拒否', lang: 'ja' })).status).toBe(403);
    const ownRoom = await createRoom(member, floor);
    const membership = await RoomMember.create({ floor: floor._id, room: ownRoom._id, user: target._id });
    expect((await post(member, 'roommember/delete', { _id: String(membership._id) })).status).toBe(403);
    expect(await RoomMember.findById(membership._id)).not.toBeNull();
  });

  test.each(['floor', 'room'])('%sのAI解析設定と結果ユーザを管理できる', async (scope) => {
    const { member, target, floor, room } = await setup();
    const model = scope === 'floor' ? FloorTag : RoomTag;
    const tag = await model.create({ floor: floor._id, room: room._id, user: member._id, order: 1, name: '解析', lang: 'ja' });
    const ids = { floor_id: String(floor._id), ...(scope === 'room' ? { room_id: String(room._id) } : {}) };
    const path = `${scope}aianalysissetting`;
    const payload = { ...ids, [`${scope}_tag`]: String(tag._id), analysis_kind: 'vision', additional_prompt: '', result_user: String(target._id) };
    const created = await post(member, `${path}/create`, payload);
    expect(created.status).toBe(200);
    expect((await post(member, path, ids)).body).toHaveLength(1);
    expect((await post(member, `${path}/result-users/search`, { ...ids, search: target.username })).status).toBe(200);
    expect((await post(member, `${path}/default-result-user`, ids)).status).toBe(200);
    const updated = await post(member, `${path}/update`, { ...payload, _id: created.body._id, revision: created.body.revision, additional_prompt: '要約する' });
    expect(updated.status).toBe(200);
    expect(updated.body.additional_prompt).toBe('要約する');
    expect((await post(member, `${path}/delete`, { ...ids, _id: created.body._id, revision: updated.body.revision })).status).toBe(200);
  });
});
