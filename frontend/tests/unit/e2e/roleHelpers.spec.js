import { expect } from 'vitest';

const {
  buildFloorExpectedControls,
} = require('../../e2e/specs/helpers/role-helpers');

const baseOptions = {
  title: 'Floor',
  description: 'Description',
};

describe('E2Eのロール別操作', () => {
  it('翻訳先が未指定なら非表示の言語入力要素を要求しない', () => {
    const controls = buildFloorExpectedControls(baseOptions);

    expect(controls.some(({ selector }) => selector === '#ja')).to.equal(false);
    expect(controls.some(({ selector }) => selector === '#en')).to.equal(false);
  });

  it('翻訳先が明示された場合だけ全言語入力要素を厳密に検証する', () => {
    const controls = buildFloorExpectedControls({
      ...baseOptions,
      targetLangs: ['ja'],
    });
    const languageControls = controls.filter(({ selector }) => /^#[a-z]{2}$/.test(selector));

    expect(languageControls).to.have.lengthOf(16);
    expect(languageControls.find(({ selector }) => selector === '#ja').value).to.equal(true);
    expect(languageControls.find(({ selector }) => selector === '#en').value).to.equal(false);
  });
});
