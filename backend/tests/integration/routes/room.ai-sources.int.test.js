const request = require('supertest');
const resourceRouter = require('../../../routes/timeline/postResource.route');
const { buildErrorHandledApp } = require('../_helpers/app');
const { createUser, createFloor, createRoom } = require('../_helpers/models');
const RoomTag = require('../../../models/RoomTag');
const Setting = require('../../../models/RoomAIAnalysisSetting');
const Chat = require('../../../models/Chat');
describe('AI viewing sources using real stored provenance', () => {
  let app;
  beforeEach(() => { app = buildErrorHandledApp({ mounts: [{ path: '/api', handler: resourceRouter() }] }); });
  test('guest catalog includes active, deleted and reply origins, excluding deleted content and other rooms', async () => {
    const user = await createUser(); const floor = await createFloor(user); const room = await createRoom(user, floor);
    const other = await createRoom(user, floor, { title: 'Other' });
    const scope = { floor: floor._id, room: room._id, user: user._id };
    const tags = await RoomTag.create(['Active','Deleted','Reply','Removed','Other'].map((name,i) => ({ ...scope, room: i===4?other._id:room._id, name, order:i+1, lang:'en', delete_flg:i===1 })));
    const setting = await Setting.create({ ...scope, room_tag: tags[0]._id, analysis_kind:'conversation', result_user:user._id, updated_by:user._id });
    const sup = (tag, extra={}) => ({ user:user._id, content:'Supplement', meta:{ analysis_kind:'conversation', ...(tag ? { analysis_trigger_tag:tag._id, analysis_setting:setting._id, analysis_setting_revision:1, analysis_source_revision:1 } : {}) }, ...extra });
    await Chat.create({ ...scope, content:'Post', supplementaries:[sup(tags[1]),sup(null),sup(tags[3],{delete_flg:true})], replies:[{user:user._id,content:'Reply',supplementaries:[sup(tags[2])]}, {user:user._id,content:'Removed reply',delete_flg:true,supplementaries:[sup(tags[3])]}] });
    await Chat.create({ ...scope, room:other._id, content:'Other post', supplementaries:[sup(tags[4])] });
    const response = await request(app).get(`/api/rooms/${room._id}/ai-sources`);
    expect(response.status).toBe(200);
    expect(response.body.map(t=>t._id)).toEqual([String(tags[0]._id),String(tags[1]._id),String(tags[2]._id),'__unknown__']);
    expect(response.body.find(t=>t._id===String(tags[1]._id)).delete_flg).toBe(true);
    const tagResponse = await request(app).get(`/api/rooms/${room._id}/tags`);
    expect(tagResponse.body.find(t=>t._id===String(tags[0]._id)).ai_enabled).toBe(true);
    expect(tagResponse.body.find(t=>t._id===String(tags[2]._id)).ai_enabled).toBe(false);
  });
  test('guest cannot read restricted-room sources', async () => {
    const user = await createUser(); const floor = await createFloor(user); const room = await createRoom(user,floor,{member_only:true});
    const response = await request(app).get(`/api/rooms/${room._id}/ai-sources`);
    expect([401,403]).toContain(response.status);
  });
});
