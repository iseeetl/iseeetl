<template>
  <div>
    <FilterDialog
      :dialogVisible="dialogs.filter.visible"
      :filterIndex="dialogs.filter.editIndex"
      :filter="dialogs.filter.editFilter"
      :tags="dialogShared.roomTags"
      :disableWebPush="dialogShared.disableFilterPersistence"
      @create="(payload) => emitEvent('successCreateFilter', payload)"
      @update="(filterIndex, payload) => emitEvent('successUpdateFilter', filterIndex, payload)"
      @close="(...args) => emitEvent('closeFilterDialog', ...args)"
    />

    <EditPostDialog
      ref="EditPostDialog"
      :dialogVisible="dialogs.post.edit.visible"
      :isAnimationPost="dialogs.post.edit.isAnimationPost"
      :propsRoomTags="dialogShared.roomTags"
      :propsPost="dialogs.post.edit.value"
      :targetLangs="dialogShared.targetLangs"
      :isGuestReactionOnly="dialogShared.isGuestReactionOnly"
      :roomQuickTextGroups="dialogShared.quickTextGroups"
      :roomQuickTextItemsByGroup="dialogShared.quickTextItemsByGroup"
      :presetTagIds="dialogs.post.edit.presetTagIds"
      :previousOwnPostTagIds="dialogs.post.edit.previousOwnPostTagIds"
      @content-saved="(payload) => emitEvent('postSaved', payload)"
      @quick-text-inserted="(payload) => emitEvent('postQuickTextInserted', payload)"
      @close="(...args) => emitEvent('closeEditPostDialog', ...args)"
      @doneContinuousPost="emitEvent('doneContinuousPost')"
    />

    <DeletePostDialog
      :dialogVisible="dialogs.post.delete.visible"
      :postValue="dialogs.post.delete.value"
      @content-deleted="(payload) => emitEvent('postDeleted', payload)"
      @close="(...args) => emitEvent('closeDeletePostDialog', ...args)"
    />

    <EditReplyDialog
      ref="EditReplyDialog"
      :dialogVisible="dialogs.reply.edit.visible"
      :roomTags="dialogShared.roomTags"
      :postValue="dialogs.reply.edit.postValue"
      :replyValue="dialogs.reply.edit.value"
      :targetLangs="dialogShared.targetLangs"
      :isGuestReactionOnly="dialogShared.isGuestReactionOnly"
      :roomQuickTextGroups="dialogShared.quickTextGroups"
      :roomQuickTextItemsByGroup="dialogShared.quickTextItemsByGroup"
      @content-saved="(payload) => emitEvent('replySaved', payload)"
      @quick-text-inserted="(payload) => emitEvent('replyQuickTextInserted', payload)"
      @close="(...args) => emitEvent('closeEditReplyDialog', ...args)"
    />

    <DeleteReplyDialog
      :dialogVisible="dialogs.reply.delete.visible"
      :propsPostId="dialogs.reply.delete.postId"
      :propsReplyValue="dialogs.reply.delete.value"
      @content-deleted="(payload) => emitEvent('replyDeleted', payload)"
      @close="(...args) => emitEvent('closeDeleteReplyDialog', ...args)"
    />

    <EditSupplementDialog
      ref="EditSupplementDialog"
      :dialogVisible="dialogs.supplement.edit.visible"
      :postId="dialogs.supplement.edit.postId"
      :replyId="dialogs.supplement.edit.replyId"
      :supplementValue="dialogs.supplement.edit.value"
      :targetLangs="dialogShared.targetLangs"
      :roomQuickTextGroups="dialogShared.quickTextGroups"
      :roomQuickTextItemsByGroup="dialogShared.quickTextItemsByGroup"
      @content-saved="(payload) => emitEvent('supplementSaved', payload)"
      @quick-text-inserted="(payload) => emitEvent('supplementQuickTextInserted', payload)"
      @close="(...args) => emitEvent('closeEditSupplementDialog', ...args)"
    />

    <DeleteSupplementDialog
      :dialogVisible="dialogs.supplement.delete.visible"
      :propsPostId="dialogs.supplement.delete.postId"
      :propsReplyId="dialogs.supplement.delete.replyId"
      :propsSupplement="dialogs.supplement.delete.value"
      @content-deleted="(payload) => emitEvent('supplementDeleted', payload)"
      @close="(...args) => emitEvent('closeDeleteSupplementDialog', ...args)"
    />

    <GalleryDialog
      :dialogVisible="dialogs.gallery.visible"
      :propsValue="dialogs.gallery.value"
      @close="(...args) => emitEvent('closeGalleryDialog', ...args)"
    />

    <LeaveRoomMemberDialog
      :dialogVisible="dialogs.roomMember.leaveVisible"
      :roomId="dialogShared.roomId || ''"
      :roomTitle="dialogShared.roomTitle || dialogShared.roomInfo?.title || ''"
      @success="(...args) => emitEvent('successLeaveRoomMember', ...args)"
      @close="(...args) => emitEvent('closeLeaveRoomMemberDialog', ...args)"
    />

    <EditTagDialog
      :dialogVisible="dialogs.tag.editVisible"
      :propsRoomTags="dialogShared.roomTags"
      :propsPostId="dialogs.tag.postId"
      :propsReplyId="dialogs.tag.replyId"
      :propsTags="dialogs.tag.value"
      @success="(...args) => emitEvent('successEditTag', ...args)"
      @close="(...args) => emitEvent('closeEditTagDialog', ...args)"
    />

    <SoundTagDialog
      :dialogVisible="dialogs.sound.tagVisible"
      :floorId="dialogShared.floorId"
      :roomId="dialogShared.roomId"
      :roomTags="dialogShared.roomTags"
      :soundTagId="dialogs.sound.tagId"
      :soundTags="dialogs.sound.tags"
      @success="(...args) => emitEvent('successEditSoundTag', ...args)"
      @close="(...args) => emitEvent('closeSoundTagDialog', ...args)"
    />

    <SoundCautionConfirm
      :confirmVisible="dialogs.sound.cautionVisible"
      @confirm="(...args) => emitEvent('confirmSoundCaution', ...args)"
      @close="(...args) => emitEvent('closeSoundCautionConfirm', ...args)"
    />

    <SpeechDialog
      :dialogVisible="dialogs.speech.visible"
      @success="(...args) => emitEvent('successSpeechDialog', ...args)"
      @close="(...args) => emitEvent('closeSpeechDialog', ...args)"
    />

    <TimelineSettingDialog
      ref="TimelineSettingDialog"
      :dialogVisible="dialogs.settings.visible"
      @success="(...args) => emitEvent('timelineSettingSaved', ...args)"
      @close="(...args) => emitEvent('closeTimelineSettingDialog', ...args)"
    />

    <RoomInfoDialog
      :dialogVisible="dialogs.roomInfo.visible"
      :roomTitle="dialogShared.roomInfo.title"
      :roomDescription="dialogShared.roomInfo.description"
      :roomCreator="dialogShared.roomInfo.creator"
      :roomCreatedAt="dialogShared.roomInfo.createdAt"
      @close="(...args) => emitEvent('closeRoomInfoDialog', ...args)"
    />

    <EditKickedUserDialog
      :dialogVisible="dialogs.kickedUser.visible"
      :roomId="dialogShared.roomId"
      :floorTitle="dialogShared.floorTitle"
      :kickedUserId="dialogs.kickedUser.id"
      :kickedUserName="dialogs.kickedUser.name"
      @close="(...args) => emitEvent('closeEditKickedUserDialog', ...args)"
    />

    <GuestRulesDialog
      ref="GuestRulesDialog"
      :dialogVisible="dialogs.guestRules.visible"
      @success="(...args) => emitEvent('successGuestRules', ...args)"
      @close="(...args) => emitEvent('closeGuestRulesDialog', ...args)"
    />
  </div>
</template>

<script>
import LeaveRoomMemberDialog from '@/components/room-member/LeaveRoomMemberDialog.vue';

import FilterDialog from '@/components/timeline/dialogs/FilterDialog.vue';
import EditPostDialog from '@/components/timeline/dialogs/EditPostDialog.vue';
import DeletePostDialog from '@/components/timeline/dialogs/DeletePostDialog.vue';
import EditReplyDialog from '@/components/timeline/dialogs/EditReplyDialog.vue';
import DeleteReplyDialog from '@/components/timeline/dialogs/DeleteReplyDialog.vue';
import EditSupplementDialog from '@/components/timeline/dialogs/EditSupplementDialog.vue';
import DeleteSupplementDialog from '@/components/timeline/dialogs/DeleteSupplementDialog.vue';
import GalleryDialog from '@/components/timeline/dialogs/GalleryDialog.vue';
import EditTagDialog from '@/components/timeline/dialogs/EditTagDialog.vue';
import SoundTagDialog from '@/components/timeline/dialogs/SoundTagDialog.vue';
import SoundCautionConfirm from '@/components/timeline/dialogs/SoundCautionConfirm.vue';
import SpeechDialog from '@/components/timeline/dialogs/SpeechDialog.vue';
import TimelineSettingDialog from '@/components/timeline/dialogs/TimelineSettingDialog.vue';
import RoomInfoDialog from '@/components/timeline/dialogs/RoomInfoDialog.vue';
import GuestRulesDialog from '@/components/timeline/dialogs/GuestRulesDialog.vue';

import EditKickedUserDialog from '@/components/kicked-user/EditKickedUserDialog.vue';

export default {
  emits: ['dialog-event'],
  name: 'TimelineDialogs',
  components: {
    FilterDialog,
    EditPostDialog,
    DeletePostDialog,
    EditReplyDialog,
    DeleteReplyDialog,
    EditSupplementDialog,
    DeleteSupplementDialog,
    GalleryDialog,
    LeaveRoomMemberDialog,
    EditTagDialog,
    SoundTagDialog,
    SoundCautionConfirm,
    SpeechDialog,
    TimelineSettingDialog,
    RoomInfoDialog,
    EditKickedUserDialog,
    GuestRulesDialog,
  },
  props: {
    dialogs: {
      type: Object,
      default: () => ({
        filter: {},
        post: { edit: {}, delete: {} },
        reply: { edit: {}, delete: {} },
        supplement: { edit: {}, delete: {} },
        gallery: {},
        roomMember: {},
        tag: {},
        sound: {},
        speech: {},
        settings: {},
        roomInfo: {},
        kickedUser: {},
        guestRules: {},
      }),
    },
    dialogShared: {
      type: Object,
      default: () => ({
        roomId: null,
        roomTitle: '',
        floorId: null,
        floorTitle: '',
        roomTags: [],
        targetLangs: null,
        quickTextGroups: [],
        quickTextItemsByGroup: Object.create(null),
        isGuestReactionOnly: false,
        roomInfo: {},
      }),
    },
  },
  data() {
    return {};
  },
  methods: {
    // イベントの引数を省略せず、受け取った順に親へ渡す。
    emitEvent(eventName, ...payload) {
      this.$emit('dialog-event', eventName, ...payload);
    },

    openEditPostDialogAndFocus() {
      this.$refs.EditPostDialog.openAndFocus();
    },
    openEditReplyDialogAndFocus() {
      this.$refs.EditReplyDialog.openAndFocus();
    },
    openEditSupplementDialogAndFocus() {
      this.$refs.EditSupplementDialog.openAndFocus();
    },
  },
};
</script>
