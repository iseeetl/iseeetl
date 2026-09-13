import { expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { shallowMount } from '../../../helpers/testUtils';
import GalleryDialog from '@/components/timeline/dialogs/GalleryDialog.vue';

const baseStubs = {
  UiDialog: { template: '<div><slot/></div>' },
  UiButton: true,
  UiIcon: true,
  UiTooltip: {
    template: '<span><slot/></span>',
    methods: {
      focusTrigger() {},
    },
  },
};

const overrideNavigatorProperty = (name, value) => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(window.navigator, name);
  Object.defineProperty(window.navigator, name, { configurable: true, value });

  return () => {
    if (originalDescriptor) {
      Object.defineProperty(window.navigator, name, originalDescriptor);
    } else {
      delete window.navigator[name];
    }
  };
};

describe('メディアのギャラリー', () => {
  const createWrapper = (propsValue = {}) =>
    shallowMount(GalleryDialog, {
      stubs: baseStubs,
      props: { dialogVisible: true, propsValue },
      mocks: {
        $store: {
          getters: { floorId: 'floor-1', roomId: 'room-1' },
          dispatch: () => {},
        },
        $t: (key) => key,
      },
    });

  it('ダイアログを開くとメディア情報を反映しinertを設定する', async () => {
    const wrapper = shallowMount(GalleryDialog, {
      stubs: baseStubs,
      props: {
        dialogVisible: true,
        propsValue: {
          image_name: 'image.png',
          image_caption: 'caption',
          video_name: 'video.mp4',
          video_subtitle_name: 'video.vtt',
          lang: 'ja',
        },
      },
      mocks: {
        $store: {
          getters: { floorId: 'floor-1', roomId: 'room-1' },
          dispatch: () => {},
        },
        $t: (key) => key,
      },
    });

    wrapper.vm.openedDialog();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.imageName).to.equal('image.png');
    expect(wrapper.vm.imageCaption).to.equal('caption');
    expect(wrapper.vm.videoName).to.equal('video.mp4');
    expect(wrapper.vm.videoSubtitleName).to.equal('video.vtt');
    expect(wrapper.vm.videoSubTitleLang).to.equal('ja');
  });

  it('キャンセル操作でダイアログが閉じる', async () => {
    const wrapper = createWrapper();

    wrapper.setData({ visible: true });
    wrapper.vm.onPressCancelButton();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.visible).to.equal(false);
  });

  it('ダイアログを閉じると値をクリアしてcloseを通知する', () => {
    const wrapper = createWrapper();

    wrapper.setData({
      imageName: 'image.png',
      imageCaption: 'caption',
      videoName: 'video.mp4',
      videoSubtitleName: 'subtitle.vtt',
      videoSubTitleLang: 'ja',
    });

    wrapper.vm.closedDialog();

    expect(wrapper.vm.imageName).to.equal(null);
    expect(wrapper.vm.imageCaption).to.equal(null);
    expect(wrapper.vm.videoName).to.equal(null);
    expect(wrapper.vm.videoSubtitleName).to.equal(null);
    expect(wrapper.vm.videoSubTitleLang).to.equal(null);
    expect(wrapper.emitted().close).to.have.lengthOf(1);
  });

  it('UiDialogをbodyへ移してもギャラリー用のスタイルが内部要素へ適用される', async () => {
    const wrapper = mount(GalleryDialog, {
      attachTo: document.body,
      props: { dialogVisible: true, propsValue: {} },
      global: {
        stubs: {
          UiButton: true,
          UiIcon: true,
          UiTooltip: baseStubs.UiTooltip,
        },
        mocks: {
          $store: {
            getters: { floorId: 'floor-1', roomId: 'room-1' },
            dispatch: () => {},
          },
          $t: (key) => key,
        },
      },
    });

    try {
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      const dialogRoot = document.querySelector('[data-testid="dialog-gallery"]');
      const galleryScopeId = GalleryDialog.__scopeId;
      const galleryContent = dialogRoot.querySelector('.gallery-content');

      expect(dialogRoot.parentElement).to.equal(document.body);
      expect(document.querySelector('.gallery-dialog .ui-dialog__backdrop')).to.not.equal(null);
      expect(document.querySelector('.gallery-dialog .ui-dialog__panel')).to.not.equal(null);
      expect(document.querySelector('.gallery-dialog .ui-dialog__content')).to.not.equal(null);
      expect(dialogRoot.hasAttribute(galleryScopeId)).to.equal(false);
      expect(galleryContent.hasAttribute(galleryScopeId)).to.equal(true);
    } finally {
      wrapper.unmount();
    }
  });

  it('画像と左右に分離した操作ボタンをタイトルなしのプレビュー内へ表示する', async () => {
    const wrapper = createWrapper();

    await wrapper.setData({ imageName: 'image.png' });

    const accessibleTitle = wrapper.find('#gallery_dialog_title');
    expect(accessibleTitle.exists()).to.equal(true);
    expect(accessibleTitle.classes()).to.include('voiceover-hidden');

    const image = wrapper.find('[data-testid="dialog-gallery-image"]');
    expect(image.exists()).to.equal(true);
    expect(image.classes()).to.include('gallery-image');
    expect(image.attributes('src')).to.equal('/media/floor-1/room-1/image.png');

    const galleryContent = wrapper.find('.gallery-content');
    const downloadButton = wrapper.find('[data-testid="dialog-gallery-download-button"]');
    expect(downloadButton.exists()).to.equal(true);
    expect(downloadButton.classes()).to.include('gallery-download');
    expect(downloadButton.attributes('aria-label')).to.equal('画像をダウンロード');
    expect(downloadButton.find('span').exists()).to.equal(false);
    expect(galleryContent.find('[data-testid="dialog-gallery-download-button"]').exists()).to.equal(true);

    const closeButton = galleryContent.find('[data-testid="dialog-gallery-close"]');
    expect(closeButton.exists()).to.equal(true);
    expect(closeButton.classes()).to.include('gallery-close');
    expect(closeButton.attributes('aria-label')).to.equal('閉じる');
  });

  it('動画を画面内表示用の枠へ置き、左上にダウンロード操作を表示する', async () => {
    const wrapper = createWrapper();

    await wrapper.setData({ videoName: 'video.mp4' });

    const videoFrame = wrapper.find('.gallery-video');
    expect(videoFrame.exists()).to.equal(true);
    expect(videoFrame.find('video').attributes()).to.include({ controls: '', playsinline: '' });
    expect(videoFrame.find('video').attributes('src')).to.equal('/media/floor-1/room-1/video.mp4');

    const galleryContent = wrapper.find('.gallery-content');
    const downloadButton = galleryContent.find('[data-testid="dialog-gallery-download-button"]');
    expect(downloadButton.exists()).to.equal(true);
    expect(downloadButton.classes()).to.include('gallery-download');
    expect(downloadButton.attributes('aria-label')).to.equal('動画をダウンロード');
  });

  it('ダウンロード操作で表示中の画像URLとファイル名をリンクへ設定する', async () => {
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
      await wrapper.setData({ imageName: 'image.png' });
      await wrapper.vm.onPressDownloadButton();

      expect(downloadLink.getAttribute('href')).to.equal('/media/floor-1/room-1/image.png');
      expect(downloadLink.download).to.equal('image.png');
      expect(clicked).to.equal(true);
      expect(downloadLink.parentNode).to.equal(null);
    } finally {
      document.createElement = originalCreateElement;
    }
  });

  it('ダウンロード操作で表示中の動画URLとファイル名をリンクへ設定する', async () => {
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
      await wrapper.setData({ videoName: 'video.mp4' });
      await wrapper.vm.onPressDownloadButton();

      expect(downloadLink.getAttribute('href')).to.equal('/media/floor-1/room-1/video.mp4');
      expect(downloadLink.download).to.equal('video.mp4');
      expect(clicked).to.equal(true);
      expect(downloadLink.parentNode).to.equal(null);
    } finally {
      document.createElement = originalCreateElement;
    }
  });

  it('iOSホーム画面アプリでも動画を事前取得せずダウンロードリンクへ渡す', async () => {
    const wrapper = createWrapper();
    const originalCreateElement = document.createElement;
    const originalFetch = window.fetch;
    const restoreStandalone = overrideNavigatorProperty('standalone', true);
    let downloadLink = null;
    let fetchCalled = false;

    window.fetch = async () => {
      fetchCalled = true;
      throw new Error('動画をfetchしてはならない');
    };
    document.createElement = (tagName) => {
      const element = originalCreateElement.call(document, tagName);
      if (tagName === 'a') {
        downloadLink = element;
        element.click = () => {};
      }
      return element;
    };

    try {
      await wrapper.setData({ videoName: 'video.mp4' });
      await wrapper.vm.prepareNativeImageShare();
      await wrapper.vm.onPressDownloadButton();

      expect(fetchCalled).to.equal(false);
      expect(downloadLink.getAttribute('href')).to.equal('/media/floor-1/room-1/video.mp4');
      expect(downloadLink.download).to.equal('video.mp4');
    } finally {
      document.createElement = originalCreateElement;
      if (typeof originalFetch === 'undefined') delete window.fetch;
      else window.fetch = originalFetch;
      restoreStandalone();
    }
  });

  it('iOSホーム画面アプリでは画像Fileを事前準備してWeb Shareへ渡す', async () => {
    const originalFetch = window.fetch;
    const restoreStandalone = overrideNavigatorProperty('standalone', true);
    let canShareFile = null;
    let shareData = null;
    const restoreCanShare = overrideNavigatorProperty('canShare', ({ files }) => {
      canShareFile = files[0];
      return true;
    });
    const restoreShare = overrideNavigatorProperty('share', async (data) => {
      shareData = data;
    });
    let fetchArgs = null;
    window.fetch = async (...args) => {
      fetchArgs = args;
      return {
        ok: true,
        blob: async () => new window.Blob(['image-data'], { type: 'image/jpeg' }),
      };
    };

    try {
      const wrapper = createWrapper();
      await wrapper.setData({ imageName: 'image.jpg' });

      await wrapper.vm.prepareNativeImageShare();
      await wrapper.vm.onPressDownloadButton();

      expect(fetchArgs).to.deep.equal(['/media/floor-1/room-1/image.jpg', { credentials: 'same-origin' }]);
      expect(canShareFile).to.equal(wrapper.vm.shareFile);
      expect(shareData.title).to.equal('image.jpg');
      expect(shareData.files).to.deep.equal([wrapper.vm.shareFile]);
      expect(wrapper.vm.shareFile.name).to.equal('image.jpg');
      expect(wrapper.vm.shareFile.type).to.equal('image/jpeg');
      expect(wrapper.vm.downloadError).to.equal(false);
    } finally {
      if (typeof originalFetch === 'undefined') delete window.fetch;
      else window.fetch = originalFetch;
      restoreShare();
      restoreCanShare();
      restoreStandalone();
    }
  });

  it('iOSホーム画面アプリで共有をキャンセルしてもエラー表示しない', async () => {
    const restoreStandalone = overrideNavigatorProperty('standalone', true);
    const restoreShare = overrideNavigatorProperty('share', async () => {
      const error = new Error('cancelled');
      error.name = 'AbortError';
      throw error;
    });

    try {
      const wrapper = createWrapper();
      const file = new window.File(['image-data'], 'image.jpg', { type: 'image/jpeg' });
      await wrapper.setData({ imageName: 'image.jpg', shareFile: file, downloadError: true });

      await wrapper.vm.onPressDownloadButton();

      expect(wrapper.vm.downloadError).to.equal(false);
    } finally {
      restoreShare();
      restoreStandalone();
    }
  });

  it('iOSホーム画面アプリでFile共有できない場合はダウンロードリンクへ遷移しない', async () => {
    const originalFetch = window.fetch;
    const originalCreateElement = document.createElement;
    const restoreStandalone = overrideNavigatorProperty('standalone', true);
    const restoreCanShare = overrideNavigatorProperty('canShare', () => false);
    let shareCalled = false;
    const restoreShare = overrideNavigatorProperty('share', async () => {
      shareCalled = true;
    });
    let anchorCreated = false;
    window.fetch = async () => ({
      ok: true,
      blob: async () => new window.Blob(['image-data'], { type: 'image/jpeg' }),
    });
    document.createElement = (tagName) => {
      if (tagName === 'a') anchorCreated = true;
      return originalCreateElement.call(document, tagName);
    };

    try {
      const wrapper = createWrapper();
      await wrapper.setData({ imageName: 'image.jpg' });

      await wrapper.vm.prepareNativeImageShare();
      await wrapper.vm.onPressDownloadButton();
      await wrapper.vm.$nextTick();

      expect(wrapper.vm.shareFile).to.equal(null);
      expect(wrapper.vm.downloadError).to.equal(true);
      expect(wrapper.find('[role="alert"]').text()).to.equal('エラーが発生しました');
      expect(shareCalled).to.equal(false);
      expect(anchorCreated).to.equal(false);
    } finally {
      document.createElement = originalCreateElement;
      if (typeof originalFetch === 'undefined') delete window.fetch;
      else window.fetch = originalFetch;
      restoreShare();
      restoreCanShare();
      restoreStandalone();
    }
  });
});
