import { expect } from 'vitest';
import { reactive } from 'vue';
import fs from 'node:fs';
import path from 'node:path';
import { shallowMount } from '../../helpers/testUtils';
import HelpContent from '@/components/help/HelpContent.vue';
import { LANGUAGES } from '@/constants/languages.js';

import flushPromises from '../../helpers/flushPromises';

const CAPABILITY_HTML =
  '<p class="help-capability--mail-delivery">mail registration</p>' +
  '<p><span class="help-capability--oauth-any">Use ' +
  '<span class="help-capability--google-login">Google</span>' +
  '<span class="help-capability--oauth-both"> or </span>' +
  '<span class="help-capability--line-login">LINE</span> login.</span> Core login.</p>' +
  '<p class="help-capability--google-translate">translation</p>' +
  '<p class="help-capability--openai-analysis">analysis</p>';

const createCapabilityStore = (getters = {}) => ({
  getters: {
    mailDeliveryAvailable: true,
    googleLoginAvailable: true,
    lineLoginAvailable: true,
    googleTranslateAvailable: true,
    openaiAnalysisAvailable: true,
    ...getters,
  },
});

const createWrapper = (overrides = {}) =>
  shallowMount(HelpContent, {
    props: overrides.props || {},
    mocks: {
      $i18n: { locale: 'ja' },
      $t: (key) => key,
      $store: overrides.store || createCapabilityStore(),
      ...(overrides.mocks || {}),
    },
  });

describe('ヘルプ内容の表示', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('ロケールからヘルプHTMLを取得して表示する', async () => {
    global.fetch = () => Promise.resolve({ ok: true, text: () => Promise.resolve('<h2>help</h2>') });

    const wrapper = createWrapper();
    await flushPromises();

    expect(wrapper.vm.contentFileName).to.equal('/content/ja/help.html');
    expect(wrapper.vm.contentHtml).to.equal('<h2>help</h2>');
  });

  it('対応する16言語ごとのヘルプHTMLを取得する', async () => {
    const supportedLocales = [
      'de',
      'en',
      'es',
      'fr',
      'he',
      'hi',
      'it',
      'ja',
      'ko',
      'pt',
      'ru',
      'sv',
      'tr',
      'uk',
      'vi',
      'zh',
    ];
    global.fetch = () => Promise.resolve({ ok: true, text: () => Promise.resolve('<p>help</p>') });

    for (const locale of supportedLocales) {
      const wrapper = createWrapper({ mocks: { $i18n: { locale }, $t: (key) => key } });
      await flushPromises();

      expect(wrapper.vm.contentFileName).to.equal(`/content/${locale}/help.html`);
      wrapper.unmount();
    }
  });

  it('アコーディオン要素を保持して危険なタグと属性を除去する', async () => {
    global.fetch = () =>
      Promise.resolve({
        ok: true,
        text: () =>
          Promise.resolve(
            '<details open><summary onclick="alert(1)">help</summary><p>body</p></details>' +
              '<script>alert(1)</script><img src="/content/ja/help-assets/a.jpg" alt="a" />'
          ),
      });

    const wrapper = createWrapper();
    await flushPromises();

    expect(wrapper.vm.contentHtml).to.include('<details><summary>help</summary><p>body</p></details>');
    expect(wrapper.vm.contentHtml).to.not.include(' open');
    expect(wrapper.vm.contentHtml).to.not.include('onclick');
    expect(wrapper.vm.contentHtml).to.not.include('<script>');
    expect(wrapper.vm.contentHtml).to.not.include('<img');
  });

  it('静的コンテンツに必要なタグ・属性とhttpsリンクを保持する', async () => {
    global.fetch = () =>
      Promise.resolve({
        ok: true,
        text: () =>
          Promise.resolve(
            '<section class="help-section" id="topic" aria-label="topic label">' +
              '<h1>title</h1><h2>heading</h2><table><thead><tr><th scope="col">head</th></tr></thead></table>' +
              '<a href="https://example.com/help" target="_blank" rel="noopener noreferrer">help</a>' +
              '<a href="mailto:help@example.com">mail</a><a href="tel:+81000000000">tel</a>' +
              '</section>'
          ),
      });

    const wrapper = createWrapper();
    await flushPromises();

    expect(wrapper.vm.contentHtml).to.include('class="help-section"');
    expect(wrapper.vm.contentHtml).to.include('id="topic"');
    expect(wrapper.vm.contentHtml).to.include('aria-label="topic label"');
    expect(wrapper.vm.contentHtml).to.include('<h1>title</h1>');
    expect(wrapper.vm.contentHtml).to.include('<th scope="col">head</th>');
    expect(wrapper.vm.contentHtml).to.include('href="https://example.com/help"');
    expect(wrapper.vm.contentHtml).to.include('target="_blank"');
    expect(wrapper.vm.contentHtml).to.include('rel="noopener noreferrer"');
    expect(wrapper.vm.contentHtml).to.include('href="mailto:help@example.com"');
    expect(wrapper.vm.contentHtml).to.include('href="tel:+81000000000"');
  });

  it('script/style/iframe、イベント属性、危険なURLを除去する', async () => {
    global.fetch = () =>
      Promise.resolve({
        ok: true,
        text: () =>
          Promise.resolve(
            '<script>alert(1)</script><style>body{display:none}</style><iframe src="https://example.com"></iframe>' +
              '<p onclick="alert(1)" onerror="alert(2)">safe</p>' +
              '<p href="https://example.com" aria-hidden="true">attributes</p>' +
              '<a href="javascript:alert(3)" onclick="alert(4)">danger</a>' +
              '<a href="data:text/html,test">data</a><a href="//example.com">protocol relative</a>'
          ),
      });

    const wrapper = createWrapper();
    await flushPromises();

    expect(wrapper.vm.contentHtml).to.not.include('<script');
    expect(wrapper.vm.contentHtml).to.not.include('<style');
    expect(wrapper.vm.contentHtml).to.not.include('<iframe');
    expect(wrapper.vm.contentHtml).to.not.include('onclick');
    expect(wrapper.vm.contentHtml).to.not.include('onerror');
    expect(wrapper.vm.contentHtml).to.not.include('javascript:');
    expect(wrapper.vm.contentHtml).to.not.include('data:text/html');
    expect(wrapper.vm.contentHtml).to.not.include('href="//example.com"');
    expect(wrapper.vm.contentHtml).to.not.include('aria-hidden');
    expect(wrapper.vm.contentHtml).to.include('<p>safe</p>');
  });

  it('操作説明のアコーディオンを初期状態では閉じて表示する', async () => {
    const topics = Array.from(
      { length: 10 },
      (_, index) =>
        `<details class="help-topic"><summary>${
          index + 1
        }. topic</summary><div class="help-topic-content">body</div></details>`
    ).join('');
    global.fetch = () => Promise.resolve({ ok: true, text: () => Promise.resolve(topics) });

    const wrapper = createWrapper();
    await flushPromises();

    const details = wrapper.findAll('details');
    expect(details).to.have.lengthOf(10);
    expect(wrapper.findAll('summary')).to.have.lengthOf(10);
    details.forEach((detail) => {
      expect(detail.element.open).to.equal(false);
    });
  });

  it('無効な外部機能の説明だけをヘルプから除く', async () => {
    global.fetch = () => Promise.resolve({ ok: true, text: () => Promise.resolve(CAPABILITY_HTML) });

    const wrapper = createWrapper({
      store: createCapabilityStore({
        mailDeliveryAvailable: false,
        googleLoginAvailable: false,
        lineLoginAvailable: false,
        googleTranslateAvailable: false,
        openaiAnalysisAvailable: false,
      }),
    });
    await flushPromises();

    const text = wrapper.get('[data-testid="help-content-body"]').text();
    expect(text).to.equal('Core login.');
  });

  it.each([
    { google: true, line: false, shown: 'Google', hidden: 'LINE' },
    { google: false, line: true, shown: 'LINE', hidden: 'Google' },
  ])('片方だけ有効なOAuthでは $shown の説明だけを表示する', async ({ google, line, shown, hidden }) => {
    global.fetch = () => Promise.resolve({ ok: true, text: () => Promise.resolve(CAPABILITY_HTML) });

    const wrapper = createWrapper({
      store: createCapabilityStore({ googleLoginAvailable: google, lineLoginAvailable: line }),
    });
    await flushPromises();

    const text = wrapper.get('[data-testid="help-content-body"]').text();
    expect(text).to.include(shown);
    expect(text).to.not.include(hidden);
    expect(text).to.not.include(' or ');
  });

  it('全言語のヘルプに機能の有効状態を識別するマーカーがある', () => {
    const markerCounts = {
      'help-capability--mail-delivery': 5,
      'help-capability--oauth-any': 1,
      'help-capability--oauth-both': 1,
      'help-capability--google-login': 1,
      'help-capability--line-login': 1,
      'help-capability--google-translate': 1,
      'help-capability--openai-analysis': 1,
    };

    LANGUAGES.forEach(({ value: locale }) => {
      const contentPath = path.resolve(process.cwd(), 'public/content', locale, 'help.html');
      const content = fs.readFileSync(contentPath, 'utf8');
      const container = document.createElement('div');
      container.innerHTML = content;
      const topics = container.querySelectorAll('details.help-topic');

      expect(topics, `${locale}: ヘルプの項目`).to.have.lengthOf(10);
      Object.entries(markerCounts).forEach(([marker, count]) => {
        expect(container.querySelectorAll(`.${marker}`), `${locale}: ${marker}`).to.have.lengthOf(count);
      });
      expect(topics[8].classList.contains('help-capability--google-translate'), `${locale}: 翻訳の項目`).to.equal(
        true
      );
      expect(topics[9].classList.contains('help-capability--openai-analysis'), `${locale}: AI解析の項目`).to.equal(
        true
      );
      const analysisTopic = topics[9];
      expect(analysisTopic.querySelector('summary').textContent.trim(), `${locale}: AI解析の項目番号`).to.match(
        /^10\./
      );
      expect(
        analysisTopic.querySelectorAll('.help-topic-content > ul > li'),
        `${locale}: 5種類のAI解析`
      ).to.have.lengthOf(5);
      expect(
        analysisTopic.querySelectorAll('.help-topic-content > ol > li'),
        `${locale}: AI解析の手順`
      ).to.have.lengthOf(3);
    });
  });

  it('対象ロケールが取得できない場合は日本語へフォールバックする', async () => {
    const calls = [];
    global.fetch = (url) => {
      calls.push(url);
      if (url === '/content/en/help.html') {
        return Promise.resolve({ ok: false, text: () => Promise.resolve('') });
      }
      return Promise.resolve({ ok: true, text: () => Promise.resolve('<p>ja</p>') });
    };

    const wrapper = createWrapper({ mocks: { $i18n: { locale: 'en' }, $t: (key) => key } });
    await flushPromises();

    expect(calls).to.deep.equal(['/content/en/help.html', '/content/ja/help.html']);
    expect(wrapper.vm.contentHtml).to.equal('<p>ja</p>');
    expect(wrapper.get('[data-testid="help-content-body"]').attributes('lang')).to.equal('ja');
    expect(wrapper.get('[data-testid="help-content-body"]').attributes('dir')).to.equal(undefined);
  });

  it('ヘブライ語の内容に言語属性を付け、画面全体の方向は変えない', async () => {
    global.fetch = () => Promise.resolve({ ok: true, text: () => Promise.resolve('<p dir="auto">שלום</p>') });

    const wrapper = createWrapper({ mocks: { $i18n: { locale: 'he' }, $t: (key) => key } });
    await flushPromises();

    expect(wrapper.get('[data-testid="help-content-body"]').attributes('lang')).to.equal('he');
    expect(wrapper.get('[data-testid="help-content-body"]').attributes('dir')).to.equal(undefined);
    expect(wrapper.vm.contentHtml).to.include('dir="auto"');
  });

  it('静的内容のlang・dirは妥当な値だけを保持する', async () => {
    global.fetch = () =>
      Promise.resolve({
        ok: true,
        text: () =>
          Promise.resolve(
            '<p lang="he" dir="rtl">valid</p><p lang="bad value" dir="sideways">invalid</p>'
          ),
      });

    const wrapper = createWrapper();
    await flushPromises();

    expect(wrapper.vm.contentHtml).to.include('<p lang="he" dir="rtl">valid</p>');
    expect(wrapper.vm.contentHtml).to.include('<p>invalid</p>');
  });

  it('古い言語設定の遅い応答で新しい内容を上書きしない', async () => {
    let resolveEnglish;
    global.fetch = (url) => {
      if (url === '/content/en/help.html') {
        return new Promise((resolve) => {
          resolveEnglish = resolve;
        });
      }
      return Promise.resolve({ ok: true, text: () => Promise.resolve('<p>fr</p>') });
    };
    const i18n = reactive({ locale: 'en' });
    const wrapper = createWrapper({ mocks: { $i18n: i18n, $t: (key) => key } });

    i18n.locale = 'fr';
    await wrapper.vm.$nextTick();
    await flushPromises();
    expect(wrapper.vm.contentHtml).to.equal('<p>fr</p>');
    resolveEnglish({ ok: true, text: () => Promise.resolve('<p>en</p>') });
    await flushPromises();

    expect(wrapper.vm.contentHtml).to.equal('<p>fr</p>');
    expect(wrapper.vm.contentLang).to.equal('fr');
  });

  it('取得に失敗した場合はエラー表示に切り替える', async () => {
    global.fetch = () => Promise.reject(new Error('network'));

    const wrapper = createWrapper();
    await flushPromises();

    expect(wrapper.vm.contentLoadFailed).to.equal(true);
    expect(wrapper.find('[data-testid="help-content-error"]').exists()).to.equal(true);
  });
});
