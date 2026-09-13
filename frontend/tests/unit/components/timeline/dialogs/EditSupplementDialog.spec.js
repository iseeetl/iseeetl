import { expect } from 'vitest';
import { setTestRoute, shallowMount } from '../../../helpers/testUtils';
import { createMemoryHistory, createRouter as createVueRouter } from 'vue-router';
import chatApi from '@/api/chat';
import uploadApi from '@/api/upload';
import UiButton from '@/components/ui/UiButton.vue';
import EditSupplementDialog from '@/components/timeline/dialogs/EditSupplementDialog.vue';


const createRouter = (overrides = {}) => {
  const router = createVueRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: {} }],
  });
  return setTestRoute(router, overrides.route || '/');
};

const baseStubs = {
  ConfirmDialog: true,
  MediaInput: true,
  WaveformRecord: true,
  TimelineEditorDialog: {
    template: '<div><slot name="mobile-actions"/><slot/><slot name="actions"/></div>',
  },
  UiField: {
    props: {
      controlId: String,
      counter: Boolean,
    },
    template: `
      <div :data-counter-enabled="counter ? 'true' : 'false'">
        <slot :controlAttrs="{ id: controlId }"/>
      </div>
    `,
  },
  UiButton: true,
  UiIcon: true,
  UiProgress: true,
  UiTooltip: { template: '<span><slot/></span>' },
};

const createStoreMock = (overrides = {}) => ({
  getters: {
    floorId: 'floor-1',
    roomId: 'room-1',
    userIsLogin: true,
    openaiTranscriptionAvailable: true,
    ...overrides.getters,
  },
  dispatch: () => {},
});

const createWrapper = (overrides = {}) =>
  shallowMount(EditSupplementDialog, {
    stubs: { ...baseStubs, ...(overrides.stubs || {}) },
    router: overrides.router || createRouter({ route: overrides.route }),
    props: {
      dialogVisible: true,
      postId: 'post-1',
      replyId: null,
      supplementValue: null,
      targetLangs: [],
      roomQuickTextGroups: [],
      roomQuickTextItemsByGroup: {},
      ...(overrides.props || {}),
    },
    mocks: {
      $store: overrides.store || createStoreMock(),
      $t: (key) => key,
      $i18n: { locale: 'ja' },
      ...(overrides.mocks || {}),
    },
  });

describe('付加情報の作成・編集', () => {
  it.each([[null, 'updateSupplement'], ['reply', 'updateReplySupplement']])('親返信IDが%sの場合も、本文だけの編集では保存言語・添付を再送しない', async (replyId, method) => {
    const original = chatApi[method];
    const calls = [];
    chatApi[method] = (body) => { calls.push(body); return Promise.resolve({ data: {} }); };
    const wrapper = createWrapper({ props: {
      postId: 'post', replyId,
      supplementValue: { _id: 'supplement', content: 'before', lang: 'en', image_name: 'old.png' },
    } });
    try {
      wrapper.vm.openedDialog();
      wrapper.vm.content = 'after';
      await wrapper.vm.editSupplement();
      expect(calls).to.deep.equal([{ room_id: 'room-1', post_id: 'post', _id: 'supplement', content: 'after', ...(replyId ? { reply_id: replyId } : {}) }]);
    } finally { chatApi[method] = original; wrapper.unmount(); }
  });

  it('コメント入力欄は4行分を確保し共通カウンターを使用する', () => {
    const wrapper = createWrapper();
    const field = wrapper.find('.timeline-comment-field');

    expect(field.attributes('data-counter-enabled')).to.equal('true');
    expect(wrapper.find('#supplement_content').attributes('rows')).to.equal('4');
    expect(wrapper.find('.text-count').exists()).to.equal(false);
  });

  it('文字起こし無効時も録音音声を保持しAPI処理を呼ばない', async () => {
    const wrapper = createWrapper({
      store: createStoreMock({ getters: { openaiTranscriptionAvailable: false } }),
    });
    let transcribeCalls = 0;
    wrapper.vm.transcribeAudio = () => {
      transcribeCalls += 1;
    };
    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = () => 'blob:test';
    try {
      await wrapper.vm.handleBlob({ blob: new Blob(['audio'], { type: 'audio/webm' }), duration: 2 });
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
    }

    expect(transcribeCalls).to.equal(0);
    expect(wrapper.vm.audioFile).not.to.equal(null);
    expect(wrapper.vm.transcribing).to.equal(false);
  });

  it('付加情報用MediaInputへ固定prefixを渡す', () => {
    const wrapper = createWrapper();
    expect(wrapper.findComponent({ name: 'MediaInput' }).props('idPrefix')).to.equal('timeline-supplement-media');
  });

  it('アコーディオンの操作名で開閉状態を示し、同名の単語グループを表示順で区別する', async () => {
    const originalConsoleWarn = console.warn;
    const warnings = [];
    console.warn = (message) => warnings.push(message);

    let wrapper;
    try {
      wrapper = createWrapper({
        props: {
          roomQuickTextGroups: [
            { _id: 'g1', order: 1, title: '同名グループ', lang: 'ja' },
            { _id: 'g2', order: 2, title: '同名グループ', lang: 'ja' },
          ],
          roomQuickTextItemsByGroup: { g1: [], g2: [] },
        },
        stubs: { UiButton },
      });
    } finally {
      console.warn = originalConsoleWarn;
    }

    expect(warnings.some((warning) => warning.includes('[UiButton] iconOnly requires'))).to.equal(false);

    const toggles = [
      { controlId: wrapper.vm.qtPanelId('g1'), targetName: '同名グループ', expectedPosition: '1' },
      { controlId: wrapper.vm.qtPanelId('g2'), targetName: '同名グループ', expectedPosition: '2' },
      { controlId: wrapper.vm.accIds.media, targetName: 'メディア' },
    ];

    for (const { controlId, targetName, expectedPosition } of toggles) {
      const toggle = wrapper.find(`.acc-legend-toggle[aria-controls="${controlId}"]`);
      expect(wrapper.findAll(`[id="${controlId}"]`)).to.have.length(1);
      const initialExpanded = toggle.attributes('aria-expanded') === 'true';

      expect(toggle.attributes('aria-label')).to.include(targetName);
      if (expectedPosition) expect(toggle.attributes('aria-label')).to.include(`${targetName} ${expectedPosition}`);
      expect(toggle.attributes('aria-label')).to.include(initialExpanded ? '閉じる' : '開く');

      await toggle.trigger('click');

      expect(toggle.attributes('aria-expanded')).to.equal(initialExpanded ? 'false' : 'true');
      expect(toggle.attributes('aria-label')).to.include(initialExpanded ? '開く' : '閉じる');
    }

    const firstQuickTextToggle = wrapper.find(`.acc-legend-toggle[aria-controls="${wrapper.vm.qtPanelId('g1')}"]`);
    const secondQuickTextToggle = wrapper.find(`.acc-legend-toggle[aria-controls="${wrapper.vm.qtPanelId('g2')}"]`);
    expect(firstQuickTextToggle.attributes('aria-label')).to.not.equal(secondQuickTextToggle.attributes('aria-label'));
    wrapper.unmount();
  });

  it('selectQuickTextItem はカーソル位置に追加する', async () => {
    const wrapper = createWrapper({
      props: {
        roomQuickTextGroups: [{ _id: 'g1', title: 'g1', lang: 'ja' }],
        roomQuickTextItemsByGroup: { g1: [{ _id: 'i1', label: 'Q', lang: 'ja' }] },
      },
    });

    let selectionArgs = null;
    const textarea = wrapper.vm.$refs.supplementContentRef;
    textarea.focus = () => {};
    textarea.setSelectionRange = (start, end) => {
      selectionArgs = [start, end];
    };

    wrapper.setData({ content: 'ab' });
    await wrapper.vm.$nextTick();

    textarea.selectionStart = 1;
    textarea.selectionEnd = 1;
    wrapper.vm.updateContentSelection({ target: textarea });
    wrapper.vm.selectQuickTextItem({ _id: 'quick-1', label: 'Q', lang: 'ja' });
    await wrapper.vm.$nextTick();
    wrapper.vm.onPressCancelButton();

    expect(wrapper.vm.content).to.equal('aQb');
    expect(wrapper.vm.contentSelectionStart).to.equal(2);
    expect(wrapper.vm.contentSelectionEnd).to.equal(2);
    expect(selectionArgs).to.deep.equal([2, 2]);
    expect(wrapper.emitted()['quick-text-inserted']).to.deep.equal([
      [{ contentType: 'supplement', quickTextId: 'quick-1', quickTextLabel: 'Q' }],
    ]);
    expect(wrapper.emitted()['content-saved']).to.equal(undefined);
  });

  it('単語グループタイトルクリックでアコーディオンを開閉できる', async () => {
    const wrapper = createWrapper({
      props: {
        roomQuickTextGroups: [{ _id: 'g1', title: '単語', lang: 'ja' }],
        roomQuickTextItemsByGroup: { g1: [{ _id: 'i1', label: '文言', lang: 'ja' }] },
      },
    });
    const titleButton = wrapper.find('[data-testid="dialog-edit-supplement-quicktext-title-toggle-g1"]');
    const initial = wrapper.vm.isQuickTextOpen('g1');

    expect(titleButton.exists()).to.equal(true);

    await titleButton.trigger('click');
    expect(wrapper.vm.isQuickTextOpen('g1')).to.equal(!initial);
  });

  it('メディアタイトルクリックでメディアアコーディオンを開閉できる', async () => {
    const wrapper = createWrapper();
    const titleButton = wrapper.find('[data-testid="dialog-edit-supplement-media-title-toggle"]');

    expect(titleButton.exists()).to.equal(true);
    expect(wrapper.vm.isAccordionOpen('media')).to.equal(true);

    await titleButton.trigger('click');
    expect(wrapper.vm.isAccordionOpen('media')).to.equal(false);

    await titleButton.trigger('click');
    expect(wrapper.vm.isAccordionOpen('media')).to.equal(true);
  });

  it('ダイアログを開くと表示フラグがtrueになる', () => {
    const wrapper = createWrapper({ props: { dialogVisible: false } });

    wrapper.vm.openAndFocus();

    expect(wrapper.vm.visible).to.equal(true);
  });

  it('付加情報更新成功は応答のアニメーションとアップロード前音声スナップショットだけを通知する', async () => {
    const wrapper = createWrapper();
    wrapper.setData({
      postIdLocal: 'post-1',
      supplementId: 'supp-1',
      content: 'note',
      audioFile: {},
    });
    await wrapper.vm.$nextTick();
    wrapper.vm.audioUpload = async () => {
      wrapper.vm.audioFile = null;
      wrapper.vm.audioName = 'uploaded.mp3';
    };
    wrapper.vm.editSupplement = () => Promise.resolve({ data: { animation: 'server-animation' } });

    await wrapper.vm.submitSupplement();

    expect(wrapper.emitted()['content-saved']).to.deep.equal([
      [
        {
          contentType: 'supplement',
          actionType: 'update',
          presentationAnimation: 'server-animation',
          mediaType: 'audio',
        },
      ],
    ]);
  });

  it.each([
    [
      'Post付加情報の画像から動画',
      {
        postId: 'post-1',
        replyId: null,
        supplementValue: {
          _id: 'supp-1',
          content: 'body',
          image_name: 'saved.png',
          image_thumbnail_name: 'saved-thumbnail.png',
          image_caption: 'saved caption',
        },
      },
      null,
      'handleVideoChange',
      { name: 'replacement.mp4', type: 'video/mp4', size: 10 },
      'uploadTimelineVideo',
      { video_name: 'replacement.mp4', video_thumbnail_name: 'replacement-thumbnail.png' },
      'updateSupplement',
      { image: null, video: { file_name: 'replacement.mp4', thumbnail_name: 'replacement-thumbnail.png', subtitle: null } },
    ],
    [
      'Reply付加情報の選択中画像から音声',
      { postId: 'post-1', replyId: 'reply-1', supplementValue: null },
      {
        content: 'body',
        imageFile: { name: 'draft.png' },
        imageCaption: 'draft caption',
      },
      'handleAudioChange',
      { name: 'replacement.mp3', type: 'audio/mpeg', size: 10 },
      'uploadTimelineAudio',
      { audio_name: 'replacement.mp3' },
      'createReplySupplement',
      { audio: { file_name: 'replacement.mp3', title: null, description: null } },
    ],
  ])('%sへ切り替えると、画像情報を残さず新しいメディアを送る', async (
    _label,
    props,
    initialData,
    handler,
    file,
    uploadMethod,
    uploadResponse,
    requestMethod,
    expectedMedia
  ) => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalUpload = uploadApi[uploadMethod];
    const originalRequest = chatApi[requestMethod];
    let sentPayload = null;
    let wrapper;

    URL.createObjectURL = () => 'blob:replacement';
    uploadApi[uploadMethod] = () => Promise.resolve({ data: uploadResponse });
    chatApi[requestMethod] = (payload) => {
      sentPayload = payload;
      return Promise.resolve({ data: { ...payload, animation: null } });
    };

    try {
      wrapper = createWrapper({ props });
      wrapper.vm.openedDialog();
      if (initialData) await wrapper.setData(initialData);
      wrapper.vm[handler](file);
      await wrapper.vm.$nextTick();

      await wrapper.vm.submitSupplement();

      expect(sentPayload.media).to.deep.equal(expectedMedia);
      expect(sentPayload).not.to.have.property('image_name');
    } finally {
      if (wrapper) wrapper.unmount();
      chatApi[requestMethod] = originalRequest;
      uploadApi[uploadMethod] = originalUpload;
      URL.createObjectURL = originalCreateObjectURL;
    }
  });

  it.each([
    ['Post付加情報', null, 'updateSupplement'],
    ['Reply付加情報', 'reply-1', 'updateReplySupplement'],
  ])('%sで保存済み画像を維持するとメディアを再送しない', async (
    _label,
    replyId,
    requestMethod
  ) => {
    const originalRequest = chatApi[requestMethod];
    let sentPayload = null;
    const wrapper = createWrapper({
      props: {
        postId: 'post-1',
        replyId,
        supplementValue: {
          _id: 'supp-1',
          content: 'body',
          image_name: 'saved.png',
          image_thumbnail_name: 'saved-thumbnail.png',
          image_caption: 'saved caption',
        },
      },
    });
    chatApi[requestMethod] = (payload) => {
      sentPayload = payload;
      return Promise.resolve({ data: { ...payload, animation: null } });
    };

    try {
      wrapper.vm.openedDialog();
      await wrapper.vm.editSupplement();

      expect(sentPayload).not.to.have.property('media');
      expect(sentPayload).not.to.have.property('image_name');
      expect(wrapper.vm.imageCaption).to.equal('saved caption');
    } finally {
      chatApi[requestMethod] = originalRequest;
      wrapper.unmount();
    }
  });

  it.each([
    ['未選択の音声', 'handleAudioChange', null],
    ['不正形式の動画', 'handleVideoChange', { name: 'invalid.txt', type: 'text/plain', size: 10 }],
  ])('%sでは保存済み画像とキャプションを変更しない', (_label, handler, file) => {
    const wrapper = createWrapper({
      props: {
        supplementValue: {
          _id: 'supp-1',
          content: 'body',
          image_name: 'saved.png',
          image_thumbnail_name: 'saved-thumbnail.png',
          image_caption: 'saved caption',
        },
      },
    });
    wrapper.vm.openedDialog();

    wrapper.vm[handler](file);

    expect(wrapper.vm.imageName).to.equal('saved.png');
    expect(wrapper.vm.imageThumbnailName).to.equal('saved-thumbnail.png');
    expect(wrapper.vm.imageCaption).to.equal('saved caption');
    wrapper.unmount();
  });

  it('録音音声へ切り替えると画像情報を残さず投稿付加情報の更新データへ送る', async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalUpload = uploadApi.uploadTimelineAudio;
    const originalUpdate = chatApi.updateSupplement;
    let sentPayload = null;
    let wrapper;

    URL.createObjectURL = () => 'blob:recording';
    uploadApi.uploadTimelineAudio = () => Promise.resolve({ data: { audio_name: 'recording.mp3' } });
    chatApi.updateSupplement = (payload) => {
      sentPayload = payload;
      return Promise.resolve({ data: { ...payload, animation: null } });
    };

    try {
      wrapper = createWrapper({
        props: {
          supplementValue: {
            _id: 'supp-1',
            content: 'body',
            image_name: 'saved.png',
            image_thumbnail_name: 'saved-thumbnail.png',
            image_caption: 'saved caption',
          },
        },
        store: createStoreMock({ getters: { openaiTranscriptionAvailable: false } }),
      });
      wrapper.vm.openedDialog();
      await wrapper.vm.handleBlob({ blob: new Blob(['audio'], { type: 'audio/mpeg' }), duration: 2 });
      await wrapper.vm.$nextTick();

      await wrapper.vm.submitSupplement();

      expect(sentPayload.media).to.deep.equal({
        image: null,
        audio: { file_name: 'recording.mp3', title: null, description: null },
      });
    } finally {
      if (wrapper) wrapper.unmount();
      chatApi.updateSupplement = originalUpdate;
      uploadApi.uploadTimelineAudio = originalUpload;
      URL.createObjectURL = originalCreateObjectURL;
    }
  });

  it('録音blobがnullなら保存済み画像とキャプションを変更しない', async () => {
    const wrapper = createWrapper({
      props: {
        supplementValue: {
          _id: 'supp-1',
          content: 'body',
          image_name: 'saved.png',
          image_thumbnail_name: 'saved-thumbnail.png',
          image_caption: 'saved caption',
        },
      },
      store: createStoreMock({ getters: { openaiTranscriptionAvailable: false } }),
    });
    wrapper.vm.openedDialog();

    await wrapper.vm.handleBlob({ blob: null, duration: null });

    expect(wrapper.vm.imageName).to.equal('saved.png');
    expect(wrapper.vm.imageThumbnailName).to.equal('saved-thumbnail.png');
    expect(wrapper.vm.imageCaption).to.equal('saved caption');
    wrapper.unmount();
  });

  it('字幕だけの保存成功は画像・動画・音声の新規添付として通知しない', async () => {
    const wrapper = createWrapper();
    wrapper.setData({
      postIdLocal: 'post-1',
      supplementId: null,
      content: 'note',
      videoSubtitleFile: {},
    });
    await wrapper.vm.$nextTick();
    wrapper.vm.videoUpload = async () => {
      wrapper.vm.videoSubtitleFile = null;
      wrapper.vm.videoSubtitleName = 'subtitle.vtt';
    };
    wrapper.vm.editSupplement = () => Promise.resolve({ data: { animation: null } });

    await wrapper.vm.submitSupplement();

    expect(wrapper.emitted()['content-saved'][0][0]).to.deep.equal({
      contentType: 'supplement',
      actionType: 'create',
      presentationAnimation: null,
      mediaType: null,
    });
  });

  it('通信失敗時のsubmitSupplementはPromiseを失敗として返さない', async () => {
    const wrapper = createWrapper();

    wrapper.setData({ content: 'ok' });
    await wrapper.vm.$nextTick();

    const networkError = Object.assign(new Error('Network Error'), {
      isAxiosError: true,
      request: {},
    });
    wrapper.vm.editSupplement = () => Promise.reject(networkError);

    let rejected = false;
    await wrapper.vm.submitSupplement().catch(() => {
      rejected = true;
    });

    expect(rejected).to.equal(false);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.progressAmount).to.equal(0);
    expect(wrapper.emitted()['content-saved']).to.equal(undefined);
  });

  it('submitSupplement はアップロード後に4xxで保存を拒否された時だけ未添付メディアを破棄する', async () => {
    const wrapper = createWrapper();
    const originalDiscard = uploadApi.discardTimelineMedia;
    const calls = [];
    uploadApi.discardTimelineMedia = (payload) => {
      calls.push(payload);
      return Promise.resolve();
    };
    wrapper.setData({ content: 'ok', imageFile: {} });
    await wrapper.vm.$nextTick();
    wrapper.vm.imageUpload = async () => {
      wrapper.vm.imageFile = null;
      wrapper.vm.imageName = 'image.png';
      wrapper.vm.imageThumbnailName = 'thumb.png';
    };
    wrapper.vm.editSupplement = () =>
      Promise.reject(
        Object.assign(new Error('Bad Request'), {
          isAxiosError: true,
          response: { status: 400 },
        })
      );

    try {
      await wrapper.vm.submitSupplement();
      expect(calls).to.deep.equal([
        {
          room_id: 'room-1',
          file_names: ['image.png', 'thumb.png'],
        },
      ]);
    } finally {
      uploadApi.discardTimelineMedia = originalDiscard;
    }
  });

  it('想定外のエラー時のsubmitSupplementはPromiseを失敗として返す', async () => {
    const wrapper = createWrapper();

    wrapper.setData({ content: 'ok' });
    await wrapper.vm.$nextTick();

    wrapper.vm.editSupplement = () => Promise.reject(new Error('Unexpected Error'));

    let rejected = false;
    await wrapper.vm.submitSupplement().catch(() => {
      rejected = true;
    });

    expect(rejected).to.equal(true);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.progressAmount).to.equal(0);
  });

  it('ダイアログを開くと付加情報とプレビューURLを反映する', () => {
    const wrapper = createWrapper({
      props: {
        postId: 'post-1',
        replyId: 'reply-1',
        supplementValue: {
          _id: 'supp-1',
          content: 'note',
          image_name: 'image.png',
          video_name: 'video.mp4',
          video_thumbnail_name: 'thumb.png',
          audio_name: 'audio.mp3',
          image_caption: 'caption',
          video_subtitle_originalname: 'video.vtt',
          video_subtitle_name: 'subtitle.vtt',
          audio_title: 'title',
          audio_description: 'desc',
        },
      },
    });

    wrapper.vm.openedDialog();

    expect(wrapper.vm.postIdLocal).to.equal('post-1');
    expect(wrapper.vm.replyIdLocal).to.equal('reply-1');
    expect(wrapper.vm.supplementId).to.equal('supp-1');
    expect(wrapper.vm.content).to.equal('note');
    expect(wrapper.vm.imageData).to.equal('/media/floor-1/room-1/image.png');
    expect(wrapper.vm.videoData).to.equal('/media/floor-1/room-1/video.mp4');
    expect(wrapper.vm.audioData).to.equal('/media/floor-1/room-1/audio.mp3');
    expect(wrapper.vm.videoSubtitleData).to.equal('/media/floor-1/room-1/subtitle.vtt');
    expect(wrapper.vm.imageCaption).to.equal('caption');
    expect(wrapper.vm.audioTitle).to.equal('title');
    expect(wrapper.vm.audioDescription).to.equal('desc');
  });

  it('既存の401文字本文は開いた時点で保持し、400文字以下へ短縮するまで保存不可にする', async () => {
    const longContent = 'a'.repeat(401);
    const wrapper = createWrapper({
      props: {
        supplementValue: {
          _id: 'supp-long',
          content: longContent,
        },
      },
    });

    wrapper.vm.openedDialog();
    await wrapper.vm.$nextTick();
    wrapper.vm.v$.content.$touch();

    expect(wrapper.vm.content).to.equal(longContent);
    expect(wrapper.vm.v$.content.maxLength.$invalid).to.equal(true);

    wrapper.vm.content = 'a'.repeat(400);
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.v$.content.maxLength.$invalid).to.equal(false);
    wrapper.unmount();
  });

  it('字幕だけをアップロードして既存動画と字幕表示名を保持する', async () => {
    const wrapper = createWrapper();
    const originalUpload = uploadApi.uploadTimelineVideo;
    let uploadedFormData = null;
    uploadApi.uploadTimelineVideo = (formData) => {
      uploadedFormData = formData;
      return Promise.resolve({
        data: {
          video_name: null,
          video_thumbnail_name: null,
          video_subtitle_name: 'new-subtitle.vtt',
        },
      });
    };
    wrapper.setData({
      videoName: 'existing.mp4',
      videoThumbnailName: 'existing.png',
      videoFile: null,
      videoSubtitleFile: { name: 'new.vtt' },
      videoSubtitleOriginalName: 'new.vtt',
    });
    await wrapper.vm.$nextTick();

    try {
      await wrapper.vm.videoUpload();

      expect(uploadedFormData.has('video_file')).to.equal(false);
      expect(uploadedFormData.has('video_subtitle_file')).to.equal(true);
      expect(wrapper.vm.videoName).to.equal('existing.mp4');
      expect(wrapper.vm.videoThumbnailName).to.equal('existing.png');
      expect(wrapper.vm.videoSubtitleName).to.equal('new-subtitle.vtt');
      expect(wrapper.vm.videoSubtitleOriginalName).to.equal('new.vtt');
      expect(wrapper.vm.videoSubtitleFile).to.equal(null);
    } finally {
      uploadApi.uploadTimelineVideo = originalUpload;
    }
  });

  it('401応答ではログアウトしてログイン画面へ移動し、エラーを再送出する', () => {
    const dispatchCalls = [];
    const snackbarCalls = [];
    const pushCalls = [];
    const router = createRouter();
    router.push = (payload) => {
      pushCalls.push(payload);
      return Promise.resolve();
    };
    const wrapper = createWrapper({
      store: {
        ...createStoreMock(),
        dispatch: (type, payload) => dispatchCalls.push({ type, payload }),
      },
      router,
    });
    wrapper.vm.setSnackbar = (message, role) => snackbarCalls.push({ message, role });

    const err = { response: { status: 401 } };
    expect(() => wrapper.vm.handleHttpError(err, '付加情報を保存できませんでした。')).to.throw();
    expect(dispatchCalls.map((c) => c.type)).to.include('doLogout');
    expect(pushCalls).to.deep.equal([{ name: 'Login' }]);
    expect(snackbarCalls).to.have.lengthOf(1);
    expect(snackbarCalls[0].role).to.equal('alert');
  });
});
