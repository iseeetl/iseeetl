import { expect } from 'vitest';
import { shallowMount } from '../helpers/testUtils';
import Tutorial from '@/views/Tutorial.vue';

const createWrapper = (overrides = {}) =>
  shallowMount(Tutorial, {
    stubs: {
      BackButton: true,
    },
    mocks: {
      $store: { getters: { googleTranslateAvailable: true, openaiAnalysisAvailable: true } },
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });

describe('チュートリアル画面', () => {
  it('画面見出しに共通view-titleを使用する', () => {
    const wrapper = createWrapper();

    expect(wrapper.find('h1.view-title').exists()).to.equal(true);
  });

  it('ローカル/埋め込みURLを組み立てる', () => {
    const wrapper = createWrapper();
    expect(wrapper.vm.localSrc('1.mp4')).to.equal('/assets/video/1.mp4');
    expect(wrapper.vm.embedUrl('abc')).to.equal('https://www.youtube.com/embed/abc?rel=0');
    expect(wrapper.vm.embedUrl(null)).to.equal('');
  });

  it('字幕用のヘルプ案内を表示せず、動画の操作に名前を付ける', () => {
    const wrapper = createWrapper();

    expect(wrapper.find('.tutorial-alternative').exists()).to.equal(false);
    expect(wrapper.find('a').exists()).to.equal(false);
    expect(wrapper.find('video').attributes('aria-label')).to.equal('ユーザ登録、ログイン');
  });

  it('解析種別を限定しないAI解析タイトルを表示する', () => {
    const wrapper = createWrapper();
    const analysisTutorial = wrapper.vm.tutorials.find((item) => item.localFile === '10.mp4');

    expect(analysisTutorial.title).to.equal('AI解析機能');
    expect(wrapper.text()).to.include('AI解析機能');
    expect(wrapper.text()).not.to.include('AI による画像、動画、音声解析機能');
  });

  it('無効な翻訳・AI解析の説明動画だけを隠す', () => {
    const wrapper = createWrapper({
      mocks: { $store: { getters: { googleTranslateAvailable: false, openaiAnalysisAvailable: false } } },
    });

    expect(wrapper.vm.tutorials.map((item) => item.localFile)).to.not.include.members(['9.mp4', '10.mp4']);
    expect(wrapper.vm.tutorials).to.have.lengthOf(8);
  });
});
