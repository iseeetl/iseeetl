jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  genSalt: jest.fn(),
  hash: jest.fn(),
}));

const bcrypt = require('bcrypt');
const ROLES = require('../../../constants/roles');
const {
  expectRequired,
  expectDefault,
  expectEnum,
  expectMinMax,
  expectTrim,
  expectMatch,
  expectIndex,
} = require('./_helpers');

const AuthIdentity = require('../../../models/AuthIdentity');
const CategoryTag = require('../../../models/CategoryTag');
const Chat = require('../../../models/Chat');
const Floor = require('../../../models/Floor');
const FloorInvite = require('../../../models/FloorInvite');
const FloorMember = require('../../../models/FloorMember');
const FloorQuickTextGroup = require('../../../models/FloorQuickTextGroup');
const FloorQuickTextItem = require('../../../models/FloorQuickTextItem');
const FloorTag = require('../../../models/FloorTag');
const GoogleApiUsage = require('../../../models/GoogleApiUsage');
const GoogleTranslateAPI = require('../../../models/GoogleTranslateAPI');
const KickedUser = require('../../../models/KickedUser');
const PushFilter = require('../../../models/PushFilter');
const QuickTextGroup = require('../../../models/QuickTextGroup');
const QuickTextItem = require('../../../models/QuickTextItem');
const ResetPassword = require('../../../models/ResetPassword');
const Room = require('../../../models/Room');
const RoomInvite = require('../../../models/RoomInvite');
const RoomMember = require('../../../models/RoomMember');
const RoomQuickTextGroup = require('../../../models/RoomQuickTextGroup');
const RoomQuickTextItem = require('../../../models/RoomQuickTextItem');
const RoomTag = require('../../../models/RoomTag');
const SoundTag = require('../../../models/SoundTag');
const Spam = require('../../../models/Spam');
const User = require('../../../models/User');
const UserTemp = require('../../../models/UserTemp');
const TranslationSchema = require('../../../models/schemas/Translation');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AuthIdentityのスキーマ', () => {
  test('必要な項目と制約を定義する', () => {
    expectRequired(AuthIdentity.schema, 'user_id');
    expectRequired(AuthIdentity.schema, 'provider');
    expectRequired(AuthIdentity.schema, 'provider_user_id');
    expectEnum(AuthIdentity.schema, 'provider', ['password', 'google', 'line']);
    expectDefault(AuthIdentity.schema, 'email', null);
    expectDefault(AuthIdentity.schema, 'email_verified', false);
    expectDefault(AuthIdentity.schema, 'created_at', Date.now);
  });

  test('必要な索引を定義する', () => {
    expectIndex(AuthIdentity.schema, { provider: 1, provider_user_id: 1 }, { unique: true });
  });
});

describe('CategoryTagのスキーマ', () => {
  test('必要な項目と制約を定義する', () => {
    expectRequired(CategoryTag.schema, 'user');
    expectRequired(CategoryTag.schema, 'order');
    expectRequired(CategoryTag.schema, 'name');
    expectMinMax(CategoryTag.schema, 'order', 1, 100);
    expectDefault(CategoryTag.schema, 'delete_flg', false);
    expectDefault(CategoryTag.schema, 'created_at', Date.now);
    expectDefault(CategoryTag.schema, 'updated_at', null);
    expectDefault(CategoryTag.schema, 'deleted_at', null);
  });
});

describe('Chatのスキーマ', () => {
  test('必要な項目と制約を定義する', () => {
    expectRequired(Chat.schema, 'floor');
    expectRequired(Chat.schema, 'room');
    expectDefault(Chat.schema, 'lang', 'ja');
    expectDefault(Chat.schema, 'delete_flg', false);
    expectDefault(Chat.schema, 'created_at', Date.now);
    expectDefault(Chat.schema, 'updated_at', null);
  });

  test('子スキーマの制約を定義する', () => {
    const reactions = Chat.schema.path('reactions');
    expect(reactions.schema.path('type').options.enum).toEqual(['いいね', '超いいね', '拍手', '笑顔', 'びっくり']);
    expect(reactions.schema.path('guest_id').options.maxLength).toBe(36);
    expect(reactions.schema.path('guest_name').options.maxlength).toBe(20);

    const replies = Chat.schema.path('replies');
    expect(replies.schema.path('delete_flg').defaultValue).toBe(false);
    expect(typeof replies.schema.path('supplementaries').defaultValue).toBe('function');

    const supplementaries = Chat.schema.path('supplementaries');
    expect(typeof supplementaries.schema.path('reactions').defaultValue).toBe('function');
    expect(Chat.schema.path('translations').schema.options._id).toBe(false);
  });
});

describe('Floorのスキーマ', () => {
  test('必要な項目と制約を定義する', () => {
    expectRequired(Floor.schema, 'user');
    expectRequired(Floor.schema, 'title');
    expectTrim(Floor.schema, 'title');
    expectDefault(Floor.schema, 'description', null);
    expectDefault(Floor.schema, 'floor_display_hidden', false);
    expectDefault(Floor.schema, 'delete_flg', false);
    expectDefault(Floor.schema, 'created_at', Date.now);
  });

  test('更新時の入力検証を有効にする', () => {
    expect(Floor.schema.get('runValidators')).toBe(true);
  });
});

describe('FloorInviteのスキーマ', () => {
  test('必要な項目と制約を定義する', () => {
    expectRequired(FloorInvite.schema, 'floor');
    expectRequired(FloorInvite.schema, 'user');
    expectRequired(FloorInvite.schema, 'token');
    expectRequired(FloorInvite.schema, 'token_expiry');
    expectTrim(FloorInvite.schema, 'token');
    expectDefault(FloorInvite.schema, 'created_at', Date.now);
  });

  test('必要な索引を定義する', () => {
    expectIndex(FloorInvite.schema, { token: 1 }, { unique: true });
  });
});

describe('FloorMemberのスキーマ', () => {
  test('必要な項目と制約を定義する', () => {
    expectRequired(FloorMember.schema, 'floor');
    expectRequired(FloorMember.schema, 'user');
    expectDefault(FloorMember.schema, 'created_at', Date.now);
  });
});

describe('FloorQuickTextGroupのスキーマ', () => {
  test('必要な項目と制約を定義する', () => {
    expectRequired(FloorQuickTextGroup.schema, 'floor');
    expectRequired(FloorQuickTextGroup.schema, 'user');
    expectRequired(FloorQuickTextGroup.schema, 'order');
    expectRequired(FloorQuickTextGroup.schema, 'title');
    expectRequired(FloorQuickTextGroup.schema, 'lang');
    expectMinMax(FloorQuickTextGroup.schema, 'order', 1, 100);
    expectMinMax(FloorQuickTextGroup.schema, 'title', 1, 200);
    expectTrim(FloorQuickTextGroup.schema, 'title');
    expectDefault(FloorQuickTextGroup.schema, 'created_at', Date.now);
  });

  test('バージョンキーを無効にする', () => {
    expect(FloorQuickTextGroup.schema.options.versionKey).toBe(false);
  });
});

describe('FloorQuickTextItemのスキーマ', () => {
  test('必要な項目と制約を定義する', () => {
    expectRequired(FloorQuickTextItem.schema, 'floor');
    expectRequired(FloorQuickTextItem.schema, 'group');
    expectRequired(FloorQuickTextItem.schema, 'order');
    expectRequired(FloorQuickTextItem.schema, 'label');
    expectRequired(FloorQuickTextItem.schema, 'lang');
    expectMinMax(FloorQuickTextItem.schema, 'order', 1, 100);
    expectMinMax(FloorQuickTextItem.schema, 'label', 1, 200);
    expectTrim(FloorQuickTextItem.schema, 'label');
    expectDefault(FloorQuickTextItem.schema, 'created_at', Date.now);
  });

  test('バージョンキーを無効にする', () => {
    expect(FloorQuickTextItem.schema.options.versionKey).toBe(false);
  });
});

describe('FloorTagのスキーマ', () => {
  test('必要な項目と制約を定義する', () => {
    expectRequired(FloorTag.schema, 'floor');
    expectRequired(FloorTag.schema, 'user');
    expectRequired(FloorTag.schema, 'order');
    expectRequired(FloorTag.schema, 'name');
    expectRequired(FloorTag.schema, 'lang');
    expectMinMax(FloorTag.schema, 'order', 1, 100);
    expectTrim(FloorTag.schema, 'name');
    expectTrim(FloorTag.schema, 'lang');
    expectDefault(FloorTag.schema, 'delete_flg', false);
    expectDefault(FloorTag.schema, 'created_at', Date.now);
    expectDefault(FloorTag.schema, 'updated_at', null);
    expectDefault(FloorTag.schema, 'deleted_at', null);
  });
});

describe('GoogleApiUsageのスキーマ', () => {
  test('必要な項目と制約を定義する', () => {
    expectRequired(GoogleApiUsage.schema, 'api_type');
    expectRequired(GoogleApiUsage.schema, 'year_month');
    expectRequired(GoogleApiUsage.schema, 'usage');
    expectEnum(GoogleApiUsage.schema, 'api_type', ['translate', 'vision', 'speech', 'video']);
    expectMatch(GoogleApiUsage.schema, 'year_month', /^\d{4}-(0[1-9]|1[0-2])$/);
    expectDefault(GoogleApiUsage.schema, 'usage', 0);
  });

  test('必要な索引を定義する', () => {
    expectIndex(GoogleApiUsage.schema, { api_type: 1, year_month: 1 }, { unique: true });
  });
});

describe('GoogleTranslateAPIのスキーマ', () => {
  test('既定値を定義する', () => {
    expectDefault(GoogleTranslateAPI.schema, 'use_month', null);
    expectDefault(GoogleTranslateAPI.schema, 'count', 0);
    expectDefault(GoogleTranslateAPI.schema, 'length', 0);
    expectDefault(GoogleTranslateAPI.schema, 'used_at', null);
  });
});

describe('KickedUserのスキーマ', () => {
  test('必要な項目と制約を定義する', () => {
    expectRequired(KickedUser.schema, 'user');
    expectRequired(KickedUser.schema, 'kicked_by');
    expectRequired(KickedUser.schema, 'floor');
    expectRequired(KickedUser.schema, 'room');
    expectDefault(KickedUser.schema, 'kicked_at', Date.now);
  });
});

describe('PushFilterのスキーマ', () => {
  test('必要な項目と制約を定義する', () => {
    expectRequired(PushFilter.schema, 'floor');
    expectRequired(PushFilter.schema, 'room');
    expectRequired(PushFilter.schema, 'user');
    expectRequired(PushFilter.schema, 'conditions');
  });

  test('必要な索引を定義する', () => {
    expectIndex(PushFilter.schema, { floor: 1, room: 1 });
  });
});

describe('QuickTextGroupのスキーマ', () => {
  test('必要な項目と制約を定義する', () => {
    expectRequired(QuickTextGroup.schema, 'user');
    expectRequired(QuickTextGroup.schema, 'order');
    expectRequired(QuickTextGroup.schema, 'title');
    expectRequired(QuickTextGroup.schema, 'lang');
    expectMinMax(QuickTextGroup.schema, 'order', 1, 100);
    expectMinMax(QuickTextGroup.schema, 'title', 1, 200);
    expectTrim(QuickTextGroup.schema, 'title');
    expectDefault(QuickTextGroup.schema, 'created_at', Date.now);
  });

  test('バージョンキーを無効にする', () => {
    expect(QuickTextGroup.schema.options.versionKey).toBe(false);
  });
});

describe('QuickTextItemのスキーマ', () => {
  test('必要な項目と制約を定義する', () => {
    expectRequired(QuickTextItem.schema, 'group');
    expectRequired(QuickTextItem.schema, 'order');
    expectRequired(QuickTextItem.schema, 'label');
    expectRequired(QuickTextItem.schema, 'lang');
    expectMinMax(QuickTextItem.schema, 'order', 1, 100);
    expectMinMax(QuickTextItem.schema, 'label', 1, 200);
    expectTrim(QuickTextItem.schema, 'label');
    expectDefault(QuickTextItem.schema, 'created_at', Date.now);
  });

  test('バージョンキーを無効にする', () => {
    expect(QuickTextItem.schema.options.versionKey).toBe(false);
  });
});

describe('ResetPasswordのスキーマ', () => {
  test('必要な項目と制約を定義する', () => {
    expectRequired(ResetPassword.schema, 'mail');
    expectRequired(ResetPassword.schema, 'token');
    expectDefault(ResetPassword.schema, 'created_at', Date.now);
  });

  test('必要な索引を定義する', () => {
    expectIndex(ResetPassword.schema, { mail: 1 }, { unique: true });
    expectIndex(ResetPassword.schema, { token: 1 }, { unique: true });
  });
});

describe('Roomのスキーマ', () => {
  test('必要な項目と制約を定義する', () => {
    expectRequired(Room.schema, 'floor');
    expectRequired(Room.schema, 'user');
    expectRequired(Room.schema, 'title');
    expectDefault(Room.schema, 'display_order', 0);
    expectDefault(Room.schema, 'description', null);
    expectDefault(Room.schema, 'lang', null);
    expectDefault(Room.schema, 'guest_reaction_only', false);
    expectDefault(Room.schema, 'member_only', false);
    expectDefault(Room.schema, 'room_display_hidden', false);
    expectDefault(Room.schema, 'notification', true);
    expectDefault(Room.schema, 'external_sns_button', false);
    expectDefault(Room.schema, 'delete_flg', false);
    expectDefault(Room.schema, 'created_at', Date.now);
    expectDefault(Room.schema, 'updated_at', null);
    expectDefault(Room.schema, 'deleted_at', null);
  });
});

describe('RoomInviteのスキーマ', () => {
  test('必要な項目と制約を定義する', () => {
    expectRequired(RoomInvite.schema, 'floor');
    expectRequired(RoomInvite.schema, 'room');
    expectRequired(RoomInvite.schema, 'user');
    expectRequired(RoomInvite.schema, 'token');
    expectRequired(RoomInvite.schema, 'token_expiry');
    expectDefault(RoomInvite.schema, 'created_at', Date.now);
  });

  test('必要な索引を定義する', () => {
    expectIndex(RoomInvite.schema, { token: 1 }, { unique: true });
  });
});

describe('RoomMemberのスキーマ', () => {
  test('必要な項目と制約を定義する', () => {
    expectRequired(RoomMember.schema, 'floor');
    expectRequired(RoomMember.schema, 'room');
    expectRequired(RoomMember.schema, 'user');
    expectDefault(RoomMember.schema, 'created_at', Date.now);
  });

  test('必要な索引を定義する', () => {
    expectIndex(RoomMember.schema, { room: 1, user: 1 });
  });
});

describe('RoomQuickTextGroupのスキーマ', () => {
  test('必要な項目と制約を定義する', () => {
    expectRequired(RoomQuickTextGroup.schema, 'floor');
    expectRequired(RoomQuickTextGroup.schema, 'room');
    expectRequired(RoomQuickTextGroup.schema, 'user');
    expectRequired(RoomQuickTextGroup.schema, 'order');
    expectRequired(RoomQuickTextGroup.schema, 'title');
    expectRequired(RoomQuickTextGroup.schema, 'lang');
    expectMinMax(RoomQuickTextGroup.schema, 'order', 1, 100);
    expectMinMax(RoomQuickTextGroup.schema, 'title', 1, 200);
    expectTrim(RoomQuickTextGroup.schema, 'title');
    expectDefault(RoomQuickTextGroup.schema, 'created_at', Date.now);
  });

  test('バージョンキーを無効にする', () => {
    expect(RoomQuickTextGroup.schema.options.versionKey).toBe(false);
  });
});

describe('RoomQuickTextItemのスキーマ', () => {
  test('必要な項目と制約を定義する', () => {
    expectRequired(RoomQuickTextItem.schema, 'floor');
    expectRequired(RoomQuickTextItem.schema, 'room');
    expectRequired(RoomQuickTextItem.schema, 'group');
    expectRequired(RoomQuickTextItem.schema, 'order');
    expectRequired(RoomQuickTextItem.schema, 'label');
    expectRequired(RoomQuickTextItem.schema, 'lang');
    expectMinMax(RoomQuickTextItem.schema, 'order', 1, 100);
    expectMinMax(RoomQuickTextItem.schema, 'label', 1, 200);
    expectTrim(RoomQuickTextItem.schema, 'label');
    expectDefault(RoomQuickTextItem.schema, 'created_at', Date.now);
  });

  test('バージョンキーを無効にする', () => {
    expect(RoomQuickTextItem.schema.options.versionKey).toBe(false);
  });
});

describe('RoomTagのスキーマ', () => {
  test('必要な項目と制約を定義する', () => {
    expectRequired(RoomTag.schema, 'floor');
    expectRequired(RoomTag.schema, 'room');
    expectRequired(RoomTag.schema, 'user');
    expectRequired(RoomTag.schema, 'order');
    expectRequired(RoomTag.schema, 'name');
    expectMinMax(RoomTag.schema, 'order', 1, 100);
    expectDefault(RoomTag.schema, 'lang', null);
    expectDefault(RoomTag.schema, 'delete_flg', false);
    expectDefault(RoomTag.schema, 'created_at', Date.now);
    expectDefault(RoomTag.schema, 'updated_at', null);
    expectDefault(RoomTag.schema, 'deleted_at', null);
  });
});

describe('SoundTagのスキーマ', () => {
  test('必要な項目と制約を定義する', () => {
    expectRequired(SoundTag.schema, 'floor');
    expectRequired(SoundTag.schema, 'room');
    expectRequired(SoundTag.schema, 'user');
    expectDefault(SoundTag.schema, 'created_at', Date.now);
    expectDefault(SoundTag.schema, 'updated_at', null);
  });

  test('必要な索引を定義する', () => {
    expectIndex(SoundTag.schema, { floor: 1, room: 1, user: 1 }, { unique: true });
  });
});

describe('Spamのスキーマ', () => {
  test('必要な項目と制約を定義する', () => {
    expectRequired(Spam.schema, 'user');
    expectRequired(Spam.schema, 'word');
    expectMinMax(Spam.schema, 'word', 1, 50);
    expectTrim(Spam.schema, 'word');
    expectDefault(Spam.schema, 'created_at', Date.now);
  });
});

describe('Userのスキーマ', () => {
  const getUserPreUpdateHook = () => {
    const hooks = User.schema.s.hooks._pres.get('findOneAndUpdate') || [];
    return hooks.find((hook) => hook.fn && hook.fn.toString().includes('bcrypt.genSalt'));
  };

  const runUserPreUpdateHook = (context) =>
    new Promise((resolve, reject) => {
      const hook = getUserPreUpdateHook();
      if (!hook) return reject(new Error('pre hook not found'));
      hook.fn.call(context, (err) => (err ? reject(err) : resolve()));
    });

  test('必要な項目と制約を定義する', () => {
    expectRequired(User.schema, 'username');
    expectDefault(User.schema, 'mail', null);
    expectDefault(User.schema, 'role', ROLES.AUTHOR);
    expectDefault(User.schema, 'push_enabled', false);
    expectDefault(User.schema, 'reply_push_enabled', true);
    expectDefault(User.schema, 'replied_post_push_enabled', true);
    expectDefault(User.schema, 'session_version', 0);
    expect(User.schema.path('session_version').options.min).toBe(0);
    expectDefault(User.schema, 'delete_flg', false);
    expectDefault(User.schema, 'created_at', Date.now);
    expectDefault(User.schema, 'updated_at', null);
    expectDefault(User.schema, 'deleted_at', null);
  });

  test('必要な索引を定義する', () => {
    expectIndex(User.schema, { mail: 1 }, { unique: true, partialFilterExpression: { mail: { $type: 'string' } } });
  });

  test('パスワード未設定の比較を拒否する', async () => {
    const user = new User({ username: 'alice' });
    await expect(user.comparePassword('pw')).rejects.toThrow('Password hash is not loaded');
  });

  test('Promise形式でパスワードを比較するとbcrypt.compareを呼ぶ', async () => {
    bcrypt.compare.mockResolvedValue(true);
    const user = new User({ username: 'bob' });
    user.password = 'hashed';

    const result = await user.comparePassword('pw');

    expect(bcrypt.compare).toHaveBeenCalledWith('pw', 'hashed');
    expect(result).toBe(true);
  });

  test('Promise形式のパスワード比較でbcrypt.compareのエラーを伝播する', async () => {
    const err = new Error('compare-fail');
    bcrypt.compare.mockRejectedValue(err);
    const user = new User({ username: 'bob' });
    user.password = 'hashed';

    await expect(user.comparePassword('pw')).rejects.toBe(err);
  });

  test('パスワード比較のエラーをコールバックへ渡す', () => {
    const err = new Error('compare-fail');
    const cb = jest.fn();
    bcrypt.compare.mockImplementation((password, hash, done) => done(err));
    const user = new User({ username: 'bob' });
    user.password = 'hashed';

    user.comparePassword('pw', cb);

    expect(cb).toHaveBeenCalledWith(err);
  });

  test('更新対象にパスワードがあればハッシュ化する', async () => {
    bcrypt.genSalt.mockImplementation((rounds, cb) => cb(null, 'salt'));
    bcrypt.hash.mockImplementation((pw, salt, cb) => cb(null, 'hashed'));
    const context = { _update: { password: 'plain' } };

    await runUserPreUpdateHook(context);

    expect(bcrypt.genSalt).toHaveBeenCalledWith(10, expect.any(Function));
    expect(bcrypt.hash).toHaveBeenCalledWith('plain', 'salt', expect.any(Function));
    expect(context._update.password).toBe('hashed');
  });

  test('$setによるパスワード更新でもハッシュ化する', async () => {
    bcrypt.genSalt.mockImplementation((rounds, cb) => cb(null, 'salt'));
    bcrypt.hash.mockImplementation((pw, salt, cb) => cb(null, 'hashed'));
    const context = {
      _update: { $set: { password: 'plain' }, $inc: { session_version: 1 } },
      getUpdate() {
        return this._update;
      },
    };

    await runUserPreUpdateHook(context);

    expect(context._update.$set.password).toBe('hashed');
    expect(context._update.$inc.session_version).toBe(1);
  });

  test('更新前のソルト生成に失敗したらエラーを返す', async () => {
    const err = new Error('salt-fail');
    bcrypt.genSalt.mockImplementation((rounds, cb) => cb(err));
    const context = { _update: { password: 'plain' } };

    await expect(runUserPreUpdateHook(context)).rejects.toThrow('salt-fail');
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });

  test('更新前のハッシュ生成に失敗したらエラーを返す', async () => {
    const err = new Error('hash-fail');
    bcrypt.genSalt.mockImplementation((rounds, cb) => cb(null, 'salt'));
    bcrypt.hash.mockImplementation((pw, salt, cb) => cb(err));
    const context = { _update: { password: 'plain' } };

    await expect(runUserPreUpdateHook(context)).rejects.toThrow('hash-fail');
  });

  test('パスワードが更新対象になければハッシュ化しない', async () => {
    const context = { _update: {} };

    await runUserPreUpdateHook(context);

    expect(bcrypt.genSalt).not.toHaveBeenCalled();
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });
});

describe('UserTempのスキーマ', () => {
  const getUserTempPreSaveHook = () => {
    const hooks = UserTemp.schema.s.hooks._pres.get('save') || [];
    return hooks.find((hook) => hook.fn && hook.fn.toString().includes('bcrypt.genSalt'));
  };

  const runUserTempPreSaveHook = (context) =>
    new Promise((resolve, reject) => {
      const hook = getUserTempPreSaveHook();
      if (!hook) return reject(new Error('pre hook not found'));
      hook.fn.call(context, (err) => (err ? reject(err) : resolve()));
    });

  test('必要な項目と制約を定義する', () => {
    expectRequired(UserTemp.schema, 'username');
    expectRequired(UserTemp.schema, 'mail');
    expectRequired(UserTemp.schema, 'password');
    expectRequired(UserTemp.schema, 'token');
    expectDefault(UserTemp.schema, 'lang', null);
    expectDefault(UserTemp.schema, 'created_at', Date.now);
  });

  test('必要な索引を定義する', () => {
    expectIndex(UserTemp.schema, { token: 1 }, { unique: true });
  });

  test('コールバック形式のパスワード比較でbcrypt.compareを使う', () => {
    const cb = jest.fn();
    bcrypt.compare.mockImplementation((password, hash, done) => done(null, true));
    const user = new UserTemp({ username: 'temp', mail: 't@example.com', password: 'hashed', token: 'tok' });

    user.comparePassword('pw', cb);

    expect(bcrypt.compare).toHaveBeenCalledWith('pw', 'hashed', expect.any(Function));
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  test('パスワード比較のエラーをコールバックへ渡す', () => {
    const err = new Error('compare-fail');
    const cb = jest.fn();
    bcrypt.compare.mockImplementation((password, hash, done) => done(err));
    const user = new UserTemp({ username: 'temp', mail: 't@example.com', password: 'hashed', token: 'tok' });

    user.comparePassword('pw', cb);

    expect(cb).toHaveBeenCalledWith(err);
  });

  test('保存前に変更済みのパスワードをハッシュ化する', async () => {
    bcrypt.genSalt.mockImplementation((rounds, cb) => cb(null, 'salt'));
    bcrypt.hash.mockImplementation((pw, salt, cb) => cb(null, 'hashed'));
    const context = {
      password: 'plain',
      isModified: (field) => field === 'password',
      isNew: false,
    };

    await runUserTempPreSaveHook(context);

    expect(bcrypt.genSalt).toHaveBeenCalledWith(10, expect.any(Function));
    expect(bcrypt.hash).toHaveBeenCalledWith('plain', 'salt', expect.any(Function));
    expect(context.password).toBe('hashed');
  });

  test('保存前のソルト生成に失敗したらエラーを返す', async () => {
    const err = new Error('salt-fail');
    bcrypt.genSalt.mockImplementation((rounds, cb) => cb(err));
    const context = {
      password: 'plain',
      isModified: () => true,
      isNew: false,
    };

    await expect(runUserTempPreSaveHook(context)).rejects.toThrow('salt-fail');
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });

  test('保存前のハッシュ生成に失敗したらエラーを返す', async () => {
    const err = new Error('hash-fail');
    bcrypt.genSalt.mockImplementation((rounds, cb) => cb(null, 'salt'));
    bcrypt.hash.mockImplementation((pw, salt, cb) => cb(err));
    const context = {
      password: 'plain',
      isModified: () => true,
      isNew: false,
    };

    await expect(runUserTempPreSaveHook(context)).rejects.toThrow('hash-fail');
  });

  test('パスワードに変更がなければハッシュ化しない', async () => {
    const context = {
      password: 'plain',
      isModified: () => false,
      isNew: false,
    };

    await runUserTempPreSaveHook(context);

    expect(bcrypt.genSalt).not.toHaveBeenCalled();
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });
});

describe('schemas/Translationのスキーマ', () => {
  test('必要な項目と制約を定義する', () => {
    expectRequired(TranslationSchema, 'user');
    expectRequired(TranslationSchema, 'lang');
    expectRequired(TranslationSchema, 'content');
    expectTrim(TranslationSchema, 'lang');
    expectTrim(TranslationSchema, 'content');
    expectDefault(TranslationSchema, 'created_at', Date.now);
  });

  test('スキーマの設定を定義する', () => {
    expect(TranslationSchema.options._id).toBe(false);
    expect(TranslationSchema.options.versionKey).toBe(false);
  });
});
