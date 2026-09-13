import { expect } from 'vitest';
import { setTestRoute, shallowMount } from '../../../helpers/testUtils';
import { createMemoryHistory, createRouter as createVueRouter } from 'vue-router';
import chatApi from '@/api/chat';
import uploadApi from '@/api/upload';
import UiButton from '@/components/ui/UiButton.vue';
import EditReplyDialog from '@/components/timeline/dialogs/EditReplyDialog.vue';


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
  TagSelector: true,
  WaveformRecord: true,
  LoginRequiredDialog: true,
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
  UiAvatar: { template: '<span><slot/></span>' },
  UiButton: true,
  UiIcon: true,
  UiProgress: true,
  UiTooltip: { template: '<span><slot/></span>' },
};

const createStoreMock = (overrides = {}) => ({
  getters: {
    lang: 'ja',
    floorId: 'floor-1',
    roomId: 'room-1',
    userId: 'user-1',
    userIsLogin: true,
    openaiTranscriptionAvailable: true,
    openaiAnalysisAvailable: true,
    ...overrides.getters,
  },
  dispatch: overrides.dispatch || (() => {}),
});

const createWrapper = (overrides = {}) =>
  shallowMount(EditReplyDialog, {
    stubs: { ...baseStubs, ...(overrides.stubs || {}) },
    router: overrides.router || createRouter({ route: overrides.route }),
    props: {
      dialogVisible: true,
      roomTags: [],
      postValue: null,
      replyValue: null,
      targetLangs: [],
      isGuestReactionOnly: false,
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

describe('返信の作成・編集', () => {
  it('本文だけの編集は保存言語・添付・画面情報を再送しない', async () => {
    const original = chatApi.updateReply;
    const calls = [];
    chatApi.updateReply = (body) => { calls.push(body); return Promise.resolve({ data: {} }); };
    const wrapper = createWrapper({ props: {
      postValue: { _id: 'post' },
      replyValue: { _id: 'reply', content: 'before', lang: 'en', room_tags: [], animation: null, image_name: 'old.png' },
    } });
    try {
      wrapper.vm.openedDialog();
      wrapper.vm.content = 'after';
      wrapper.vm.notifyAll = false;
      await wrapper.vm.editReply();
      expect(calls).to.deep.equal([{ room_id: 'room-1', post_id: 'post', _id: 'reply', content: 'after' }]);
    } finally { chatApi.updateReply = original; wrapper.unmount(); }
  });

  it('コメント入力欄は4行分を確保し共通カウンターを使用する', () => {
    const wrapper = createWrapper();
    const field = wrapper.find('.timeline-comment-field');

    expect(field.attributes('data-counter-enabled')).to.equal('true');
    expect(wrapper.find('#reply_content').attributes('rows')).to.equal('4');
    expect(wrapper.find('.text-count').exists()).to.equal(false);
  });

  it('外部サービス利用可否にかかわらず全ルームタグを選択・送信できる', () => {
    const roomTags = [
      { _id: 'normal', name: '通常', order: 1 },
      { _id: 'analysis', name: '音解析', order: 2 },
      { _id: 'new-analysis', name: '画像解析', order: 3 },
    ];
    const wrapper = createWrapper({
      props: {
        roomTags,
        postValue: { _id: 'post-1', room_tags: [] },
        replyValue: { _id: 'reply-1', content: null, animation: null, room_tags: ['analysis'] },
      },
      store: createStoreMock({ getters: { openaiAnalysisAvailable: false } }),
    });

    wrapper.vm.openedDialog();
    expect(wrapper.findComponent({ name: 'TagSelector' }).props('tags').map((tag) => tag._id)).to.deep.equal([
      'normal',
      'analysis',
      'new-analysis',
    ]);
    expect(wrapper.vm.roomTagsSelected).to.deep.equal(['analysis']);

    wrapper.vm.roomTagsSelected = ['analysis', 'new-analysis'];
    expect(wrapper.vm.submittableRoomTagIds).to.deep.equal(['analysis', 'new-analysis']);
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

  it('返信用MediaInputへ固定prefixを渡す', () => {
    const wrapper = createWrapper();
    expect(wrapper.findComponent({ name: 'MediaInput' }).props('idPrefix')).to.equal('timeline-reply-media');
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
      { controlId: wrapper.vm.accIds.reaction, targetName: 'リアクション' },
      { controlId: wrapper.vm.qtPanelId('g1'), targetName: '同名グループ', expectedPosition: '1' },
      { controlId: wrapper.vm.qtPanelId('g2'), targetName: '同名グループ', expectedPosition: '2' },
      { controlId: wrapper.vm.accIds.tags, targetName: 'タグ' },
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

  it('insertReaction はカーソル位置に追加する', async () => {
    const wrapper = createWrapper();
    let focused = false;
    let selectionArgs = null;
    const textarea = wrapper.vm.$refs.replyContentRef;
    textarea.focus = () => {
      focused = true;
    };
    textarea.setSelectionRange = (start, end) => {
      selectionArgs = [start, end];
    };

    wrapper.setData({ content: 'ab' });
    await wrapper.vm.$nextTick();

    textarea.selectionStart = 1;
    textarea.selectionEnd = 1;
    wrapper.vm.updateContentSelection({ target: textarea });
    textarea.selectionStart = 2;
    textarea.selectionEnd = 2;

    wrapper.vm.insertReaction('X');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.content).to.equal('aXb');
    expect(wrapper.vm.contentSelectionStart).to.equal(2);
    expect(wrapper.vm.contentSelectionEnd).to.equal(2);
    expect(focused).to.equal(true);
    expect(selectionArgs).to.deep.equal([2, 2]);
  });

  it('タグタイトルクリックでタグアコーディオンを開閉できる', async () => {
    const wrapper = createWrapper();
    const titleButton = wrapper.find('[data-testid="dialog-edit-reply-tags-title-toggle"]');

    expect(titleButton.exists()).to.equal(true);
    expect(wrapper.vm.isAccordionOpen('tags')).to.equal(true);

    await titleButton.trigger('click');
    expect(wrapper.vm.isAccordionOpen('tags')).to.equal(false);

    await titleButton.trigger('click');
    expect(wrapper.vm.isAccordionOpen('tags')).to.equal(true);
  });

  it('単語グループタイトルクリックでアコーディオンを開閉できる', async () => {
    const wrapper = createWrapper({
      props: {
        roomQuickTextGroups: [{ _id: 'g1', title: '単語', lang: 'ja' }],
        roomQuickTextItemsByGroup: { g1: [{ _id: 'i1', label: '文言', lang: 'ja' }] },
      },
    });
    const titleButton = wrapper.find('[data-testid="dialog-edit-reply-quicktext-title-toggle-g1"]');
    const initial = wrapper.vm.isQuickTextOpen('g1');

    expect(titleButton.exists()).to.equal(true);

    await titleButton.trigger('click');
    expect(wrapper.vm.isQuickTextOpen('g1')).to.equal(!initial);
  });

  it('表示中の単語を挿入直後に安全なデータで通知し、後のキャンセルでは取り消さない', async () => {
    const wrapper = createWrapper();
    const item = {
      _id: 'quick-1',
      label: 'base label',
      lang: 'en',
      translations: [{ lang: 'ja', content: '表示文言' }],
    };

    wrapper.vm.selectQuickTextItem(item);
    await wrapper.vm.$nextTick();
    wrapper.vm.onPressCancelButton();

    expect(wrapper.vm.content).to.equal('表示文言');
    expect(wrapper.emitted()['quick-text-inserted']).to.deep.equal([
      [{ contentType: 'reply', quickTextId: 'quick-1', quickTextLabel: 'base label' }],
    ]);
    expect(wrapper.emitted()['content-saved']).to.equal(undefined);
  });

  it('新規返信は持ち越しタグがあってもタグ未選択で開始する', () => {
    const wrapper = createWrapper({
      props: {
        postValue: { _id: 'post-1', room_tags: ['parent-tag'] },
      },
      store: createStoreMock({
        getters: { tagList: ['previous-post-tag'] },
      }),
    });
    const originalSetTimeout = global.setTimeout;
    global.setTimeout = () => 0;

    try {
      wrapper.setData({ roomTagsSelected: ['stale-tag'] });
      wrapper.vm.openedDialog();

      expect(wrapper.vm.roomTagsSelected).to.deep.equal([]);
    } finally {
      global.setTimeout = originalSetTimeout;
      document.removeEventListener('keydown', wrapper.vm.handleEditorShortcut);
      wrapper.unmount();
    }
  });

  it('返信編集は編集対象返信のタグで開始する', () => {
    const wrapper = createWrapper({
      props: {
        postValue: { _id: 'post-1', room_tags: ['parent-tag'] },
        replyValue: {
          _id: 'reply-1',
          content: 'reply',
          room_tags: ['reply-tag'],
        },
      },
      store: createStoreMock({
        getters: { tagList: ['previous-post-tag'] },
      }),
    });
    const originalSetTimeout = global.setTimeout;
    global.setTimeout = () => 0;

    try {
      wrapper.vm.openedDialog();

      expect(wrapper.vm.roomTagsSelected).to.deep.equal(['reply-tag']);
    } finally {
      global.setTimeout = originalSetTimeout;
      document.removeEventListener('keydown', wrapper.vm.handleEditorShortcut);
      wrapper.unmount();
    }
  });

  it('本文が上限超過なら返信を行わない', async () => {
    const wrapper = createWrapper();

    let editCount = 0;
    wrapper.vm.editReply = () => {
      editCount += 1;
      return Promise.resolve();
    };
    wrapper.vm.editGuestReply = () => {
      editCount += 1;
      return Promise.resolve();
    };

    wrapper.setData({ content: 'a'.repeat(401) });
    await wrapper.vm.$nextTick();

    await wrapper.vm.submitReply(false);

    expect(editCount).to.equal(0);
    expect(wrapper.emitted()['content-saved']).to.equal(undefined);
  });

  it('新規返信成功は応答のアニメーション・タグとアップロード前メディアスナップショットを通知する', async () => {
    const wrapper = createWrapper({
      props: { postValue: { _id: 'post-1', room_tags: [] }, replyValue: null },
    });
    wrapper.setData({
      postId: 'post-1',
      replyId: null,
      content: 'reply',
      roomTagsSelected: ['tag-request'],
      videoFile: {},
    });
    await wrapper.vm.$nextTick();
    wrapper.vm.videoUpload = async () => {
      wrapper.vm.videoFile = null;
      wrapper.vm.videoName = 'uploaded.mp4';
    };
    wrapper.vm.editReply = () =>
      Promise.resolve({ data: { animation: 'server-animation', room_tags: ['tag-response'] } });

    await wrapper.vm.submitReply(false);

    expect(wrapper.emitted()['content-saved']).to.deep.equal([
      [
        {
          contentType: 'reply',
          actionType: 'create',
          presentationAnimation: 'server-animation',
          mediaType: 'video',
          previousTagIds: [],
          nextTagIds: ['tag-response'],
        },
      ],
    ]);
    expect(wrapper.vm.videoFile).to.equal(null);
  });

  it.each([
    [
      '動画',
      'handleVideoChange',
      { name: 'replacement.mp4', type: 'video/mp4', size: 10 },
      'uploadTimelineVideo',
      { video_name: 'replacement.mp4', video_thumbnail_name: 'replacement-thumbnail.png' },
      { image: null, video: { file_name: 'replacement.mp4', thumbnail_name: 'replacement-thumbnail.png', subtitle: null } },
    ],
    [
      '音声',
      'handleAudioChange',
      { name: 'replacement.mp3', type: 'audio/mpeg', size: 10 },
      'uploadTimelineAudio',
      { audio_name: 'replacement.mp3' },
      { image: null, audio: { file_name: 'replacement.mp3', title: null, description: null } },
    ],
  ])('保存済み画像から%sへ切り替えると、画像情報を残さず新しいメディアを更新データへ送る', async (
    _label,
    handler,
    file,
    uploadMethod,
    uploadResponse,
    expectedMedia
  ) => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalUpload = uploadApi[uploadMethod];
    const originalUpdate = chatApi.updateReply;
    let sentPayload = null;
    let wrapper;

    URL.createObjectURL = () => 'blob:replacement';
    uploadApi[uploadMethod] = () => Promise.resolve({ data: uploadResponse });
    chatApi.updateReply = (payload) => {
      sentPayload = payload;
      return Promise.resolve({ data: { ...payload, room_tags: [] } });
    };

    try {
      wrapper = createWrapper({
        props: {
          postValue: { _id: 'post-1', room_tags: [] },
          replyValue: {
            _id: 'reply-1',
            content: 'body',
            animation: null,
            room_tags: [],
            image_name: 'saved.png',
            image_thumbnail_name: 'saved-thumbnail.png',
            image_caption: 'saved caption',
          },
        },
      });
      wrapper.vm.openedDialog();
      wrapper.vm[handler](file);
      await wrapper.vm.$nextTick();

      await wrapper.vm.submitReply(false);

      expect(sentPayload.media).to.deep.equal(expectedMedia);
      expect(sentPayload).not.to.have.property('image_name');
    } finally {
      if (wrapper) wrapper.unmount();
      chatApi.updateReply = originalUpdate;
      uploadApi[uploadMethod] = originalUpload;
      URL.createObjectURL = originalCreateObjectURL;
    }
  });

  it('保存済み画像を維持する返信更新ではメディアを再送しない', async () => {
    const originalUpdate = chatApi.updateReply;
    let sentPayload = null;
    const wrapper = createWrapper({
      props: {
        postValue: { _id: 'post-1', room_tags: [] },
        replyValue: {
          _id: 'reply-1',
          content: 'body',
          animation: null,
          room_tags: [],
          image_name: 'saved.png',
          image_thumbnail_name: 'saved-thumbnail.png',
          image_caption: 'saved caption',
        },
      },
    });
    chatApi.updateReply = (payload) => {
      sentPayload = payload;
      return Promise.resolve({ data: { ...payload, room_tags: [] } });
    };

    try {
      wrapper.vm.openedDialog();
      await wrapper.vm.editReply();

      expect(sentPayload).not.to.have.property('media');
      expect(sentPayload).not.to.have.property('image_name');
      expect(wrapper.vm.imageCaption).to.equal('saved caption');
    } finally {
      chatApi.updateReply = originalUpdate;
      wrapper.unmount();
    }
  });

  it.each([
    ['未選択の音声', 'handleAudioChange', null],
    ['不正形式の動画', 'handleVideoChange', { name: 'invalid.txt', type: 'text/plain', size: 10 }],
  ])('%sでは保存済み画像とキャプションを変更しない', (_label, handler, file) => {
    const wrapper = createWrapper({
      props: {
        postValue: { _id: 'post-1', room_tags: [] },
        replyValue: {
          _id: 'reply-1',
          content: 'body',
          animation: null,
          room_tags: [],
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

  it('録音音声へ切り替えると画像情報を残さず返信更新データへ送る', async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalUpload = uploadApi.uploadTimelineAudio;
    const originalUpdate = chatApi.updateReply;
    let sentPayload = null;
    let wrapper;

    URL.createObjectURL = () => 'blob:recording';
    uploadApi.uploadTimelineAudio = () => Promise.resolve({ data: { audio_name: 'recording.mp3' } });
    chatApi.updateReply = (payload) => {
      sentPayload = payload;
      return Promise.resolve({ data: { ...payload, room_tags: [] } });
    };

    try {
      wrapper = createWrapper({
        props: {
          postValue: { _id: 'post-1', room_tags: [] },
          replyValue: {
            _id: 'reply-1',
            content: 'body',
            animation: null,
            room_tags: [],
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

      await wrapper.vm.submitReply(false);

      expect(sentPayload.media).to.deep.equal({
        image: null,
        audio: { file_name: 'recording.mp3', title: null, description: null },
      });
    } finally {
      if (wrapper) wrapper.unmount();
      chatApi.updateReply = originalUpdate;
      uploadApi.uploadTimelineAudio = originalUpload;
      URL.createObjectURL = originalCreateObjectURL;
    }
  });

  it('録音blobがnullなら保存済み画像とキャプションを変更しない', async () => {
    const wrapper = createWrapper({
      props: {
        postValue: { _id: 'post-1', room_tags: [] },
        replyValue: {
          _id: 'reply-1',
          content: 'body',
          animation: null,
          room_tags: [],
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

  it('通信失敗時のsubmitReplyはPromiseを失敗として返さない', async () => {
    const wrapper = createWrapper();

    wrapper.setData({ content: 'ok' });
    await wrapper.vm.$nextTick();

    const networkError = Object.assign(new Error('Network Error'), {
      isAxiosError: true,
      request: {},
    });
    wrapper.vm.editReply = () => Promise.reject(networkError);

    let rejected = false;
    await wrapper.vm.submitReply(false).catch(() => {
      rejected = true;
    });

    expect(rejected).to.equal(false);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.progressAmount).to.equal(0);
    expect(wrapper.emitted()['content-saved']).to.equal(undefined);
  });

  it('submitReply はアップロード後に4xxで返信を拒否された時だけ未添付メディアを破棄する', async () => {
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
    wrapper.vm.editReply = () =>
      Promise.reject(
        Object.assign(new Error('Bad Request'), {
          isAxiosError: true,
          response: { status: 400 },
        })
      );

    try {
      await wrapper.vm.submitReply(false);
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

  it('想定外のエラー時のsubmitReplyはPromiseを失敗として返す', async () => {
    const wrapper = createWrapper();

    wrapper.setData({ content: 'ok' });
    await wrapper.vm.$nextTick();

    wrapper.vm.editReply = () => Promise.reject(new Error('Unexpected Error'));

    let rejected = false;
    await wrapper.vm.submitReply(false).catch(() => {
      rejected = true;
    });

    expect(rejected).to.equal(true);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.progressAmount).to.equal(0);
  });

  it('guest_reaction_only の Ctrl/Cmd+Enter は流す送信を実行する', () => {
    const wrapper = createWrapper({
      props: { isGuestReactionOnly: true },
    });
    let calledWith = null;
    let prevented = false;
    wrapper.vm.submitReply = (isFlow) => {
      calledWith = isFlow;
    };

    wrapper.vm.handleEditorShortcut({
      ctrlKey: true,
      metaKey: false,
      key: 'Enter',
      keyCode: 13,
      preventDefault: () => {
        prevented = true;
      },
    });

    expect(prevented).to.equal(true);
    expect(calledWith).to.equal(true);
  });

  it('通常ルームの Ctrl/Cmd+Enter は通常返信送信を実行する', () => {
    const wrapper = createWrapper({
      props: { isGuestReactionOnly: false },
    });
    let calledWith = null;
    let prevented = false;
    wrapper.vm.submitReply = (isFlow) => {
      calledWith = isFlow;
    };

    wrapper.vm.handleEditorShortcut({
      ctrlKey: true,
      metaKey: false,
      key: 'Enter',
      keyCode: 13,
      preventDefault: () => {
        prevented = true;
      },
    });

    expect(prevented).to.equal(true);
    expect(calledWith).to.equal(false);
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

  it('返信送信ボタンはタイムラインと同じreplyアイコンを使う', () => {
    const wrapper = createWrapper({
      stubs: {
        UiButton: { template: '<button v-bind="$attrs"><slot /></button>' },
        UiIcon: {
          props: ['name'],
          template: '<span class="ui-icon-stub">{{ name }}</span>',
        },
      },
    });

    const buttons = wrapper.findAll('[data-testid="dialog-edit-reply-submit"]');
    expect(buttons.length).to.equal(2);
    buttons.forEach((button) => {
      const icon = button.find('.ui-icon-stub');
      expect(icon.exists()).to.equal(true);
      expect(icon.text()).to.equal('reply');
      expect(icon.classes()).to.include('reply-submit-icon');
    });

    wrapper.unmount();
  });

  it('流す送信ボタンは各レイアウトで共通の操作識別子を持つ', () => {
    const wrapper = createWrapper({
      stubs: {
        UiButton: { template: '<button v-bind="$attrs"><slot /></button>' },
        UiIcon: true,
      },
    });

    const buttons = wrapper.findAll('[data-testid="dialog-edit-reply-flow-submit"]');
    expect(buttons.length).to.equal(2);

    wrapper.unmount();
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
      router,
      store: createStoreMock({
        dispatch: (type, payload) => dispatchCalls.push({ type, payload }),
      }),
    });
    wrapper.vm.setSnackbar = (message, role) => snackbarCalls.push({ message, role });

    const err = { response: { status: 401 } };
    expect(() => wrapper.vm.handleHttpError(err, '返信に失敗しました')).to.throw();
    expect(dispatchCalls.map((c) => c.type)).to.include('doLogout');
    expect(pushCalls).to.deep.equal([{ name: 'Login' }]);
    expect(snackbarCalls).to.have.lengthOf(1);
    expect(snackbarCalls[0].role).to.equal('alert');
  });
});
