import tagApi from '@/api/tag';
import { appendApiErrorMessage } from '@/api/apiClient';
import { handleAuthError } from '@/utils/authError';
import { playNotificationAudio } from '@/features/timeline/audio';

const captureOperation = (context) =>
  typeof context.captureTimelineOperation === 'function'
    ? context.captureTimelineOperation()
    : null;

const reportOperation = (context, token, operation) =>
  typeof context.reportTimelineOperation === 'function'
    ? context.reportTimelineOperation(token, operation)
    : false;

export const timelineDialogMethods = {
  async showEditPostDialog(post = null, isAnimationPost = false, tagIds = []) {
    if (!(await this.ensureGuestRules())) return;

    this.dialogs.post.edit.presetTagIds = Array.isArray(tagIds) ? tagIds : [];
    this.dialogs.post.edit.previousOwnPostTagIds = post === null ? this.getPreviousOwnPostTagIds() : [];
    this.dialogs.post.edit.value = post;
    this.dialogs.post.edit.isAnimationPost = isAnimationPost;
    this.dialogs.post.edit.operationToken = captureOperation(this);
    this.setTargetLangs();
    this.dialogs.post.edit.visible = true;
    this.$refs.dialogsRef.openEditPostDialogAndFocus();
  },
  closeEditPostDialog() {
    Object.assign(this.dialogs.post.edit, {
      visible: false,
      value: null,
      isAnimationPost: false,
      presetTagIds: [],
      previousOwnPostTagIds: [],
      operationToken: null,
    });
  },
  handleContinuousPost() {
    Object.assign(this.dialogs.post.edit, {
      visible: false,
      value: null,
      isAnimationPost: false,
      previousOwnPostTagIds: this.getPreviousOwnPostTagIds(),
    });
    this.$nextTick(() => {
      this.dialogs.post.edit.visible = true;
    });
  },
  showDeletePostDialog(post) {
    Object.assign(this.dialogs.post.delete, {
      visible: true,
      value: post,
      operationToken: captureOperation(this),
    });
  },
  closeDeletePostDialog() {
    Object.assign(this.dialogs.post.delete, { visible: false, value: null, operationToken: null });
  },
  async showEditReplyDialog(post, reply) {
    if (!(await this.ensureGuestRules())) return;
    Object.assign(this.dialogs.reply.edit, {
      postValue: post,
      value: reply,
      operationToken: captureOperation(this),
    });
    this.setTargetLangs();
    this.dialogs.reply.edit.visible = true;
    this.$refs.dialogsRef.openEditReplyDialogAndFocus();
  },
  closeEditReplyDialog() {
    Object.assign(this.dialogs.reply.edit, {
      visible: false,
      postValue: null,
      value: null,
      operationToken: null,
    });
  },
  showDeleteReplyDialog(postId, reply) {
    Object.assign(this.dialogs.reply.delete, {
      visible: true,
      postId,
      value: reply,
      operationToken: captureOperation(this),
    });
  },
  closeDeleteReplyDialog() {
    Object.assign(this.dialogs.reply.delete, {
      visible: false,
      postId: null,
      value: null,
      operationToken: null,
    });
  },
  showEditSupplementDialog(postId, replyId, supplement) {
    Object.assign(this.dialogs.supplement.edit, {
      postId,
      replyId,
      value: supplement,
      operationToken: captureOperation(this),
    });
    this.setTargetLangs();
    this.dialogs.supplement.edit.visible = true;
    this.$refs.dialogsRef.openEditSupplementDialogAndFocus();
  },
  closeEditSupplementDialog() {
    Object.assign(this.dialogs.supplement.edit, {
      visible: false,
      postId: null,
      replyId: null,
      value: null,
      operationToken: null,
    });
  },
  showDeleteSupplementDialog(postId, replyId, supplement) {
    Object.assign(this.dialogs.supplement.delete, {
      visible: true,
      postId,
      replyId,
      value: supplement,
      operationToken: captureOperation(this),
    });
  },
  closeDeleteSupplementDialog() {
    Object.assign(this.dialogs.supplement.delete, {
      visible: false,
      postId: null,
      replyId: null,
      value: null,
      operationToken: null,
    });
  },
  showEditTagDialog(id, tagValue) {
    this.setTargetLangs();
    Object.assign(this.dialogs.tag, {
      postId: id.post_id,
      replyId: id.reply_id,
      value: tagValue,
      editVisible: true,
      operationToken: captureOperation(this),
    });
  },
  successEditTag(result) {
    reportOperation(this, this.dialogs.tag.operationToken, {
      kind: 'tag_change',
      content: this.dialogs.tag.replyId ? 'reply' : 'post',
      beforeTagIds: this.dialogs.tag.value,
      afterTagIds: result?.room_tags,
    });
  },
  closeEditTagDialog() {
    Object.assign(this.dialogs.tag, {
      editVisible: false,
      postId: null,
      replyId: null,
      value: null,
      operationToken: null,
    });
  },
  showGalleryDialog(value) {
    Object.assign(this.dialogs.gallery, { visible: true, value });
  },
  closeGalleryDialog() {
    Object.assign(this.dialogs.gallery, { visible: false, value: null });
  },
  showEditKickedUserDialog(id, name) {
    Object.assign(this.dialogs.kickedUser, { visible: true, id, name });
  },
  closeEditKickedUserDialog() {
    Object.assign(this.dialogs.kickedUser, { visible: false, id: null, name: null });
  },
  deleteRoomMember() {
    this.$router.push({ path: `/floor/${this.$store.getters.floorId}` });
  },
  showLeaveRoomMemberDialog() {
    this.dialogs.roomMember.leaveVisible = true;
  },
  successLeaveRoomMember() {
    this.dialogs.roomMember.leaveVisible = false;
    this.$router.push({ path: `/floor/${this.$store.getters.floorId}` });
  },
  closeLeaveRoomMemberDialog() {
    this.dialogs.roomMember.leaveVisible = false;
  },
  showRoomInfoDialog() {
    this.dialogs.roomInfo.visible = true;
  },
  closeRoomInfoDialog() {
    this.dialogs.roomInfo.visible = false;
  },
  fetchSoundTag() {
    if (this.timeline.sending) return;
    this.timeline.sending = true;
    tagApi.soundTag
      .fetch({ floor_id: this.$store.getters.floorId, room_id: this.$store.getters.roomId })
      .then((response) => {
        if (response.data !== null) {
          this.dialogs.sound.tagId = response.data._id;
          this.dialogs.sound.tags = response.data.tags;
        }
      })
      .catch((error) => {
        const message = appendApiErrorMessage(this.$t('音を鳴らすタグの取得に失敗しました'), error, {
          translate: this.$t,
        });
        this.setSnackbar(message, 'alert');
        return handleAuthError(error, { store: this.$store, router: this.$router });
      })
      .finally(() => {
        this.timeline.sending = false;
      });
  },
  showSoundTagDialog() {
    this.dialogs.sound.tagVisible = true;
  },
  successEditSoundTag(responseData) {
    Object.assign(this.dialogs.sound, {
      tagId: responseData._id,
      tags: responseData.tags,
      tagVisible: false,
    });
  },
  closeSoundTagDialog(payload = {}) {
    this.dialogs.sound.tagVisible = false;
    if (this.dialogs.sound.tags.length > 0) {
      this.showSoundCautionConfirm();
    } else if (payload.focusRestored === false) {
      this.focusSoundTagButton();
    }
  },
  showSoundCautionConfirm() {
    this.dialogs.sound.cautionVisible = true;
  },
  confirmSoundCaution() {
    this.ui.audio.notificationPlaybackErrorShown = false;
    return playNotificationAudio({
      audioRef: this.$refs.newAudio,
      onSuccess: () => this.handleNotificationAudioSuccess(),
      onError: () => this.handleNotificationAudioError(),
    });
  },
  handleNotificationAudioSuccess() {
    this.ui.audio.notificationPlaybackErrorShown = false;
  },
  handleNotificationAudioError() {
    if (this.ui.audio.notificationPlaybackErrorShown) return;
    this.ui.audio.notificationPlaybackErrorShown = true;
    this.setSnackbar(
      this.$t('通知音を再生できませんでした。ブラウザの音声設定を確認して、もう一度お試しください'),
      'alert'
    );
  },
  closeSoundCautionConfirm(payload = {}) {
    this.dialogs.sound.cautionVisible = false;
    if (payload.focusRestored === false) this.focusSoundTagButton();
  },
  focusSoundTagButton() {
    this.$nextTick(() => {
      const header = this.$refs.normalViewRef?.$refs?.timelineHeaderRef;
      if (header && typeof header.focusSoundTagButton === 'function') header.focusSoundTagButton();
    });
  },
  showFilterDialog(index = null, filter = null) {
    Object.assign(this.dialogs.filter, { editIndex: index, editFilter: filter, visible: true });
  },
  closeFilterDialog() {
    Object.assign(this.dialogs.filter, { visible: false, editIndex: null, editFilter: null });
  },
  showTimelineSettingDialog() {
    Object.assign(this.dialogs.settings, {
      visible: true,
      operationToken: captureOperation(this),
    });
  },
  showSpeechDialog() {
    this.dialogs.speech.visible = true;
  },
  successSpeechDialog() {
    this.timeline.filters[this.ui.audio.speechColumnIndex].speech = true;
    this.persistFilters();
  },
  closeSpeechDialog() {
    this.dialogs.speech.visible = false;
  },
};
