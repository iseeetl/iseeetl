const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
jest.mock('../../../config/featureFlags', () => ({
  ...jest.requireActual('../../../config/featureFlags'),
  isOneSignalEnabled: jest.fn(() => true),
  isMailDeliveryEnabled: jest.fn(() => false),
}));
const User = require('../../../models/User');
const CategoryTag = require('../../../models/CategoryTag');
const AIAnalysisSetting = require('../../../models/AIAnalysisSetting');
const router = require('../../../routes/user.route');
const { attachErrorHandler } = require('../_helpers/app');

describe('ユーザAPI', () => {
  let app;

  const SECRET = process.env.JWT_SECRET || 'test-secret';
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = SECRET;

  const buildToken = (payload) => jwt.sign(payload, SECRET);

  const buildApp = () => {
    const a = express();
    a.use(express.json());
    a.use('/user', router);
    a.use('/auth', require('../../../routes/auth.route'));
    return attachErrorHandler(a);
  };

  beforeEach(() => {
    app = buildApp();
  });

  describe('ユーザ詳細の取得', () => {
    test('有効なトークンでユーザ詳細を返す（HTTP 200）', async () => {
      const user = await User.create({
        username: 'Alice',
        mail: 'alice@example.com',
        lang: 'ja',
        role: 'User',
      });
      const token = buildToken({ user_id: user._id.toString(), user_role: 'User' });

      const res = await request(app).get('/user/detail').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.username).toBe('Alice');
      expect(res.body.lang).toBe('ja');
    });

    test('認証ヘッダがなければ拒否する（HTTP 401）', async () => {
      const res = await request(app).get('/user/detail');
      expect(res.status).toBe(401);
    });
  });

  describe('プロフィールの更新', () => {
    test('ユーザ情報を更新できる（HTTP 200）', async () => {
      const user = await User.create({
        username: 'Alice',
        mail: 'alice@example.com',
        lang: 'ja',
        image_name: null,
        role: 'User',
      });
      const token = buildToken({ user_id: user._id.toString(), user_role: 'User' });

      const payload = {
        username: 'Alice2',
        image_name: null,
        lang: 'ja',
        eye_friendly_mode: true,
        push_enabled: true,
        reply_push_enabled: false,
        replied_post_push_enabled: true,
      };

      const res = await request(app).post('/user/update').set('Authorization', `Bearer ${token}`).send(payload);

      expect(res.status).toBe(200);
      expect(res.body.username).toBe('Alice2');
      expect(res.body.image_name).toBeNull();
      expect(res.body.eye_friendly_mode).toBe(true);
    });
  });

  describe('パスワードの変更', () => {
    test('現在のパスワードが一致すれば変更できる（HTTP 200）', async () => {
      const password = 'OldPassw0rd';
      const hashed = await bcrypt.hash(password, 10);
      const user = await User.create({
        username: 'Changer',
        mail: 'changer@example.com',
        lang: 'ja',
        role: 'User',
        password: hashed,
      });

      const token = buildToken({ user_id: user._id.toString(), user_role: 'User' });

      const res = await request(app)
        .post('/user/changepassword')
        .set('Authorization', `Bearer ${token}`)
        .send({ old_password: password, new_password: 'NewPassw0rd' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({});

      const updated = await User.findById(user._id).select('+password');
      const ok = await updated.comparePassword('NewPassw0rd');
      expect(ok).toBe(true);
      expect(updated.session_version).toBe(1);

      const oldTokenRes = await request(app)
        .get('/user/detail')
        .set('Authorization', `Bearer ${token}`);
      expect(oldTokenRes.status).toBe(401);

      const login = await request(app).post('/auth/login').send({ mail: user.mail, password: 'NewPassw0rd' });
      expect(login.status).toBe(200);
      const newTokenPayload = jwt.verify(login.body.token, SECRET);
      expect(newTokenPayload.session_version).toBe(1);
      const newTokenRes = await request(app)
        .get('/user/detail')
        .set('Authorization', `Bearer ${login.body.token}`);
      expect(newTokenRes.status).toBe(200);
    });

    test('現在のパスワードが違えば変更を拒否する（HTTP 400）', async () => {
      const password = 'OldPassw0rd';
      const hashed = await bcrypt.hash(password, 10);
      const user = await User.create({
        username: 'ChangerFail',
        mail: 'changer-fail@example.com',
        lang: 'ja',
        role: 'User',
        password: hashed,
      });

      const token = buildToken({ user_id: user._id.toString(), user_role: 'User' });

      const res = await request(app)
        .post('/user/changepassword')
        .set('Authorization', `Bearer ${token}`)
        .send({ old_password: 'WrongPassw0rd', new_password: 'NewPassw0rd' });

      expect(res.status).toBe(400);
    });
  });

  describe('管理用ユーザ一覧の取得', () => {
    test('管理者は一覧を取得できる（HTTP 200）', async () => {
      const admin = await User.create({
        username: 'Admin',
        mail: 'admin@example.com',
        lang: 'ja',
        role: 'Administrator',
      });
      await User.create({
        username: 'Bob',
        mail: 'bob@example.com',
        lang: 'ja',
        role: 'User',
      });

      const token = buildToken({ user_id: admin._id.toString(), user_role: 'Administrator' });
      const res = await request(app)
        .post('/user/management/paginate')
        .set('Authorization', `Bearer ${token}`)
        .send({ page: 1, search: null });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('docs');
      const names = res.body.docs.map((u) => u.username);
      expect(names).toEqual(expect.arrayContaining(['Bob']));
    });

    test('200: search と delete_flg の組合せを total/pages/docs へ反映する', async () => {
      const admin = await User.create({
        username: 'FilterAdmin',
        mail: 'filter-admin@example.com',
        lang: 'ja',
        role: 'Administrator',
      });
      const prefix = 'UserLifecycleFilter';
      await User.create([
        ...Array.from({ length: 11 }, (_, index) => ({
          username: `${prefix} Active ${index}`,
          mail: `user-filter-active-${index}@example.com`,
          lang: 'ja',
          role: 'Author',
          delete_flg: false,
        })),
        ...Array.from({ length: 2 }, (_, index) => ({
          username: `${prefix} Deleted ${index}`,
          mail: `user-filter-deleted-${index}@example.com`,
          lang: 'ja',
          role: 'Author',
          delete_flg: true,
          deleted_at: new Date(),
        })),
        {
          username: 'UnmatchedUser',
          mail: 'user-filter-unmatched@example.com',
          lang: 'ja',
          role: 'Author',
        },
      ]);
      const token = buildToken({ user_id: admin._id.toString(), user_role: 'Administrator' });
      const paginate = (payload) =>
        request(app)
          .post('/user/management/paginate')
          .set('Authorization', `Bearer ${token}`)
          .send({ page: 1, search: prefix, ...payload });

      const [active, deleted, all] = await Promise.all([
        paginate({ delete_flg: false }),
        paginate({ delete_flg: true }),
        paginate({}),
      ]);

      expect(active.status).toBe(200);
      expect(active.body).toMatchObject({ total: 11, pages: 2, page: 1 });
      expect(active.body.docs).toHaveLength(10);
      expect(active.body.docs.every((user) => user.delete_flg === false)).toBe(true);
      expect(deleted.status).toBe(200);
      expect(deleted.body).toMatchObject({ total: 2, pages: 1, page: 1 });
      expect(deleted.body.docs).toHaveLength(2);
      expect(deleted.body.docs.every((user) => user.delete_flg === true)).toBe(true);
      expect(all.status).toBe(200);
      expect(all.body).toMatchObject({ total: 13, pages: 2, page: 1 });
      expect(all.body.docs).toHaveLength(10);
      expect(all.body.docs.every((user) => user.username.includes(prefix))).toBe(true);
    });

    test('管理者以外の一覧取得を拒否する（HTTP 403）', async () => {
      const user = await User.create({
        username: 'Bob',
        mail: 'bob@example.com',
        lang: 'ja',
        role: 'User',
      });
      const token = buildToken({ user_id: user._id.toString(), user_role: 'User' });

      const res = await request(app)
        .post('/user/management/paginate')
        .set('Authorization', `Bearer ${token}`)
        .send({ page: 1, search: null });

      expect(res.status).toBe(403);
    });

    test('GETのクエリでページを指定して一覧を取得できる（HTTP 200）', async () => {
      const admin = await User.create({
        username: 'AdminQuery',
        mail: 'admin-query@example.com',
        lang: 'ja',
        role: 'Administrator',
      });
      await User.create({
        username: 'QueryUser',
        mail: 'query-user@example.com',
        lang: 'ja',
        role: 'User',
      });

      const token = buildToken({ user_id: admin._id.toString(), user_role: 'Administrator' });
      const res = await request(app)
        .get('/user/management/paginate?page=1&search=')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('docs');
    });
  });

  describe('ユーザの削除状態の変更', () => {
    test('404: 存在しない対象ユーザを状態変更しない', async () => {
      const admin = await User.create({
        username: 'MissingTargetAdmin',
        mail: 'missing-target-admin@example.com',
        lang: 'ja',
        role: 'Administrator',
      });
      const token = buildToken({ user_id: admin._id.toString(), user_role: 'Administrator' });

      const response = await request(app)
        .post('/user/management/delete-state')
        .set('Authorization', `Bearer ${token}`)
        .send({ _id: '507f1f77bcf86cd799439011', delete_flg: true });

      expect(response.status).toBe(404);
      expect(response.body?.error?.code).toBe('NOT_FOUND');
    });

    test('200: username/mail/role等を変えず論理削除・復元する', async () => {
      const admin = await User.create({
        username: 'LifecycleAdmin',
        mail: 'lifecycle-admin@example.com',
        lang: 'ja',
        role: 'Administrator',
      });
      const target = await User.create({
        username: 'LifecycleTarget',
        mail: 'lifecycle-target@example.com',
        lang: 'en',
        image_name: 'profile.png',
        role: 'Editor',
        eye_friendly_mode: true,
        push_enabled: true,
        reply_push_enabled: false,
        replied_post_push_enabled: false,
      });
      const token = buildToken({ user_id: admin._id.toString(), user_role: 'Administrator' });
      const unchanged = {
        username: target.username,
        mail: target.mail,
        lang: target.lang,
        image_name: target.image_name,
        role: target.role,
        eye_friendly_mode: target.eye_friendly_mode,
        push_enabled: target.push_enabled,
        reply_push_enabled: target.reply_push_enabled,
        replied_post_push_enabled: target.replied_post_push_enabled,
      };
      const setState = (delete_flg) =>
        request(app)
          .post('/user/management/delete-state')
          .set('Authorization', `Bearer ${token}`)
          .send({ _id: target._id.toString(), delete_flg });

      const deleted = await setState(true);
      const deletedUser = await User.findById(target._id).lean();
      expect(deleted.status).toBe(200);
      expect(deleted.body).toMatchObject({ ...unchanged, delete_flg: true });
      expect(deletedUser).toMatchObject({ ...unchanged, delete_flg: true, session_version: 1 });
      expect(deletedUser.deleted_at).toBeInstanceOf(Date);

      const restored = await setState(false);
      const restoredUser = await User.findById(target._id).lean();
      expect(restored.status).toBe(200);
      expect(restored.body).toMatchObject({ ...unchanged, delete_flg: false });
      expect(restoredUser).toMatchObject({ ...unchanged, delete_flg: false, session_version: 1 });
      expect(restoredUser.deleted_at).toBeNull();
    });

    test('管理者と有効なAI解析設定の投稿者は削除しない（HTTP 409）', async () => {
      const admin = await User.create({
        username: 'ProtectedAdminActor',
        mail: 'protected-admin-actor@example.com',
        lang: 'ja',
        role: 'Administrator',
      });
      const resultUser = await User.create({
        username: 'ProtectedResultUser',
        mail: 'protected-result-user@example.com',
        lang: 'ja',
        role: 'Author',
      });
      const categoryTag = await CategoryTag.create({
        user: admin._id,
        order: 1,
        name: 'Protected User Setting Tag',
        lang: 'ja',
      });
      await AIAnalysisSetting.create({
        category_tag: categoryTag._id,
        analysis_kind: 'vision',
        additional_prompt: '',
        result_user: resultUser._id,
        user: admin._id,
        updated_by: admin._id,
      });
      const token = buildToken({ user_id: admin._id.toString(), user_role: 'Administrator' });
      const deleteTarget = (_id) =>
        request(app)
          .post('/user/management/delete-state')
          .set('Authorization', `Bearer ${token}`)
          .send({ _id: _id.toString(), delete_flg: true });

      const [administratorResponse, referencedResponse] = await Promise.all([
        deleteTarget(admin._id),
        deleteTarget(resultUser._id),
      ]);

      expect(administratorResponse.status).toBe(409);
      expect(administratorResponse.body?.error?.code).toBe('CONFLICT');
      expect(referencedResponse.status).toBe(409);
      expect(referencedResponse.body?.error?.code).toBe('CONFLICT');
      expect((await User.findById(admin._id).lean()).delete_flg).toBe(false);
      expect((await User.findById(resultUser._id).lean()).delete_flg).toBe(false);
    });
  });

  describe('管理者によるユーザ情報の更新', () => {
    test('管理者はユーザのプロフィールを更新できる（HTTP 200）', async () => {
      const admin = await User.create({
        username: 'AdminUpdate',
        mail: 'admin-update@example.com',
        lang: 'ja',
        role: 'Administrator',
      });
      const user = await User.create({
        username: 'Target',
        mail: 'target@example.com',
        lang: 'ja',
        role: 'User',
      });

      const token = buildToken({ user_id: admin._id.toString(), user_role: 'Administrator' });
      const res = await request(app)
        .post('/user/management/update')
        .set('Authorization', `Bearer ${token}`)
        .send({
          _id: user._id.toString(),
          username: 'TargetUpdated',
          mail: 'target-updated@example.com',
          role: 'Author',
          delete_flg: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.username).toBe('TargetUpdated');
      expect(res.body.mail).toBe('target-updated@example.com');
      const unchangedUser = await User.findById(user._id);
      expect(unchangedUser.session_version).toBe(0);
    });

    test('同じ削除状態なら編集でき、反対状態は409で状態も編集項目も維持する', async () => {
      const admin = await User.create({
        username: 'NullMailAdmin',
        mail: 'null-mail-admin@example.com',
        lang: 'ja',
        role: 'Administrator',
      });
      const target = await User.create({
        username: 'NullMailTarget',
        mail: null,
        lang: 'ja',
        role: 'Author',
      });
      const token = buildToken({ user_id: admin._id.toString(), user_role: 'Administrator' });
      const basePayload = {
        _id: target._id.toString(),
        username: 'NullMailTarget',
        mail: null,
      };

      const updateRes = await request(app)
        .post('/user/management/update')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...basePayload,
          role: 'Editor',
          delete_flg: false,
        });
      const conflictRes = await request(app)
        .post('/user/management/update')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...basePayload,
          role: 'Author',
          delete_flg: true,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body).toMatchObject({ mail: null, role: 'Editor', delete_flg: false });
      expect(conflictRes.status).toBe(409);
      const unchanged = await User.findById(target._id).lean();
      expect(unchanged).toMatchObject({ mail: null, role: 'Editor', delete_flg: false });
      expect(unchanged.deleted_at).toBeNull();
    });

    test('mail=nullのユーザへメールを設定でき、重複メールは拒否する', async () => {
      const admin = await User.create({
        username: 'SetMailAdmin',
        mail: 'set-mail-admin@example.com',
        lang: 'ja',
        role: 'Administrator',
      });
      const target = await User.create({
        username: 'SetMailTarget',
        mail: null,
        lang: 'ja',
        role: 'Author',
      });
      await User.create({
        username: 'SetMailOther',
        mail: 'set-mail-other@example.com',
        lang: 'ja',
        role: 'Author',
      });
      const token = buildToken({ user_id: admin._id.toString(), user_role: 'Administrator' });
      const basePayload = {
        _id: target._id.toString(),
        username: 'SetMailTarget',
        role: 'Author',
        delete_flg: false,
      };

      const setMailRes = await request(app)
        .post('/user/management/update')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...basePayload,
          mail: ' New-Line@Example.COM ',
        });
      const duplicateRes = await request(app)
        .post('/user/management/update')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...basePayload,
          mail: 'set-mail-other@example.com',
        });

      expect(setMailRes.status).toBe(200);
      expect(setMailRes.body.mail).toBe('new-line@example.com');
      expect(duplicateRes.status).toBe(409);
      const unchangedTarget = await User.findById(target._id);
      expect(unchangedTarget.mail).toBe('new-line@example.com');
    });

    test('管理者がパスワードを変更すると発行済みの全JWTが無効になる（HTTP 200）', async () => {
      const admin = await User.create({
        username: 'AdminPassword',
        mail: 'admin-password@example.com',
        lang: 'ja',
        role: 'Administrator',
      });
      const user = await User.create({
        username: 'PasswordTarget',
        mail: 'password-target@example.com',
        password: 'OldPassw0rd',
        lang: 'ja',
        role: 'User',
      });
      const adminToken = buildToken({ user_id: admin._id.toString(), user_role: 'Administrator' });
      const oldTokens = ['device-a', 'device-b'].map((device_id) =>
        buildToken({
          user_id: user._id.toString(),
          user_role: 'User',
          session_version: 0,
          device_id,
        })
      );

      const updateRes = await request(app)
        .post('/user/management/update')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          _id: user._id.toString(),
          username: 'PasswordTarget',
          mail: 'password-target@example.com',
          password: 'NewPassw0rd',
          role: 'Author',
          delete_flg: false,
        });

      expect(updateRes.status).toBe(200);
      const updatedUser = await User.findById(user._id).select('+password');
      expect(updatedUser.session_version).toBe(1);
      await expect(updatedUser.comparePassword('NewPassw0rd')).resolves.toBe(true);

      const oldSessionResponses = await Promise.all(
        oldTokens.map((token) => request(app).get('/user/detail').set('Authorization', `Bearer ${token}`))
      );
      oldSessionResponses.forEach((res) => expect(res.status).toBe(401));
    });

    test('管理者への昇格は拒否し、開発者への変更は許可する', async () => {
      const admin = await User.create({
        username: 'RoleGuardAdmin',
        mail: 'role-guard-admin@example.com',
        lang: 'ja',
        role: 'Administrator',
      });
      const target = await User.create({
        username: 'RoleGuardTarget',
        mail: 'role-guard-target@example.com',
        lang: 'ja',
        role: 'Author',
      });
      const token = buildToken({ user_id: admin._id.toString(), user_role: 'Administrator' });
      const basePayload = {
        _id: target._id.toString(),
        username: 'RoleGuardTarget',
        mail: 'role-guard-target@example.com',
        delete_flg: false,
      };

      const promoteRes = await request(app)
        .post('/user/management/update')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...basePayload,
          role: 'Administrator',
        });
      const developerRes = await request(app)
        .post('/user/management/update')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...basePayload,
          role: 'developer',
        });

      expect(promoteRes.status).toBe(409);
      expect(developerRes.status).toBe(200);
      const updatedTarget = await User.findById(target._id);
      expect(updatedTarget.role).toBe('developer');
    });

    test('409: 管理者は降格も論理削除もできない', async () => {
      const admin = await User.create({
        username: 'AdminActor',
        mail: 'admin-actor@example.com',
        lang: 'ja',
        role: 'Administrator',
      });
      const target = await User.create({
        username: 'ProtectedAdmin',
        mail: 'protected-admin@example.com',
        lang: 'ja',
        role: 'Administrator',
      });
      const token = buildToken({ user_id: admin._id.toString(), user_role: 'Administrator' });
      const basePayload = {
        _id: target._id.toString(),
        username: 'ProtectedAdmin',
        mail: 'protected-admin@example.com',
      };

      const demoteRes = await request(app)
        .post('/user/management/update')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...basePayload,
          role: 'Editor',
          delete_flg: false,
        });
      const deleteRes = await request(app)
        .post('/user/management/update')
        .set('Authorization', `Bearer ${token}`)
        .send({
          ...basePayload,
          role: 'Administrator',
          delete_flg: true,
        });

      expect(demoteRes.status).toBe(409);
      expect(deleteRes.status).toBe(409);
      const unchangedTarget = await User.findById(target._id);
      expect(unchangedTarget.role).toBe('Administrator');
      expect(unchangedTarget.delete_flg).toBe(false);
    });

    test('200: 管理者のロールと論理削除状態を維持すればユーザ情報を更新できる', async () => {
      const admin = await User.create({
        username: 'ProfileAdminActor',
        mail: 'profile-admin-actor@example.com',
        lang: 'ja',
        role: 'Administrator',
      });
      const target = await User.create({
        username: 'ProfileAdminTarget',
        mail: 'profile-admin-target@example.com',
        lang: 'ja',
        role: 'Administrator',
      });
      const token = buildToken({ user_id: admin._id.toString(), user_role: 'Administrator' });

      const res = await request(app)
        .post('/user/management/update')
        .set('Authorization', `Bearer ${token}`)
        .send({
          _id: target._id.toString(),
          username: 'UpdatedAdminTarget',
          mail: 'updated-admin-target@example.com',
          role: 'Administrator',
          delete_flg: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.username).toBe('UpdatedAdminTarget');
      expect(res.body.mail).toBe('updated-admin-target@example.com');
      expect(res.body.role).toBe('Administrator');
      expect(res.body.delete_flg).toBe(false);
    });

    test('メールアドレスの重複を拒否する（HTTP 409）', async () => {
      const admin = await User.create({
        username: 'AdminDup',
        mail: 'admin-dup@example.com',
        lang: 'ja',
        role: 'Administrator',
      });
      const user = await User.create({
        username: 'DupTarget',
        mail: 'dup-target@example.com',
        lang: 'ja',
        role: 'User',
      });
      await User.create({
        username: 'DupOther',
        mail: 'dup-other@example.com',
        lang: 'ja',
        role: 'User',
      });

      const token = buildToken({ user_id: admin._id.toString(), user_role: 'Administrator' });
      const res = await request(app)
        .post('/user/management/update')
        .set('Authorization', `Bearer ${token}`)
        .send({
          _id: user._id.toString(),
          username: 'DupTarget',
          mail: 'dup-other@example.com',
          role: 'Author',
          delete_flg: false,
        });

      expect(res.status).toBe(409);
    });

    test('不正なロールを拒否する（HTTP 400）', async () => {
      const admin = await User.create({
        username: 'AdminBadRole',
        mail: 'admin-badrole@example.com',
        lang: 'ja',
        role: 'Administrator',
      });
      const user = await User.create({
        username: 'BadRoleTarget',
        mail: 'badrole-target@example.com',
        lang: 'ja',
        role: 'User',
      });

      const token = buildToken({ user_id: admin._id.toString(), user_role: 'Administrator' });
      const res = await request(app)
        .post('/user/management/update')
        .set('Authorization', `Bearer ${token}`)
        .send({
          _id: user._id.toString(),
          username: 'BadRoleTarget',
          mail: 'badrole-target@example.com',
          role: 'invalid-role',
          delete_flg: false,
        });

      expect(res.status).toBe(400);
    });

    test('管理者以外の更新を拒否する（HTTP 403）', async () => {
      const user = await User.create({
        username: 'NotAdmin',
        mail: 'not-admin@example.com',
        lang: 'ja',
        role: 'User',
      });
      const target = await User.create({
        username: 'TargetUser',
        mail: 'target-user@example.com',
        lang: 'ja',
        role: 'User',
      });

      const token = buildToken({ user_id: user._id.toString(), user_role: 'User' });
      const res = await request(app)
        .post('/user/management/update')
        .set('Authorization', `Bearer ${token}`)
        .send({
          _id: target._id.toString(),
          username: 'TargetUser',
          mail: 'target-user@example.com',
          role: 'Author',
          delete_flg: false,
        });

      expect(res.status).toBe(403);
    });
  });
});
