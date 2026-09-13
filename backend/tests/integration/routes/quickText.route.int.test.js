const request = require('supertest');
const { buildErrorHandledApp } = require('../_helpers/app');
const { snapshotEnv, restoreEnv, ensureEnvValue, createUserToken } = require('../_helpers/auth');
const { createUser } = require('../_helpers/models');
const quickTextRouter = require('../../../routes/quickText.route');

describe('共通単語の管理API', () => {
  let app;
  const ORIGINAL_ENV = snapshotEnv(['JWT_SECRET']);

  beforeAll(() => {
    ensureEnvValue('JWT_SECRET', 'test-jwt-secret');
  });

  afterAll(() => {
    restoreEnv(ORIGINAL_ENV);
  });

  beforeEach(() => {
    app = buildErrorHandledApp({
      mounts: [{ path: '/', handler: quickTextRouter }],
    });
  });

  test('管理者は共通単語グループと単語を管理できる', async () => {
    const admin = await createUser({ role: 'Administrator' });
    const token = createUserToken(admin);

    const groupRes = await request(app)
      .post('/management/quick-text/groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Group A', lang: 'ja' });
    expect(groupRes.status).toBe(200);
    expect(groupRes.body).toHaveProperty('_id');

    const paginateRes = await request(app)
      .get('/management/quick-text/groups?page=1')
      .set('Authorization', `Bearer ${token}`);
    expect(paginateRes.status).toBe(200);
    expect(paginateRes.body).toHaveProperty('docs');

    const listRes = await request(app)
      .get('/management/quick-text/groups/all')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.length).toBe(1);

    const groupUpdateRes = await request(app)
      .patch(`/management/quick-text/groups/${groupRes.body._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Group B' });
    expect(groupUpdateRes.status).toBe(200);
    expect(groupUpdateRes.body.title).toBe('Group B');

    const itemRes = await request(app)
      .post(`/management/quick-text/groups/${groupRes.body._id}/items`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Item A', lang: 'ja' });
    expect(itemRes.status).toBe(200);
    expect(itemRes.body).toHaveProperty('_id');

    const itemListRes = await request(app)
      .get(`/management/quick-text/groups/${groupRes.body._id}/items`)
      .set('Authorization', `Bearer ${token}`);
    expect(itemListRes.status).toBe(200);
    expect(itemListRes.body.length).toBe(1);

    const itemUpdateRes = await request(app)
      .patch(`/management/quick-text/items/${itemRes.body._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Item B' });
    expect(itemUpdateRes.status).toBe(200);
    expect(itemUpdateRes.body.label).toBe('Item B');

    const itemDeleteRes = await request(app)
      .delete(`/management/quick-text/items/${itemRes.body._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(itemDeleteRes.status).toBe(200);
    expect(itemDeleteRes.body.ok).toBe(true);

    const groupDeleteRes = await request(app)
      .delete(`/management/quick-text/groups/${groupRes.body._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(groupDeleteRes.status).toBe(200);
    expect(groupDeleteRes.body.ok).toBe(true);
  });

  test('管理者以外の操作を拒否する', async () => {
    const user = await createUser({ role: 'User' });
    const res = await request(app)
      .get('/management/quick-text/groups/all')
      .set('Authorization', `Bearer ${createUserToken(user)}`);

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
  });
});
