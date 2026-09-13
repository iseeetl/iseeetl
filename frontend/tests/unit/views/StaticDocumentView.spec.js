import { nextTick, reactive } from 'vue';
import { expect, vi } from 'vitest';

import { shallowMount } from '../helpers/testUtils';
import flushPromises from '../helpers/flushPromises';
import StaticDocumentView from '@/views/StaticDocumentView.vue';
import { loadStaticContent } from '@/features/static-content/loadStaticContent.js';

vi.mock('@/features/static-content/loadStaticContent.js', () => ({
  loadStaticContent: vi.fn(),
}));

const UiButtonStub = {
  name: 'UiButton',
  emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\')"><slot /></button>',
};

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

const createWrapper = ({
  attachTo = null,
  route = reactive({
    meta: {
      staticContentName: 'terms',
      title: '利用許諾・著作権・禁止事項・免責事項',
    },
  }),
  i18n = reactive({ locale: 'ja' }),
} = {}) => ({
  route,
  i18n,
  wrapper: shallowMount(StaticDocumentView, {
    ...(attachTo ? { attachTo } : {}),
    stubs: {
      BackButton: true,
      UiButton: UiButtonStub,
    },
    mocks: {
      $route: route,
      $i18n: i18n,
      $t: (key) => key,
    },
  }),
});

describe('静的文書の表示画面', () => {
  beforeEach(() => {
    loadStaticContent.mockReset();
  });

  it('共通見出しと初期loading状態を表示する', async () => {
    loadStaticContent.mockReturnValue(createDeferred().promise);

    const { wrapper } = createWrapper();
    await nextTick();

    expect(wrapper.findComponent({ name: 'BackButton' }).exists()).to.equal(true);
    expect(wrapper.get('h1.view-title').text()).to.equal('利用許諾・著作権・禁止事項・免責事項');
    const loadingStatus = wrapper.get('[role="status"]');
    expect(loadingStatus.text()).to.equal('読み込み中です');
    expect(loadingStatus.element.closest('[aria-busy]')).to.equal(null);
    expect(wrapper.get('.static-document-container').attributes('aria-busy')).to.equal('true');
  });

  it('危険な要素を除いた本文を、本文の言語を指定したarticle要素へ表示する', async () => {
    loadStaticContent.mockResolvedValue({
      contentHtml: '<h2>Document</h2><p>Body</p>',
      contentLang: 'he',
    });

    const { wrapper } = createWrapper();
    await flushPromises();

    const article = wrapper.get('article.static-document');
    expect(article.attributes('lang')).to.equal('he');
    expect(article.attributes('dir')).to.equal(undefined);
    expect(article.attributes('tabindex')).to.equal('-1');
    expect(article.attributes('aria-labelledby')).to.equal('static-document-title');
    expect(article.html()).to.include('<h2>Document</h2>');
    expect(wrapper.get('.static-document-container').attributes('aria-busy')).to.equal('false');
  });

  it('失敗時にalertと再試行を表示し、再試行後に本文を表示する', async () => {
    loadStaticContent
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce({ contentHtml: '<h2>Recovered</h2>', contentLang: 'ja' });

    const { wrapper } = createWrapper({ attachTo: document.body });
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).to.equal('内容を読み込めませんでした');
    const retry = wrapper.get('.static-document-error button');
    expect(retry.text()).to.equal('再試行');

    await retry.trigger('click');
    await flushPromises();

    expect(loadStaticContent).toHaveBeenCalledTimes(2);
    expect(loadStaticContent.mock.calls[1][0]).to.deep.equal({
      contentName: 'terms',
      forceReload: true,
      locale: 'ja',
    });
    expect(wrapper.get('article').text()).to.equal('Recovered');
    expect(document.activeElement).to.equal(wrapper.get('article').element);
    wrapper.unmount();
  });

  it('言語設定変更後の応答を表示し、遅れて完了した古い応答を無視する', async () => {
    const japaneseRequest = createDeferred();
    const englishRequest = createDeferred();
    loadStaticContent
      .mockReturnValueOnce(japaneseRequest.promise)
      .mockReturnValueOnce(englishRequest.promise);

    const { wrapper, i18n } = createWrapper();
    i18n.locale = 'en';
    await nextTick();

    englishRequest.resolve({ contentHtml: '<h2>English</h2>', contentLang: 'en' });
    await flushPromises();
    japaneseRequest.resolve({ contentHtml: '<h2>日本語</h2>', contentLang: 'ja' });
    await flushPromises();

    expect(loadStaticContent.mock.calls).to.deep.equal([
      [{ contentName: 'terms', forceReload: false, locale: 'ja' }],
      [{ contentName: 'terms', forceReload: false, locale: 'en' }],
    ]);
    expect(wrapper.get('article').attributes('lang')).to.equal('en');
    expect(wrapper.get('article').text()).to.equal('English');
  });

  it('同じ文書の言語設定変更中は現在の本文と言語を維持する', async () => {
    const englishRequest = createDeferred();
    loadStaticContent
      .mockResolvedValueOnce({ contentHtml: '<h2>日本語</h2>', contentLang: 'ja' })
      .mockReturnValueOnce(englishRequest.promise);
    const { wrapper, i18n } = createWrapper();
    await flushPromises();

    i18n.locale = 'en';
    await nextTick();

    expect(wrapper.get('article').attributes('lang')).to.equal('ja');
    expect(wrapper.get('article').text()).to.equal('日本語');
    expect(wrapper.get('.static-document-container').attributes('aria-busy')).to.equal('true');
    const loadingStatus = wrapper.get('[role="status"]');
    expect(loadingStatus.classes()).to.include('screen-reader-only');
    expect(loadingStatus.element.closest('[aria-busy]')).to.equal(null);

    englishRequest.resolve({ contentHtml: '<h2>English</h2>', contentLang: 'en' });
    await flushPromises();

    expect(wrapper.get('article').attributes('lang')).to.equal('en');
    expect(wrapper.get('article').text()).to.equal('English');
    expect(wrapper.get('.static-document-container').attributes('aria-busy')).to.equal('false');
  });

  it('文書ルート変更時は新しい見出しと古い本文を混在させない', async () => {
    const privacyRequest = createDeferred();
    loadStaticContent
      .mockResolvedValueOnce({ contentHtml: '<h2>Terms</h2>', contentLang: 'ja' })
      .mockReturnValueOnce(privacyRequest.promise);
    const { wrapper, route } = createWrapper();
    await flushPromises();

    route.meta = {
      staticContentName: 'privacy',
      title: 'プライバシーポリシー',
    };
    await nextTick();

    expect(wrapper.get('h1.view-title').text()).to.equal('プライバシーポリシー');
    expect(wrapper.find('article').exists()).to.equal(false);
    expect(wrapper.get('[role="status"]').text()).to.equal('読み込み中です');

    privacyRequest.resolve({ contentHtml: '<h2>Privacy</h2>', contentLang: 'ja' });
    await flushPromises();
    expect(wrapper.get('article').text()).to.equal('Privacy');
  });
});
