import { describe, expect, it } from 'vitest';
import { insertTextAtSelection } from '@/features/timeline/textInsertion';

describe('選択位置への文字挿入', () => {
  it('選択位置がない場合は空の本文に追加し、カーソル位置を指定しない', () => {
    expect(
      insertTextAtSelection({
        value: null,
        insertText: 'X',
        selection: null,
      })
    ).to.deep.equal({
      value: 'X',
      selection: null,
      usedSelection: false,
    });
  });

  it('選択位置がない場合は既存本文の末尾に追加する', () => {
    expect(
      insertTextAtSelection({
        value: 'ab',
        insertText: 'X',
        selection: null,
      })
    ).to.deep.equal({
      value: 'abX',
      selection: null,
      usedSelection: false,
    });
  });

  it('選択範囲がない場合はカーソル位置に挿入し、その直後の位置を返す', () => {
    expect(
      insertTextAtSelection({
        value: 'ab',
        insertText: 'X',
        selection: { start: 1, end: 1 },
      })
    ).to.deep.equal({
      value: 'aXb',
      selection: { start: 2, end: 2 },
      usedSelection: true,
    });
  });

  it('選択範囲を置き換え、その直後のカーソル位置を返す', () => {
    expect(
      insertTextAtSelection({
        value: 'abcd',
        insertText: 'X',
        selection: { start: 1, end: 3 },
      })
    ).to.deep.equal({
      value: 'aXd',
      selection: { start: 2, end: 2 },
      usedSelection: true,
    });
  });

  it('絵文字などの置換位置をUTF-16のインデックスで計算する', () => {
    expect(
      insertTextAtSelection({
        value: 'A😀B',
        insertText: 'X',
        selection: { start: 1, end: 3 },
      })
    ).to.deep.equal({
      value: 'AXB',
      selection: { start: 2, end: 2 },
      usedSelection: true,
    });
  });

  it('挿入文字列のUTF-16長をカーソル位置に反映し、元の選択範囲を変更しない', () => {
    const selection = Object.freeze({ start: 1, end: 1 });
    const input = Object.freeze({ value: 'AB', insertText: '😀', selection });

    expect(insertTextAtSelection(input)).to.deep.equal({
      value: 'A😀B',
      selection: { start: 3, end: 3 },
      usedSelection: true,
    });
    expect(input.selection).to.equal(selection);
    expect(input.selection).to.deep.equal({ start: 1, end: 1 });
  });
});
