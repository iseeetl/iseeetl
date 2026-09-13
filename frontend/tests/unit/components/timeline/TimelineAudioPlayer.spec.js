import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import TimelineAudioPlayer from '@/components/timeline/TimelineAudioPlayer.vue';

const UiTooltipStub = {
  name: 'UiTooltip',
  props: ['text'],
  template: '<span><slot /></span>',
};

const createWrapper = (props = {}) =>
  shallowMount(TimelineAudioPlayer, {
    stubs: {
      UiButton: true,
      UiIcon: true,
      UiTooltip: UiTooltipStub,
    },
    props: {
      src: '/media/floor-1/room-1/audio.m4a',
      fileName: 'audio.m4a',
      audioTitle: '録音音声',
      description: '会議の録音です',
      preload: 'metadata',
      downloadTestId: 'timeline-audio-download-button',
      ...props,
    },
    mocks: {
      $t: (key) => key,
    },
  });

describe('タイムラインの音声プレイヤー', () => {
  it('音声プレイヤーの右隣にダウンロード操作を表示する', () => {
    const wrapper = createWrapper();
    const row = wrapper.get('.timeline-audio-player__row');
    const audio = row.get('audio');
    const downloadButton = row.get('[data-testid="timeline-audio-download-button"]');

    expect(row.element.firstElementChild).to.equal(audio.element);
    expect(audio.attributes('src')).to.equal('/media/floor-1/room-1/audio.m4a');
    expect(audio.attributes('aria-label')).to.equal('録音音声');
    expect(audio.attributes('preload')).to.equal('metadata');
    expect(downloadButton.classes()).to.include('timeline-audio-player__download');
    expect(downloadButton.attributes('aria-label')).to.equal('音声をダウンロード');
    expect(wrapper.get('figcaption').text()).to.equal('会議の録音です');
  });

  it('説明がない音声でもプレイヤーとダウンロード操作を表示する', () => {
    const wrapper = createWrapper({ description: '', audioTitle: '' });

    expect(wrapper.find('audio').exists()).to.equal(true);
    expect(wrapper.find('[data-testid="timeline-audio-download-button"]').exists()).to.equal(true);
    expect(wrapper.find('figcaption').exists()).to.equal(false);
  });

  it('ダウンロード操作で音声URLとファイル名をリンクへ設定する', async () => {
    const wrapper = createWrapper();
    const originalCreateElement = document.createElement;
    let downloadLink = null;
    let clicked = false;

    document.createElement = (tagName) => {
      const element = originalCreateElement.call(document, tagName);
      if (tagName === 'a') {
        downloadLink = element;
        element.click = () => {
          clicked = true;
        };
      }
      return element;
    };

    try {
      wrapper.vm.onPressDownloadButton();

      expect(downloadLink.getAttribute('href')).to.equal('/media/floor-1/room-1/audio.m4a');
      expect(downloadLink.download).to.equal('audio.m4a');
      expect(clicked).to.equal(true);
      expect(downloadLink.parentNode).to.equal(null);
    } finally {
      document.createElement = originalCreateElement;
    }
  });
});
