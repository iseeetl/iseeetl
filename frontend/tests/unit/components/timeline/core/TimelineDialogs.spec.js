import { expect } from 'vitest';
import { shallowMount } from '../../../helpers/testUtils';
import TimelineDialogs from '@/components/timeline/core/TimelineDialogs.vue';

const createStubComponent = (name) => ({
  name,
  template: '<div></div>',
  data: () => ({ openAndFocusCalls: 0 }),
  methods: {
    openAndFocus() {
      this.openAndFocusCalls += 1;
    },
  },
});

const LeaveRoomMemberDialogStub = {
  name: 'LeaveRoomMemberDialog',
  props: ['dialogVisible', 'roomId', 'roomTitle'],
  template: '<div />',
};

const EditKickedUserDialogStub = {
  name: 'EditKickedUserDialog',
  props: ['dialogVisible', 'roomId', 'floorTitle', 'kickedUserId', 'kickedUserName'],
  template: '<div />',
};

const createDialogs = () => ({
  filter: { visible: false, editIndex: 0, editFilter: null },
  post: {
    edit: { visible: false, isAnimationPost: false, value: null, presetTagIds: [] },
    delete: { visible: false, value: null },
  },
  reply: {
    edit: { visible: false, postValue: null, value: null },
    delete: { visible: false, postId: null, value: null },
  },
  supplement: {
    edit: { visible: false, postId: null, replyId: null, value: null },
    delete: { visible: false, postId: null, replyId: null, value: null },
  },
  gallery: { visible: false, value: null },
  roomMember: {
    leaveVisible: false,
  },
  tag: { editVisible: false, postId: null, replyId: null, value: null },
  sound: { tagVisible: false, tagId: null, tags: [], cautionVisible: false },
  speech: { visible: false },
  settings: { visible: false },
  roomInfo: { visible: false },
  kickedUser: { visible: false, id: null, name: null },
  guestRules: { visible: false },
});

const createDialogShared = () => ({
  roomId: 'room-1',
  roomTitle: 'Room title',
  floorId: null,
  floorTitle: 'Floor title',
  roomTags: [],
  targetLangs: null,
  quickTextGroups: [],
  quickTextItemsByGroup: {},
  isGuestReactionOnly: false,
  roomInfo: { title: '', description: '', creator: '', createdAt: '' },
});

const createWrapper = (overrides = {}) =>
  shallowMount(TimelineDialogs, {
    stubs: {
      FilterDialog: createStubComponent('FilterDialog'),
      EditPostDialog: createStubComponent('EditPostDialog'),
      DeletePostDialog: createStubComponent('DeletePostDialog'),
      EditReplyDialog: createStubComponent('EditReplyDialog'),
      DeleteReplyDialog: createStubComponent('DeleteReplyDialog'),
      EditSupplementDialog: createStubComponent('EditSupplementDialog'),
      DeleteSupplementDialog: createStubComponent('DeleteSupplementDialog'),
      GalleryDialog: createStubComponent('GalleryDialog'),
      LeaveRoomMemberDialog: LeaveRoomMemberDialogStub,
      EditTagDialog: createStubComponent('EditTagDialog'),
      SoundTagDialog: createStubComponent('SoundTagDialog'),
      SoundCautionConfirm: createStubComponent('SoundCautionConfirm'),
      SpeechDialog: createStubComponent('SpeechDialog'),
      TimelineSettingDialog: createStubComponent('TimelineSettingDialog'),
      RoomInfoDialog: createStubComponent('RoomInfoDialog'),
      EditKickedUserDialog: EditKickedUserDialogStub,
      GuestRulesDialog: createStubComponent('GuestRulesDialog'),
    },
    props: {
      dialogs: createDialogs(),
      dialogShared: createDialogShared(),
      ...(overrides.props || {}),
    },
  });

describe('タイムラインのダイアログ連携', () => {
  it('ルームメンバー脱退へ対象ルームIDと表示名を渡す', () => {
    const wrapper = createWrapper();
    const dialog = wrapper.findComponent(LeaveRoomMemberDialogStub);

    expect(dialog.props()).to.include({
      roomId: 'room-1',
      roomTitle: 'Room title',
    });
  });

  it('ユーザキックへ対象ルームIDとフロア表示名を渡す', () => {
    const wrapper = createWrapper();
    const dialog = wrapper.findComponent(EditKickedUserDialogStub);

    expect(dialog.props()).to.include({
      roomId: 'room-1',
      floorTitle: 'Floor title',
    });
  });

  it('emitEventはdialog-eventとして親に通知する', () => {
    const wrapper = createWrapper();
    wrapper.vm.emitEvent('closeDialog', { id: 1 }, 'extra');

    expect(wrapper.emitted()['dialog-event'][0]).to.deep.equal(['closeDialog', { id: 1 }, 'extra']);
  });

  it.each([
    ['EditPostDialog', 'content-saved', 'postSaved'],
    ['EditPostDialog', 'quick-text-inserted', 'postQuickTextInserted'],
    ['DeletePostDialog', 'content-deleted', 'postDeleted'],
    ['EditReplyDialog', 'content-saved', 'replySaved'],
    ['EditReplyDialog', 'quick-text-inserted', 'replyQuickTextInserted'],
    ['DeleteReplyDialog', 'content-deleted', 'replyDeleted'],
    ['EditSupplementDialog', 'content-saved', 'supplementSaved'],
    ['EditSupplementDialog', 'quick-text-inserted', 'supplementQuickTextInserted'],
    ['DeleteSupplementDialog', 'content-deleted', 'supplementDeleted'],
    ['SoundCautionConfirm', 'confirm', 'confirmSoundCaution'],
    ['TimelineSettingDialog', 'success', 'timelineSettingSaved'],
  ])('%sの%sを%sとして中継する', (componentName, childEvent, parentEvent) => {
    const wrapper = createWrapper();
    const payload = { marker: parentEvent };

    wrapper.findComponent({ name: componentName }).vm.$emit(childEvent, payload);

    expect(wrapper.emitted()['dialog-event']).to.deep.equal([[parentEvent, payload]]);
  });

  it('openEditPostDialogAndFocusは対象ダイアログのopenAndFocusを呼ぶ', () => {
    const wrapper = createWrapper();

    wrapper.vm.openEditPostDialogAndFocus();

    expect(wrapper.vm.$refs.EditPostDialog.openAndFocusCalls).to.equal(1);
  });

  it('openEditReplyDialogAndFocusは対象ダイアログのopenAndFocusを呼ぶ', () => {
    const wrapper = createWrapper();

    wrapper.vm.openEditReplyDialogAndFocus();

    expect(wrapper.vm.$refs.EditReplyDialog.openAndFocusCalls).to.equal(1);
  });

  it('openEditSupplementDialogAndFocusは対象ダイアログのopenAndFocusを呼ぶ', () => {
    const wrapper = createWrapper();

    wrapper.vm.openEditSupplementDialogAndFocus();

    expect(wrapper.vm.$refs.EditSupplementDialog.openAndFocusCalls).to.equal(1);
  });
});
