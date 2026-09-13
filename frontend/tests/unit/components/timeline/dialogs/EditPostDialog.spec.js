import { expect } from 'vitest';
import { setTestRoute, shallowMount } from '../../../helpers/testUtils';
import { createMemoryHistory, createRouter as createVueRouter } from 'vue-router';
import chatApi from '@/api/chat';
import uploadApi from '@/api/upload';
import UiButton from '@/components/ui/UiButton.vue';
import EditPostDialog from '@/components/timeline/dialogs/EditPostDialog.vue';
import {
  MAX_AUDIO_DURATION_IN_SECONDS,
  MAX_AUDIO_SIZE_IN_BYTES,
  MAX_VIDEO_SIZE_IN_BYTES,
} from '@/constants/mediaConstants';


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
  shallowMount(EditPostDialog, {
    stubs: { ...baseStubs, ...(overrides.stubs || {}) },
    router: overrides.router || createRouter({ route: overrides.route }),
    props: {
      dialogVisible: true,
      isAnimationPost: false,
      propsRoomTags: [],
      propsPost: null,
      targetLangs: [],
      isGuestReactionOnly: false,
      presetTagIds: [],
      previousOwnPostTagIds: [],
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

describe('投稿の作成・編集', () => {
  it('本文だけの編集では保存言語・添付を再送せず、開いた時点との差分を送る', async () => {
    const originalUpdate = chatApi.updatePost;
    const calls = [];
    chatApi.updatePost = (body) => { calls.push(body); return Promise.resolve({ data: { room_tags: [] } }); };
    const wrapper = createWrapper({ props: { propsPost: {
      _id: 'post', content: 'before', lang: 'en', room_tags: [], animation: null,
      image_name: 'image.png', image_thumbnail_name: 'thumbnail.png', image_caption: 'caption',
    } } });
    try {
      wrapper.vm.openedDialog();
      wrapper.vm.content = 'after';
      await wrapper.vm.editPost();
      expect(calls).to.deep.equal([{ room_id: 'room-1', _id: 'post', content: 'after' }]);
    } finally { chatApi.updatePost = originalUpdate; wrapper.unmount(); }
  });

  it('コメント入力欄は4行分を確保し共通カウンターを使用する', () => {
    const wrapper = createWrapper();
    const field = wrapper.find('.timeline-comment-field');

    expect(field.attributes('data-counter-enabled')).to.equal('true');
    expect(wrapper.find('#post_content').attributes('rows')).to.equal('4');
    expect(wrapper.find('.text-count').exists()).to.equal(false);
  });

  it('外部サービス利用可否にかかわらず全ルームタグを選択・送信できる', () => {
    const roomTags = [
      { _id: 'normal', name: '通常', order: 1 },
      { _id: 'analysis', name: '画像解析', order: 2 },
    ];
    const wrapper = createWrapper({
      props: { propsRoomTags: roomTags, presetTagIds: ['normal', 'analysis'] },
      store: createStoreMock({ getters: { openaiAnalysisAvailable: false } }),
    });

    wrapper.vm.openedDialog();

    expect(wrapper.findComponent({ name: 'TagSelector' }).props('tags').map((tag) => tag._id)).to.deep.equal([
      'normal',
      'analysis',
    ]);
    expect(wrapper.vm.roomTags).to.deep.equal(['normal', 'analysis']);
    expect(wrapper.vm.submittableRoomTagIds).to.deep.equal(['normal', 'analysis']);
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

  it('投稿用MediaInputへ固定prefixを渡す', () => {
    const wrapper = createWrapper();
    expect(wrapper.findComponent({ name: 'MediaInput' }).props('idPrefix')).to.equal('timeline-post-media');
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

  it('handleEditorShortcutはCtrl+Enterで通常投稿を実行する', () => {
    const wrapper = createWrapper();
    let submitArgument = 'not-called';
    let prevented = false;
    wrapper.vm.submit = (argument) => {
      submitArgument = argument;
    };

    wrapper.vm.handleEditorShortcut({
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      key: 'Enter',
      keyCode: 13,
      preventDefault: () => {
        prevented = true;
      },
    });

    expect(prevented).to.equal(true);
    expect(submitArgument).to.equal(undefined);
  });

  it('insertReaction はカーソル位置に追加する', async () => {
    const wrapper = createWrapper();
    let focused = false;
    let selectionArgs = null;
    const textarea = wrapper.vm.$refs.postContentRef;
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
    const titleButton = wrapper.find('[data-testid="dialog-edit-post-tags-title-toggle"]');

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
    const titleButton = wrapper.find('[data-testid="dialog-edit-post-quicktext-title-toggle-g1"]');
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
      [{ contentType: 'post', quickTextId: 'quick-1', quickTextLabel: 'base label' }],
    ]);
    expect(wrapper.emitted()['content-saved']).to.equal(undefined);
  });

  it('空の単語の選択やダイアログを閉じる操作では成功の計測イベントを通知しない', () => {
    const wrapper = createWrapper();

    wrapper.vm.selectQuickTextItem({ _id: 'quick-empty', label: '', lang: 'ja' });
    wrapper.vm.closedDialog({ focusRestored: true });

    expect(wrapper.emitted()['quick-text-inserted']).to.equal(undefined);
    expect(wrapper.emitted()['content-saved']).to.equal(undefined);
    expect(wrapper.emitted().close).to.deep.equal([[{ focusRestored: true }]]);
  });

  it('新規投稿では自分の直前の投稿のタグを初期選択する', () => {
    const wrapper = createWrapper({
      props: { previousOwnPostTagIds: ['prev'] },
      store: createStoreMock({ getters: { tagList: ['store'] } }),
    });
    wrapper.vm.openedDialog();

    expect(wrapper.vm.roomTags).to.deep.equal(['prev']);
  });

  it('新規投稿では自分の直前の投稿のタグより絞り込みカラムのタグを優先する', () => {
    const wrapper = createWrapper({
      props: { presetTagIds: ['preset'], previousOwnPostTagIds: ['prev'] },
      store: createStoreMock({ getters: { tagList: ['store'] } }),
    });
    wrapper.vm.openedDialog();

    expect(wrapper.vm.roomTags).to.deep.equal(['preset']);
  });

  it('自分の投稿が無い新規投稿ではstore.tag.listへフォールバックしない', () => {
    const wrapper = createWrapper({
      props: { previousOwnPostTagIds: [] },
      store: createStoreMock({ getters: { tagList: ['store'] } }),
    });
    wrapper.vm.openedDialog();

    expect(wrapper.vm.roomTags).to.deep.equal([]);
  });

  it('投稿編集では編集対象投稿のタグを使用する', () => {
    const wrapper = createWrapper({
      props: {
        presetTagIds: ['preset'],
        previousOwnPostTagIds: ['prev'],
        propsPost: { _id: 'post-1', content: 'body', animation: null, room_tags: ['edit'] },
      },
    });
    wrapper.vm.openedDialog();

    expect(wrapper.vm.roomTags).to.deep.equal(['edit']);
  });

  it('新規投稿で前回のタグを選ぶ候補には自分の直前の投稿のタグを使う', () => {
    const wrapper = createWrapper({
      props: { previousOwnPostTagIds: ['prev'] },
      store: createStoreMock({ getters: { tagList: ['store'] } }),
    });

    expect(wrapper.vm.previousTagSelectorTags).to.deep.equal(['prev']);
  });

  it('投稿編集の前回投稿ボタン候補はstore.tag.listを使う', () => {
    const wrapper = createWrapper({
      props: {
        propsPost: { _id: 'post-1', content: 'body', animation: null, room_tags: ['edit'] },
        previousOwnPostTagIds: ['prev'],
      },
      store: createStoreMock({ getters: { tagList: ['store'] } }),
    });

    expect(wrapper.vm.previousTagSelectorTags).to.deep.equal(['store']);
  });

  it('本文が上限超過なら投稿を行わない', async () => {
    const wrapper = createWrapper();

    let editCount = 0;
    wrapper.vm.editPost = () => {
      editCount += 1;
      return Promise.resolve();
    };
    wrapper.vm.editGuestPost = () => {
      editCount += 1;
      return Promise.resolve();
    };

    wrapper.setData({ content: 'a'.repeat(401) });
    await wrapper.vm.$nextTick();

    await wrapper.vm.submit();

    expect(editCount).to.equal(0);
    expect(wrapper.emitted()['content-saved']).to.equal(undefined);
  });

  it('投稿更新成功は応答値とアップロード前スナップショットをclear前に通知する', async () => {
    const wrapper = createWrapper({
      props: {
        propsPost: {
          _id: 'post-1',
          content: 'before',
          animation: 'client-animation',
          room_tags: ['tag-before'],
        },
      },
    });
    wrapper.vm.openedDialog();
    wrapper.setData({ content: 'after', imageFile: {}, roomTags: ['tag-request'] });
    await wrapper.vm.$nextTick();
    wrapper.vm.imageUpload = async () => {
      wrapper.vm.imageFile = null;
      wrapper.vm.imageName = 'uploaded.png';
    };
    wrapper.vm.editPost = () =>
      Promise.resolve({ data: { animation: null, room_tags: ['tag-response'] } });

    await wrapper.vm.submit(false);

    expect(wrapper.emitted()['content-saved']).to.deep.equal([
      [
        {
          contentType: 'post',
          actionType: 'update',
          presentationAnimation: null,
          mediaType: 'image',
          previousTagIds: ['tag-before'],
          nextTagIds: ['tag-response'],
        },
      ],
    ]);
    expect(wrapper.vm.imageFile).to.equal(null);
    expect(wrapper.vm.postId).to.equal(null);
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
    const originalUpdate = chatApi.updatePost;
    let sentPayload = null;
    let wrapper;

    URL.createObjectURL = () => 'blob:replacement';
    uploadApi[uploadMethod] = () => Promise.resolve({ data: uploadResponse });
    chatApi.updatePost = (payload) => {
      sentPayload = payload;
      return Promise.resolve({ data: { ...payload, room_tags: [] } });
    };

    try {
      wrapper = createWrapper({
        props: {
          propsPost: {
            _id: 'post-1',
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

      await wrapper.vm.submit(false);

      expect(sentPayload.media).to.deep.equal(expectedMedia);
      expect(sentPayload).not.to.have.property('image_name');
    } finally {
      if (wrapper) wrapper.unmount();
      chatApi.updatePost = originalUpdate;
      uploadApi[uploadMethod] = originalUpload;
      URL.createObjectURL = originalCreateObjectURL;
    }
  });

  it('保存済み画像を維持する投稿更新ではメディアを再送しない', async () => {
    const originalUpdate = chatApi.updatePost;
    let sentPayload = null;
    const wrapper = createWrapper({
      props: {
        propsPost: {
          _id: 'post-1',
          content: 'body',
          animation: null,
          room_tags: [],
          image_name: 'saved.png',
          image_thumbnail_name: 'saved-thumbnail.png',
          image_caption: 'saved caption',
        },
      },
    });
    chatApi.updatePost = (payload) => {
      sentPayload = payload;
      return Promise.resolve({ data: { ...payload, room_tags: [] } });
    };

    try {
      wrapper.vm.openedDialog();
      await wrapper.vm.editPost();

      expect(sentPayload).not.to.have.property('media');
      expect(sentPayload).not.to.have.property('image_name');
      expect(wrapper.vm.imageCaption).to.equal('saved caption');
    } finally {
      chatApi.updatePost = originalUpdate;
      wrapper.unmount();
    }
  });

  it.each([
    ['未選択の音声', 'handleAudioChange', null],
    ['不正形式の動画', 'handleVideoChange', { name: 'invalid.txt', type: 'text/plain', size: 10 }],
  ])('%sでは保存済み画像とキャプションを変更しない', (_label, handler, file) => {
    const wrapper = createWrapper({
      props: {
        propsPost: {
          _id: 'post-1',
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

  it('録音音声へ切り替えると画像情報を残さず投稿更新データへ送る', async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalUpload = uploadApi.uploadTimelineAudio;
    const originalUpdate = chatApi.updatePost;
    let sentPayload = null;
    let wrapper;

    URL.createObjectURL = () => 'blob:recording';
    uploadApi.uploadTimelineAudio = () => Promise.resolve({ data: { audio_name: 'recording.mp3' } });
    chatApi.updatePost = (payload) => {
      sentPayload = payload;
      return Promise.resolve({ data: { ...payload, room_tags: [] } });
    };

    try {
      wrapper = createWrapper({
        props: {
          propsPost: {
            _id: 'post-1',
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

      await wrapper.vm.submit(false);

      expect(sentPayload.media).to.deep.equal({
        image: null,
        audio: { file_name: 'recording.mp3', title: null, description: null },
      });
    } finally {
      if (wrapper) wrapper.unmount();
      chatApi.updatePost = originalUpdate;
      uploadApi.uploadTimelineAudio = originalUpload;
      URL.createObjectURL = originalCreateObjectURL;
    }
  });

  it('録音blobがnullなら保存済み画像とキャプションを変更しない', async () => {
    const wrapper = createWrapper({
      props: {
        propsPost: {
          _id: 'post-1',
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

  it('通信失敗時のsubmitはPromiseを失敗として返さない', async () => {
    const wrapper = createWrapper();

    wrapper.setData({ content: 'ok' });
    await wrapper.vm.$nextTick();

    const networkError = Object.assign(new Error('Network Error'), {
      isAxiosError: true,
      request: {},
    });
    wrapper.vm.editPost = () => Promise.reject(networkError);

    let rejected = false;
    await wrapper.vm.submit(false).catch(() => {
      rejected = true;
    });

    expect(rejected).to.equal(false);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.progressAmount).to.equal(0);
    expect(wrapper.emitted()['content-saved']).to.equal(undefined);
  });

  it('submit はアップロード後に4xxで投稿を拒否された時だけ未添付メディアを破棄する', async () => {
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
    wrapper.vm.editPost = () =>
      Promise.reject(
        Object.assign(new Error('Bad Request'), {
          isAxiosError: true,
          response: { status: 400 },
        })
      );

    try {
      await wrapper.vm.submit(false);
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

  it('submit は通信断または5xxなら保存成否不明のため即時破棄しない', async () => {
    const originalDiscard = uploadApi.discardTimelineMedia;
    const calls = [];
    uploadApi.discardTimelineMedia = (payload) => {
      calls.push(payload);
      return Promise.resolve();
    };
    const errors = [
      Object.assign(new Error('Network Error'), {
        isAxiosError: true,
        request: {},
      }),
      Object.assign(new Error('Server Error'), {
        isAxiosError: true,
        response: { status: 500 },
      }),
    ];

    try {
      for (const error of errors) {
        const wrapper = createWrapper();
        wrapper.setData({ content: 'ok', imageFile: {} });
        await wrapper.vm.$nextTick();
        wrapper.vm.imageUpload = async () => {
          wrapper.vm.imageFile = null;
          wrapper.vm.imageName = 'image.png';
          wrapper.vm.imageThumbnailName = 'thumb.png';
        };
        wrapper.vm.editPost = () => Promise.reject(error);

        await wrapper.vm.submit(false);
      }

      expect(calls).to.deep.equal([]);
    } finally {
      uploadApi.discardTimelineMedia = originalDiscard;
    }
  });

  it('想定外のエラー時のsubmitはPromiseを失敗として返す', async () => {
    const wrapper = createWrapper();

    wrapper.setData({ content: 'ok' });
    await wrapper.vm.$nextTick();

    wrapper.vm.editPost = () => Promise.reject(new Error('Unexpected Error'));

    let rejected = false;
    await wrapper.vm.submit(false).catch(() => {
      rejected = true;
    });

    expect(rejected).to.equal(true);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.progressAmount).to.equal(0);
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

  it('動画サイズが上限超過ならメディア検証で中断する', () => {
    const wrapper = createWrapper();

    const snackbar = [];
    wrapper.vm.setSnackbar = (message, role) => {
      snackbar.push({ message, role });
    };

    wrapper.setData({
      videoFile: {},
      videoSize: MAX_VIDEO_SIZE_IN_BYTES + 1,
      videoDuration: 0,
    });

    const ok = wrapper.vm.validateMedia();

    expect(ok).to.equal(false);
    expect(snackbar[0].role).to.equal('alert');
    expect(snackbar[0].message).to.be.a('string');
    expect(snackbar[0].message).to.not.equal('');
  });

  it('音声時間が上限超過ならメディア検証で中断する', () => {
    const wrapper = createWrapper();

    const snackbar = [];
    wrapper.vm.setSnackbar = (message, role) => {
      snackbar.push({ message, role });
    };

    wrapper.setData({
      audioFile: {},
      audioSize: MAX_AUDIO_SIZE_IN_BYTES,
      audioDuration: MAX_AUDIO_DURATION_IN_SECONDS + 1,
    });

    const ok = wrapper.vm.validateMedia();

    expect(ok).to.equal(false);
    expect(snackbar[0].role).to.equal('alert');
    expect(snackbar[0].message).to.be.a('string');
    expect(snackbar[0].message).to.not.equal('');
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
    expect(() => wrapper.vm.handleHttpError(err, '投稿に失敗しました')).to.throw();
    expect(dispatchCalls.map((c) => c.type)).to.include('doLogout');
    expect(pushCalls).to.deep.equal([{ name: 'Login' }]);
    expect(snackbarCalls).to.have.lengthOf(1);
    expect(snackbarCalls[0].role).to.equal('alert');
  });
});
