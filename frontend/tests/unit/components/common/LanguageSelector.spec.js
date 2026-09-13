import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import LanguageSelector from '@/components/common/LanguageSelector.vue';
import { LANGUAGES } from '@/constants/languages';
import { createApplicationI18n } from '@/i18n';

const makeTranslateMock = () => {
  const calls = [];
  const translate = (key, named, options) => {
    const locale = options?.locale;
    calls.push({ key, named, locale });
    return locale ? `${key}:${locale}` : key;
  };
  return { translate, calls };
};

const withNavigatorProps = (overrides) => {
  const originals = {};
  for (const k of Object.keys(overrides)) {
    const desc = Object.getOwnPropertyDescriptor(window.navigator, k) || { configurable: true };
    originals[k] = desc;
    Object.defineProperty(window.navigator, k, {
      configurable: true,
      get: () => overrides[k],
    });
  }
  return () => {
    for (const [k, d] of Object.entries(originals)) {
      Object.defineProperty(window.navigator, k, d);
    }
  };
};

describe('言語選択（LanguageSelector）', () => {
  it('既定のcontrolIdでラベルとselectを関連付ける', () => {
    const { translate } = makeTranslateMock();
    const wrapper = shallowMount(LanguageSelector, {
      props: { modelValue: 'ja' },
      mocks: { $t: translate },
    });

    expect(wrapper.find('label').attributes('for')).to.equal('lang');
    expect(wrapper.find('select').attributes('id')).to.equal('lang');
  });

  it('指定したcontrolIdでラベルとselectを関連付ける', () => {
    const { translate } = makeTranslateMock();
    const wrapper = shallowMount(LanguageSelector, {
      props: { modelValue: 'ja', controlId: 'guest_profile_lang' },
      mocks: { $t: translate },
    });

    expect(wrapper.find('label').attributes('for')).to.equal('guest_profile_lang');
    expect(wrapper.find('select').attributes('id')).to.equal('guest_profile_lang');
  });

  it('初期選択はmodelValueを反映し、選択肢はLANGUAGESと一致する', () => {
    const { translate, calls } = makeTranslateMock();
    const initValue = LANGUAGES[0] ? LANGUAGES[0].value : null;

    const wrapper = shallowMount(LanguageSelector, {
      props: { modelValue: initValue },
      mocks: {
        $t: translate,
      },
    });

    expect(wrapper.vm.selectedLang).to.equal(initValue);
    expect(wrapper.vm.languages).to.deep.equal(LANGUAGES);

    const options = wrapper.findAll('option');
    expect(options.length).to.equal(LANGUAGES.length);

    expect(calls.length).to.equal(LANGUAGES.length + 1);
    expect(calls[0]).to.deep.equal({ key: '言語', named: undefined, locale: undefined });
    const localeUsed = wrapper.vm.browserLocale;
    calls.slice(1).forEach((c) => {
      expect(c.named).to.deep.equal({});
      expect(c.locale).to.equal(localeUsed);
    });

    const texts = options.map((o) => o.text().trim());
    const expected = LANGUAGES.map((l) => `${l.label}:${localeUsed}`);
    expect(texts).to.deep.equal(expected);
  });

  it('言語を選択するとchangeイベントで新しい言語を通知する', async () => {
    const { translate } = makeTranslateMock();
    // 値の変更を検証するには、言語の選択肢が2件以上必要。
    const values = LANGUAGES.map((l) => l.value);
    const initial = values[0] || null;
    const next = values[1] || values[0] || null;

    const wrapper = shallowMount(LanguageSelector, {
      props: { modelValue: initial },
      mocks: { $t: translate },
    });

    const select = wrapper.find('select');
    await select.setValue(next);

    expect(wrapper.vm.selectedLang).to.equal(next);
    expect(wrapper.emitted()['update:modelValue']).to.deep.equal([[next]]);
    expect(wrapper.emitted().change).to.exist;
    expect(wrapper.emitted().change[0]).to.deep.equal([next]);
  });

  it('modelValueの変更を選択状態へ反映する', async () => {
    const { translate } = makeTranslateMock();
    const values = LANGUAGES.map((l) => l.value);
    const a = values[0] || null;
    const b = values[1] || values[0] || null;

    const wrapper = shallowMount(LanguageSelector, {
      props: { modelValue: a },
      mocks: { $t: translate },
    });

    expect(wrapper.vm.selectedLang).to.equal(a);
    await wrapper.setProps({ modelValue: b });
    expect(wrapper.vm.selectedLang).to.equal(b);
  });

  it('ブラウザの優先言語の先頭を使い、小文字化して地域コードを除く', () => {
    const restore = withNavigatorProps({ languages: ['JA-JP'], language: 'en-US' });
    const { translate } = makeTranslateMock();
    const wrapper = shallowMount(LanguageSelector, {
      props: { modelValue: null },
      mocks: { $t: translate },
    });
    expect(wrapper.vm.browserLocale).to.equal('ja');
    restore();
  });

  it('優先言語の一覧がなければnavigator.languageを使う', () => {
    const restore = withNavigatorProps({ languages: undefined, language: 'de-DE' });
    const { translate } = makeTranslateMock();
    const wrapper = shallowMount(LanguageSelector, {
      props: { modelValue: null },
      mocks: { $t: translate },
    });
    expect(wrapper.vm.browserLocale).to.equal('de');
    restore();
  });

  it('ブラウザの言語を取得できない場合は英語を使う', () => {
    const restore = withNavigatorProps({ languages: undefined, language: undefined });
    const { translate } = makeTranslateMock();
    const wrapper = shallowMount(LanguageSelector, {
      props: { modelValue: null },
      mocks: { $t: translate },
    });
    expect(wrapper.vm.browserLocale).to.equal('en');
    restore();
  });

  it('ブラウザの言語が未対応なら英語を使う', () => {
    const restore = withNavigatorProps({ languages: ['nl-NL'], language: 'nl-NL' });
    const { translate } = makeTranslateMock();
    const wrapper = shallowMount(LanguageSelector, {
      props: { modelValue: null },
      mocks: { $t: translate },
    });
    expect(wrapper.vm.browserLocale).to.equal('en');
    restore();
  });

  it('表示言語を変えても言語の選択肢はブラウザの言語で表示する', async () => {
    const restore = withNavigatorProps({ languages: ['en-US'], language: 'en-US' });
    const i18n = createApplicationI18n({ locale: 'ja' });

    try {
      const wrapper = shallowMount(LanguageSelector, {
        props: { modelValue: 'ja' },
        global: {
          plugins: [i18n],
        },
      });

      expect(wrapper.findAll('option')).to.have.lengthOf(LANGUAGES.length);
      expect(wrapper.find('label').text()).to.equal('言語');
      expect(wrapper.find('option[value="ja"]').text()).to.equal('Japanese');
      expect(wrapper.find('option[value="en"]').text()).to.equal('English');

      i18n.global.locale.value = 'he';
      await wrapper.vm.$nextTick();

      expect(wrapper.find('label').text()).to.equal('שפה');
      expect(wrapper.find('option[value="ja"]').text()).to.equal('Japanese');
      expect(wrapper.find('option[value="en"]').text()).to.equal('English');
    } finally {
      restore();
    }
  });
});
