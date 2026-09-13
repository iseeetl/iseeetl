const mongoose = require('mongoose');

const AuthIdentity = require('../../../models/AuthIdentity');
const CategoryTag = require('../../../models/CategoryTag');
const Chat = require('../../../models/Chat');
const Floor = require('../../../models/Floor');
const FloorQuickTextItem = require('../../../models/FloorQuickTextItem');
const GoogleApiUsage = require('../../../models/GoogleApiUsage');
const RoomTag = require('../../../models/RoomTag');
const Spam = require('../../../models/Spam');

const makeId = () => new mongoose.Types.ObjectId();

describe('モデルの入力検証', () => {
  test('AuthIdentityは未対応の認証サービスを拒否する', () => {
    const doc = new AuthIdentity({
      user_id: makeId(),
      provider: 'github',
      provider_user_id: 'sub',
    });

    const err = doc.validateSync();

    expect(err).toBeDefined();
    expect(err.errors['provider']).toBeDefined();
  });

  test('共通タグは表示順が下限未満なら拒否する', () => {
    const doc = new CategoryTag({ user: makeId(), order: 0, name: 'tag' });

    const err = doc.validateSync();

    expect(err).toBeDefined();
    expect(err.errors['order']).toBeDefined();
  });

  test('フロアはタイトルが文字数の上限を超えたら拒否する', () => {
    const doc = new Floor({ user: makeId(), title: 'a'.repeat(101) });

    const err = doc.validateSync();

    expect(err).toBeDefined();
    expect(err.errors['title']).toBeDefined();
  });

  test('フロアの単語はラベルが文字数の上限を超えたら拒否する', () => {
    const doc = new FloorQuickTextItem({
      floor: makeId(),
      group: makeId(),
      order: 1,
      label: 'a'.repeat(201),
      lang: 'ja',
    });

    const err = doc.validateSync();

    expect(err).toBeDefined();
    expect(err.errors['label']).toBeDefined();
  });

  test('GoogleApiUsageは不正な年月形式を拒否する', () => {
    const doc = new GoogleApiUsage({ api_type: 'translate', year_month: '2024-13', usage: 1 });

    const err = doc.validateSync();

    expect(err).toBeDefined();
    expect(err.errors['year_month']).toBeDefined();
  });

  test('ルームタグは表示順が下限未満なら拒否する', () => {
    const doc = new RoomTag({ floor: makeId(), room: makeId(), user: makeId(), order: 0, name: 'tag' });

    const err = doc.validateSync();

    expect(err).toBeDefined();
    expect(err.errors['order']).toBeDefined();
  });

  test('スパムは語句が文字数の上限を超えたら拒否する', () => {
    const doc = new Spam({ user: makeId(), word: 'a'.repeat(51) });

    const err = doc.validateSync();

    expect(err).toBeDefined();
    expect(err.errors['word']).toBeDefined();
  });

  test('Chatは未対応のリアクション種別を拒否する', () => {
    const doc = new Chat({
      floor: makeId(),
      room: makeId(),
      reactions: [{ type: 'invalid' }],
    });

    const err = doc.validateSync();

    expect(err).toBeDefined();
    expect(err.errors['reactions.0.type']).toBeDefined();
  });
});
