import { expect } from 'vitest';
import { REACTION_TYPES } from '@/constants/reactionTypes';

describe('リアクションの定義', () => {
  it('リアクション定義は type/emoji/icon を持つ', () => {
    expect(REACTION_TYPES.length).to.be.greaterThan(0);
    REACTION_TYPES.forEach((item) => {
      expect(item.type).to.be.a('string').and.not.equal('');
      expect(item.emoji).to.be.a('string').and.not.equal('');
      expect(item.icon)
        .to.be.a('string')
        .and.match(/^\/assets\/emoji\//);
    });
  });

  it('リアクション type は重複しない', () => {
    const types = REACTION_TYPES.map((item) => item.type);
    expect(new Set(types).size).to.equal(types.length);
  });
});
