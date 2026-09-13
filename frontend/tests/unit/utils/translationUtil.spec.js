import { expect } from 'vitest';
import TranslationUtil from '@/utils/translationUtil';

describe('翻訳文の取得（TranslationUtil）', () => {
  it('getTitle/getDescription は翻訳があればそれを返す', () => {
    const floor = {
      lang: 'en',
      title: 'Title',
      description: 'Desc',
      translations: [{ lang: 'ja', title: '日本語', description: '説明' }],
    };

    expect(TranslationUtil.getTitle(floor, 'ja')).to.equal('日本語');
    expect(TranslationUtil.getDescription(floor, 'ja')).to.equal('説明');
  });

  it('getTitle/getDescription は翻訳がなければ元の値を返す', () => {
    const floor = { lang: 'en', title: 'Title', description: 'Desc' };

    expect(TranslationUtil.getTitle(floor, 'ja')).to.equal('Title');
    expect(TranslationUtil.getDescription(floor, 'ja')).to.equal('Desc');
  });

  it('getTagName は翻訳が無ければ name を返す', () => {
    const tag = { name: 'Tag', translations: [{ lang: 'ja', name: 'タグ' }] };

    expect(TranslationUtil.getTagName(tag, 'ja')).to.equal('タグ');
    expect(TranslationUtil.getTagName({ name: 'Tag' }, 'ja')).to.equal('Tag');
  });

  it('getContent は翻訳や英語フォールバックを使う', () => {
    const post = {
      lang: 'ja',
      content: '日本語',
      translations: [
        { lang: 'en', content: 'English' },
        { lang: 'fr', content: 'Francais' },
      ],
    };

    expect(TranslationUtil.getContent(post, 'ja')).to.equal('日本語');
    expect(TranslationUtil.getContent(post, 'fr')).to.equal('Francais');
    expect(TranslationUtil.getContent(post, 'de')).to.equal('English');
  });

  it('needsTranslation は翻訳可否を判定する', () => {
    const data = { lang: 'ja', translations: [{ lang: 'en', content: 'English' }] };

    expect(TranslationUtil.needsTranslation(data, 'ja')).to.equal(false);
    expect(TranslationUtil.needsTranslation(data, 'en')).to.equal(true);
    expect(TranslationUtil.needsTranslation(data, 'de')).to.equal(true);
    expect(TranslationUtil.needsTranslation({ lang: 'ja' }, 'en')).to.equal(false);
  });

  it('getTranslatedTagName はタグ一覧から翻訳を返す', () => {
    const roomTags = [{ _id: 't1', name: 'Tag', translations: [{ lang: 'ja', name: 'タグ' }] }];

    expect(TranslationUtil.getTranslatedTagName('t1', roomTags, 'ja')).to.equal('タグ');
    expect(TranslationUtil.getTranslatedTagName('t1', roomTags, 'en')).to.equal('Tag');
    expect(TranslationUtil.getTranslatedTagName('missing', roomTags, 'ja')).to.equal(null);
    expect(TranslationUtil.getTranslatedTagName('t1', null, 'ja')).to.equal(null);
  });
});
