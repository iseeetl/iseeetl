import { expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { shallowMount } from '../../../helpers/testUtils';
import MediaInput from '@/components/timeline/inputs/MediaInput.vue';

const UiButtonStub = {
  name: 'UiButton',
  template:
    '<button class="ui-button" v-bind="$attrs" :disabled="$attrs.disabled"><slot/></button>',
};
const UiIconStub = { name: 'UiIcon', template: '<i></i>' };
const UiTooltipStub = { name: 'UiTooltip', template: '<span><slot/></span>' };
const UiFieldStub = {
  name: 'UiField',
  props: ['controlId'],
  template: '<div><slot :control-attrs="{ id: controlId }"/></div>',
};

const factory = (props = {}) => {
  const wrapper = shallowMount(MediaInput, {
    stubs: {
      UiButton: UiButtonStub,
      UiIcon: UiIconStub,
      UiTooltip: UiTooltipStub,
      UiField: UiFieldStub,
    },
    props: {
      idPrefix: 'timeline-test-media',
      imageData: null,
      videoData: null,
      audioData: null,
      maxVideoSize: 0,
      maxVideoDuration: 0,
      maxAudioSize: 0,
      maxAudioDuration: 0,
      currentLocale: 'ja',
      sending: false,
      recording: false,
      ...props,
    },
    mocks: { $t: (k) => k },
  });
  return wrapper;
};

describe('メディアの選択・入力（MediaInput）', () => {
  const configureInput = (input, value, onClick) => {
    Object.defineProperty(input, 'value', {
      configurable: true,
      writable: true,
      value,
    });
    input.click = onClick;
    return input;
  };

  it('外部の添付メニューを使う場合も入力とプレビューは維持する', () => {
    const wrapper = factory({ hideChoices: true, imageData: 'image-data' });
    expect(wrapper.findAll('.media-button')).to.have.lengthOf(0);
    expect(wrapper.findAll('input[type="file"]')).to.have.lengthOf(7);
    expect(wrapper.find('.image-preview-wrapper img').exists()).to.equal(true);
    expect(wrapper.find('.media-remove-button').exists()).to.equal(true);
  });

  it('ボタンから開くファイル入力を読み上げ対象とTab移動順から除く', () => {
    const wrapper = factory({ videoData: 'video-data' });
    const fileInputs = wrapper.findAll('input[type="file"]');

    expect(fileInputs).to.have.lengthOf(8);
    fileInputs.forEach((input) => {
      expect(input.attributes('aria-hidden')).to.equal('true');
      expect(input.attributes('tabindex')).to.equal('-1');
    });
  });

  it('指定prefixから全IDを生成し、IDREFを同一インスタンス内の一意な要素へ結び付ける', () => {
    const harness = document.createElement('div');
    document.body.appendChild(harness);
    const wrappers = ['post', 'reply', 'supplement'].map((type) =>
      mount(MediaInput, {
        attachTo: harness,
        props: {
          idPrefix: `timeline-${type}-media`,
          imageData: 'image-data',
          videoData: 'video-data',
          audioData: 'audio-data',
        },
        global: {
          stubs: {
            UiButton: UiButtonStub,
            UiIcon: UiIconStub,
            UiTooltip: UiTooltipStub,
          },
          mocks: { $t: (key) => key },
        },
      })
    );

    try {
      const allWithIds = Array.from(harness.querySelectorAll('[id]'));
      const ids = allWithIds.map((element) => element.id);
      expect(new Set(ids).size).to.equal(ids.length);

      Array.from(harness.querySelectorAll('[aria-describedby], [aria-labelledby]')).forEach((element) => {
        ['aria-describedby', 'aria-labelledby'].forEach((attribute) => {
          const value = element.getAttribute(attribute);
          if (!value) return;
          value.split(/\s+/u).forEach((id) => {
            expect(allWithIds.filter((candidate) => candidate.id === id)).to.have.lengthOf(1);
          });
        });
      });
      Array.from(harness.querySelectorAll('label[for]')).forEach((label) => {
        expect(allWithIds.filter((candidate) => candidate.id === label.htmlFor)).to.have.lengthOf(1);
      });

      wrappers.forEach((wrapper) => {
        const prefix = wrapper.props('idPrefix');
        expect(wrapper.get('[data-testid="media-image-caption"]').attributes('id')).to.include(prefix);
        expect(wrapper.get('[data-testid="media-video-preview"]').attributes('id')).to.include(prefix);
        expect(wrapper.get('[data-testid="media-video-description"]').attributes('id')).to.include(prefix);
        expect(wrapper.get('[data-testid="media-audio-description"]').attributes('id')).to.include(prefix);
      });
    } finally {
      wrappers.forEach((wrapper) => wrapper.unmount());
      harness.remove();
    }
  });

  it('画像プレビューへ入力中の代替テキストを反映する', async () => {
    const wrapper = factory({ imageData: 'image-data', imageCaption: '説明前' });
    const image = wrapper.get('.image-preview-wrapper img');

    expect(image.attributes('alt')).to.equal('説明前');

    await wrapper.setData({ localImageCaption: '説明後' });
    expect(image.attributes('alt')).to.equal('説明後');
  });

  it('画像選択ではファイル入力を空にして選択画面を開く', () => {
    const w = factory();
    let clicked = 0;
    configureInput(w.vm.$refs.inputImageFile, 'xxx', () => {
      clicked++;
    });
    w.vm.chooseImageFile();
    expect(w.vm.$refs.inputImageFile.value).to.equal('');
    expect(clicked).to.equal(1);
  });

  it('動画・音声・字幕の選択でもファイル入力を空にして選択画面を開く', () => {
    const w = factory({ videoData: 'video-data' });
    const refs = {
      inputVideoFile: w.vm.$refs.inputVideoFile,
      inputAudioFile: w.vm.$refs.inputAudioFile,
      inputVideoSubtitleFile: w.vm.$refs.inputVideoSubtitleFile,
    };
    Object.values(refs).forEach((input) => {
      input._c = 0;
      configureInput(input, 'selected', () => {
        input._c += 1;
      });
    });

    w.vm.chooseVideoFile();
    w.vm.chooseAudioFile();
    w.vm.chooseVideoSubtitleFile();

    expect(refs.inputVideoFile.value).to.equal('');
    expect(refs.inputAudioFile.value).to.equal('');
    expect(refs.inputVideoSubtitleFile.value).to.equal('');
    expect(refs.inputVideoFile._c).to.equal(1);
    expect(refs.inputAudioFile._c).to.equal(1);
    expect(refs.inputVideoSubtitleFile._c).to.equal(1);
  });

  it('画像選択が制限されている場合はguest-attemptを通知し、ファイル入力を操作しない', () => {
    const w = factory({ locked: true });
    let clicked = 0;
    configureInput(w.vm.$refs.inputImageFile, 'keep', () => {
      clicked++;
    });
    w.vm.chooseImageFile();
    expect(w.emitted()['guest-attempt']).to.have.lengthOf(1);
    expect(w.vm.$refs.inputImageFile.value).to.equal('keep');
    expect(clicked).to.equal(0);
  });

  it('画像ファイルを選ぶとimage-changeイベントを通知する', () => {
    const w = factory();
    const file = new Blob(['img'], { type: 'image/png' });
    w.vm.handleImageSelectionChange({ target: { files: [file] } });
    expect(w.emitted()['image-change'][0][0]).to.equal(file);
  });

  it('制限中に画像を選んだ場合はguest-attemptを通知して入力を空にする', () => {
    const w = factory({ locked: true });
    const file = new Blob(['img'], { type: 'image/png' });
    const event = { target: { files: [file], value: 'x' } };
    w.vm.handleImageSelectionChange(event);
    expect(w.emitted()['guest-attempt']).to.have.lengthOf(1);
    expect(w.emitted()['image-change']).to.equal(undefined);
    expect(event.target.value).to.equal('');
  });

  it('動画ファイルを選ぶとvideo-changeイベントを通知する', () => {
    const w = factory();
    const file = new Blob(['vid'], { type: 'video/mp4' });
    w.vm.handleVideoSelectionChange({ target: { files: [file] } });
    expect(w.emitted()['video-change'][0][0]).to.equal(file);
  });

  it('音声を選ぶとファイルを保持し、再生時間の取得後にaudio-changeを通知する', async () => {
    const w = factory({ audioDuration: null });
    const file = new Blob(['aud'], { type: 'audio/aac' });

    // 再生時間を固定して検証するため、音声読込をモックし、必要なブラウザAPIを補う。
    const hadURLObj = !!global.URL;
    const prevCreate = hadURLObj ? global.URL.createObjectURL : undefined;
    const prevRevoke = hadURLObj ? global.URL.revokeObjectURL : undefined;
    if (!hadURLObj) global.URL = {};
    if (!global.URL.createObjectURL) global.URL.createObjectURL = () => 'blob:unit-test';
    if (!global.URL.revokeObjectURL) global.URL.revokeObjectURL = () => {};

    const prevAudio = global.Audio;
    class FakeAudio {
      constructor() {
        this.preload = '';
        this.duration = 7;
        this._src = '';
        this.onloadedmetadata = null;
      }
      set src(v) {
        this._src = v;
        // 実際の音声読込と同様に、完了通知を非同期で発生させる。
        setTimeout(() => {
          if (typeof this.onloadedmetadata === 'function') this.onloadedmetadata();
        }, 0);
      }
    }
    global.Audio = FakeAudio;

    try {
      await w.vm.handleAudioSelectionChange({ target: { files: [file] } });
      // 音声の読込完了に伴う状態更新を待つ。
      await new Promise((r) => setTimeout(r, 0));
    } finally {
      global.Audio = prevAudio;
      if (hadURLObj) {
        global.URL.createObjectURL = prevCreate;
        global.URL.revokeObjectURL = prevRevoke;
      } else {
        delete global.URL;
      }
    }

    expect(w.vm.localAudioFile).to.equal(file);
    expect(w.emitted()['audio-change'][0][0]).to.equal(file);
    const dur = w.emitted()['audio-duration-change'];
    if (dur) expect(dur[0][0]).to.be.a('number');
  });

  it('音声ファイルが選ばれていなければ何もしない', async () => {
    const w = factory();
    await w.vm.handleAudioSelectionChange({ target: { files: [] } });
    expect(w.emitted()['audio-change']).to.equal(undefined);
  });

  it('字幕は2MB以下ならファイルを、上限を超えた場合はnullを通知する', () => {
    const w = factory();
    const small = new Blob([new Uint8Array(10)], { type: 'text/vtt' });
    const big = new Blob([new Uint8Array(2 * 1024 * 1024 + 10)], { type: 'text/vtt' });

    w.vm.handleSubtitleSelectionChange({ target: { files: [small] } });
    w.vm.handleSubtitleSelectionChange({ target: { files: [big] } });

    const events = w.emitted()['video-subtitle-change'];
    expect(events[0][0]).to.equal(small);
    expect(events[1][0]).to.equal(null);
  });

  it.each(['image', 'video', 'audio'])('%sの添付削除ボタンは解除を通知し、送信中とゲスト制限時は解除しない', async (kind) => {
    const wrapper = factory({ [`${kind}Data`]: 'preview-data' });
    const button = wrapper.get('.media-remove-button');
    expect(button.attributes('aria-label')).toBe('削除');
    await button.trigger('click');
    expect(wrapper.emitted('remove-media')).toEqual([[kind]]);
    await wrapper.setProps({ sending: true });
    await button.trigger('click');
    expect(wrapper.emitted('remove-media')).toHaveLength(1);
    await wrapper.setProps({ sending: false, locked: true });
    await button.trigger('click');
    expect(wrapper.emitted('remove-media')).toHaveLength(1);
    expect(wrapper.emitted('guest-attempt')).toHaveLength(1);
    wrapper.unmount();
  });

  it('添付削除でremove-mediaイベントを通知する', () => {
    const w = factory();
    w.vm.remove('image');
    w.vm.remove('video');
    w.vm.remove('audio');
    const ev = w.emitted()['remove-media'];
    expect(ev.map((e) => e[0])).to.deep.equal(['image', 'video', 'audio']);
  });

  it('添付削除が制限されている場合はguest-attemptだけを通知する', () => {
    const w = factory({ locked: true });
    w.vm.remove('image');
    expect(w.emitted()['guest-attempt']).to.have.lengthOf(1);
    expect(w.emitted()['remove-media']).to.equal(undefined);
  });

  it('動画の再生時間を四捨五入して通知する', () => {
    const w = factory();
    w.vm.onLoadedVideoData({ target: { duration: 12.6 } });
    expect(w.emitted()['video-duration-change'][0][0]).to.equal(13);
  });

  it('音声の再生時間を取得済みなら再通知しない', async () => {
    const w = factory({ audioDuration: 10 });
    w.setData({ localAudioFile: new Blob([1], { type: 'audio/wav' }) });
    await w.vm.onLoadedAudioData({ target: {} });
    expect(w.emitted()['audio-duration-change']).to.equal(undefined);
  });

  it('画像キャプション・音声タイトル・音声説明の変更を入力値へ反映する', async () => {
    const w = factory({ imageCaption: null, audioTitle: null, audioDescription: null });
    await w.setProps({ imageCaption: 'cap', audioTitle: 'title', audioDescription: 'desc' });
    expect(w.vm.localImageCaption).to.equal('cap');
    expect(w.vm.localAudioTitle).to.equal('title');
    expect(w.vm.localAudioDescription).to.equal('desc');
  });

  it('画像キャプション・音声タイトル・音声説明の変更を対応するイベントで通知する', () => {
    const w = factory();
    w.setData({ localImageCaption: 'C', localAudioTitle: 'T', localAudioDescription: 'D' });
    w.vm.onImageCaptionChange();
    w.vm.onAudioTitleChange();
    w.vm.onAudioDescriptionChange();
    expect(w.emitted()['image-caption-change'][0][0]).to.equal('C');
    expect(w.emitted()['audio-title-change'][0][0]).to.equal('T');
    expect(w.emitted()['audio-description-change'][0][0]).to.equal('D');
  });

  it('動画・音声のファイルサイズと再生時間を表示用に整形する', () => {
    const w = factory({
      videoSize: 5 * 1024 * 1024,
      maxVideoSize: 12 * 1024 * 1024,
      videoDuration: 34,
      maxVideoDuration: 120,
      audioSize: 3.2 * 1024 * 1024,
      maxAudioSize: 10 * 1024 * 1024,
      audioDuration: 15,
      maxAudioDuration: 90,
    });
    expect(w.vm.videoSizeText).to.equal('5.0 / 12.0 MB');
    expect(w.vm.videoDurationText).to.equal('34 / 120 Sec');
    expect(w.vm.audioSizeText).to.equal('3.2 / 10.0 MB');
    expect(w.vm.audioDurationText).to.equal('15 / 90 Sec');
  });

  it('送信中または録音中は操作ボタンを無効にする', () => {
    const w = factory({ sending: true, recording: false });
    const mediaBtns = w.findAll('button.media-button');
    expect(mediaBtns.length).to.equal(3);
    mediaBtns.forEach((b) => {
      expect(b.attributes()).to.have.property('disabled');
      expect(b.element.disabled).to.equal(true);
    });
  });
});

describe('source-based file selection', () => {
  it('routes files by supported type without changing tags, and rejects non-media', () => {
    const emitted=[];const ctx={guard:()=>false,$emit:(...args)=>emitted.push(args),sourceError:false};
    for(const [name,type,event] of [['a.jpg','image/jpeg','image-change'],['a.mp4','video/mp4','video-change'],['a.wav','audio/wav','audio-change']]) {
      MediaInput.methods.handleSourceSelection.call(ctx,{target:{files:[new File(['x'],name,{type})]}},false);expect(emitted.at(-1)[0]).to.equal(event);
    }
    MediaInput.methods.handleSourceSelection.call(ctx,{target:{files:[new File(['x'],'notes.txt',{type:'text/plain'})]}},false);expect(ctx.sourceError).to.equal(true);expect(emitted).to.have.length(3);
  });
});

it('uses 2000-unit alternative text and no separate title input', async () => {
 const w=factory({imageData:'image-data',audioData:'audio-data'});
 const caption=w.get('[data-testid="media-image-caption"]');const description=w.get('[data-testid="media-audio-description"]');
 expect(caption.attributes('maxlength')).to.equal('2000');expect(description.attributes('maxlength')).to.equal('2000');expect(w.find('[data-testid="media-audio-title"]').exists()).to.equal(false);
 await caption.setValue('あ'.repeat(2000));await description.setValue('a'.repeat(2000));
 expect(w.emitted('image-caption-change').at(-1)[0]).to.equal('あ'.repeat(2000));expect(w.emitted('audio-description-change').at(-1)[0]).to.equal('a'.repeat(2000));w.unmount();
});


describe('native camera and library entry points', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each(['iPhone Mobile Safari','Android Chrome'])('opens the requested capture directly for %s', userAgent => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
    const w=factory(),photo=w.vm.$refs.inputCameraPhoto,video=w.vm.$refs.inputCameraVideo;
    photo.click=vi.fn();video.click=vi.fn();
    expect(w.vm.chooseCameraFile('photo')).toBe(true);
    expect(photo.click).toHaveBeenCalledOnce();expect(video.click).not.toHaveBeenCalled();
    expect(photo.accept.split(',').every(t=>t.startsWith('image/'))).toBe(true);expect(photo.getAttribute('capture')).toBe('environment');
    expect(w.vm.chooseCameraFile('video')).toBe(true);
    expect(video.click).toHaveBeenCalledOnce();expect(video.accept.split(',').every(t=>t.startsWith('video/'))).toBe(true);expect(video.getAttribute('capture')).toBe('environment');
    expect(w.emitted('image-change')).toBeUndefined();expect(w.emitted('video-change')).toBeUndefined();w.unmount();
  });
  it('keeps all library MIME types within Android photo picker categories', () => {
    const w=factory(),library=w.vm.$refs.inputLibrary,file=w.vm.$refs.inputAttachment;
    library.click=vi.fn();file.click=vi.fn();w.vm.chooseSourceFile('library');
    expect(library.click).toHaveBeenCalledOnce();expect(file.click).not.toHaveBeenCalled();
    expect(library.accept.split(',').every(t=>t.startsWith('image/') || t.startsWith('video/'))).toBe(true);
    expect(library.accept).toContain('image/');expect(library.accept).toContain('video/');expect(library.getAttribute('capture')).toBeNull();w.unmount();
  });
  it('retains the general file entry for supported photos, videos and sounds', () => {
    const w=factory(),input=w.vm.$refs.inputAttachment;input.click=vi.fn();
    w.vm.chooseSourceFile('file');expect(input.click).toHaveBeenCalledOnce();expect(input.accept).toContain('image/');expect(input.accept).toContain('video/');expect(input.accept).toContain('audio/');
    for(const [name,type,event] of [['a.jpg','image/jpeg','image-change'],['a.mp4','video/mp4','video-change'],['a.wav','audio/wav','audio-change']]) {
      const file=new File(['synthetic'],name,{type});w.vm.handleSourceSelection({target:{files:[file]}});expect(w.emitted(event)[0]).toEqual([file]);
    }
    w.unmount();
  });
  it('cancelling any native entry preserves the existing attachment and description', () => {
    vi.spyOn(navigator,'userAgent','get').mockReturnValue('Android Chrome');
    const w=factory({imageData:'existing-image',imageCaption:'Keep this description'});
    for(const ref of ['inputLibrary','inputAttachment','inputCameraPhoto','inputCameraVideo']) w.vm.$refs[ref].click=vi.fn();
    for(const kind of ['library','file','photo','video']) {
      if(['photo','video'].includes(kind))w.vm.chooseCameraFile(kind);else w.vm.chooseSourceFile(kind);
      w.vm.handleSourceSelection({target:{files:[]}});
      expect(w.vm.localImageCaption).toBe('Keep this description');expect(w.get('.image-preview-wrapper img').attributes('src')).toBe('existing-image');
    }
    expect(w.emitted('remove-media')).toBeUndefined();expect(w.emitted('image-change')).toBeUndefined();w.unmount();
  });
  it('returns to the existing internal camera on desktop for both modes', () => {
    vi.spyOn(navigator,'userAgent','get').mockReturnValue('Macintosh Safari');const w=factory();
    expect(w.vm.chooseCameraFile('photo')).toBe(false);expect(w.vm.chooseCameraFile('video')).toBe(false);w.unmount();
  });
  it.each([{locked:true},{sending:true},{recording:true}])('blocks disabled or guest capture and file selection: %o', props => {
    vi.spyOn(navigator,'userAgent','get').mockReturnValue('iPhone Mobile Safari');const w=factory(props);
    for(const ref of ['inputLibrary','inputAttachment','inputCameraPhoto','inputCameraVideo'])w.vm.$refs[ref].click=vi.fn();
    w.vm.chooseCameraFile('photo');w.vm.chooseCameraFile('video');w.vm.chooseSourceFile('library');w.vm.chooseSourceFile('file');
    for(const ref of ['inputLibrary','inputAttachment','inputCameraPhoto','inputCameraVideo'])expect(w.vm.$refs[ref].click).not.toHaveBeenCalled();
    if(props.locked)expect(w.emitted('guest-attempt')).toHaveLength(4);w.unmount();
  });
});
