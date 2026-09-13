import { expect } from 'vitest';
import {
  buildTagCsvText,
  buildTagDeletePayload,
  buildTagListPayload,
  buildTagUpsertPayload,
  downloadCsvFile,
  normalizeTagOrderInput,
  parseAndValidateTagCsv,
  resolveLangLabel,
  sortTagsByOrder,
} from '@/features/tag/shared/tagCore';

describe('タグの並べ替えとCSV処理', () => {
  it('sortTagsByOrderはorder昇順で並び替える', () => {
    const source = [
      { _id: 'b', order: 2, name: 'b' },
      { _id: 'a', order: 1, name: 'a' },
    ];
    const sorted = sortTagsByOrder(source);
    expect(sorted.map((row) => row._id)).to.deep.equal(['a', 'b']);
  });

  it('resolveLangLabelは一致時に翻訳ラベル、不一致時にコードを返す', () => {
    const languages = [{ value: 'ja', label: '日本語' }];
    const t = (text) => `T:${text}`;

    expect(resolveLangLabel(languages, t, 'ja')).to.equal('T:日本語');
    expect(resolveLangLabel(languages, t, 'xx')).to.equal('xx');
  });

  it('parseAndValidateTagCsvは正しいCSVを解析する', () => {
    const parsed = parseAndValidateTagCsv('2,Tag2\n1,Tag1\n');
    expect(parsed.isValid).to.equal(true);
    expect(parsed.rows).to.deep.equal([
      [2, 'Tag2'],
      [1, 'Tag1'],
    ]);
  });

  it('parseAndValidateTagCsvは不正なCSVを弾く', () => {
    const parsed = parseAndValidateTagCsv('1,Tag1,extra\n');
    expect(parsed.isValid).to.equal(false);
    expect(parsed.rows).to.deep.equal([]);
  });

  it('parseAndValidateTagCsvはダブルクォート付きのnameを解析する', () => {
    const parsed = parseAndValidateTagCsv('1,"A,B"\n');
    expect(parsed.isValid).to.equal(true);
    expect(parsed.rows).to.deep.equal([[1, 'A,B']]);
  });

  it('buildTagCsvTextはorder昇順でCSV文字列を作る', () => {
    const csv = buildTagCsvText([
      { order: 2, name: 'b' },
      { order: 1, name: 'a' },
    ]);
    expect(csv).to.equal('1,a\r\n2,b\r\n');
  });

  it('buildTagCsvTextはカンマを含むnameをダブルクォートで出力する', () => {
    const csv = buildTagCsvText([{ order: 1, name: 'A,B' }]);
    expect(csv).to.equal('1,"A,B"\r\n');
  });

  it('downloadCsvFileはCSVダウンロードを実行する', () => {
    const originalURL = global.URL;
    const originalCreateElement = document.createElement;
    let created = null;
    let revoked = null;
    let clicked = false;

    global.URL = {
      createObjectURL: () => {
        created = 'blob:test';
        return created;
      },
      revokeObjectURL: (value) => {
        revoked = value;
      },
    };
    document.createElement = (tag) => {
      if (tag !== 'a') return originalCreateElement.call(document, tag);
      return {
        href: '',
        download: '',
        click: () => {
          clicked = true;
        },
      };
    };

    downloadCsvFile({ filename: 'sample.csv', content: '1,a\r\n' });
    expect(clicked).to.equal(true);
    expect(created).to.equal('blob:test');
    expect(revoked).to.equal('blob:test');

    global.URL = originalURL;
    document.createElement = originalCreateElement;
  });

  it('表示順が空なら既定値を使い、範囲外なら不正と判定する', () => {
    expect(normalizeTagOrderInput('', { fallback: 100 })).to.deep.equal({ valid: true, value: 100 });
    expect(normalizeTagOrderInput('5')).to.deep.equal({ valid: true, value: 5 });
    expect(normalizeTagOrderInput('1.5')).to.deep.equal({ valid: false, value: null });
  });

  it('buildTagListPayloadは対象範囲に応じたデータを返す', () => {
    expect(buildTagListPayload({ scope: 'floor', scopeId: 'f1' })).to.deep.equal({ floor_id: 'f1' });
    expect(buildTagListPayload({ scope: 'room', scopeId: 'r1' })).to.deep.equal({ room_id: 'r1' });
    expect(buildTagListPayload({ scope: 'unknown', scopeId: 'x1' })).to.deep.equal({});
  });

  it('buildTagUpsertPayloadは更新データを組み立てる', () => {
    const payload = buildTagUpsertPayload({
      scope: 'floor',
      scopeId: 'f1',
      tagId: 't1',
      order: 3,
      name: 'name',
      lang: 'ja',
      managementMode: true,
      deleteFlg: true,
    });

    expect(payload).to.deep.equal({
      _id: 't1',
      floor_id: 'f1',
      order: 3,
      name: 'name',
      lang: 'ja',
      delete_flg: true,
    });
  });

  it('buildTagUpsertPayloadはlang未指定時にlangを含めない', () => {
    const payload = buildTagUpsertPayload({
      scope: 'category',
      scopeId: null,
      order: 1,
      name: 'name',
    });

    expect(payload).to.deep.equal({
      order: 1,
      name: 'name',
    });
  });

  it('buildTagDeletePayloadは_idのみ返す', () => {
    expect(buildTagDeletePayload({ _id: 't1' })).to.deep.equal({ _id: 't1' });
    expect(buildTagDeletePayload(null)).to.deep.equal({});
  });
});
