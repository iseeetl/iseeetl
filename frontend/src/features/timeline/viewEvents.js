export const createTimelineHeaderEvents = (context) =>
  Object.freeze({
    showRoomInfoDialog: context.showRoomInfoDialog,
    showLeaveRoomMemberDialog: context.showLeaveRoomMemberDialog,
    showSoundTagDialog: context.showSoundTagDialog,
    showFilterDialog: context.showFilterDialog,
    showTimelineSettingDialog: context.showTimelineSettingDialog,
  });

export const createTimelineDialogEventHandlers = (context) =>
  Object.freeze({
    successCreateFilter: context.successCreateFilter,
    successUpdateFilter: context.successUpdateFilter,
    closeFilterDialog: context.closeFilterDialog,
    closeEditPostDialog: context.closeEditPostDialog,
    postSaved: context.postSaved,
    postQuickTextInserted: context.postQuickTextInserted,
    closeDeletePostDialog: context.closeDeletePostDialog,
    postDeleted: context.postDeleted,
    closeEditReplyDialog: context.closeEditReplyDialog,
    replySaved: context.replySaved,
    replyQuickTextInserted: context.replyQuickTextInserted,
    closeDeleteReplyDialog: context.closeDeleteReplyDialog,
    replyDeleted: context.replyDeleted,
    closeEditSupplementDialog: context.closeEditSupplementDialog,
    supplementSaved: context.supplementSaved,
    supplementQuickTextInserted: context.supplementQuickTextInserted,
    closeDeleteSupplementDialog: context.closeDeleteSupplementDialog,
    supplementDeleted: context.supplementDeleted,
    closeGalleryDialog: context.closeGalleryDialog,
    successLeaveRoomMember: context.successLeaveRoomMember,
    closeLeaveRoomMemberDialog: context.closeLeaveRoomMemberDialog,
    successEditTag: context.successEditTag,
    closeEditTagDialog: context.closeEditTagDialog,
    successEditSoundTag: context.successEditSoundTag,
    closeSoundTagDialog: context.closeSoundTagDialog,
    confirmSoundCaution: context.confirmSoundCaution,
    closeSoundCautionConfirm: context.closeSoundCautionConfirm,
    successSpeechDialog: context.successSpeechDialog,
    closeSpeechDialog: context.closeSpeechDialog,
    closeTimelineSettingDialog: context.closeTimelineSettingDialog,
    timelineSettingSaved: context.timelineSettingSaved,
    closeRoomInfoDialog: context.closeRoomInfoDialog,
    closeEditKickedUserDialog: context.closeEditKickedUserDialog,
    showEditPostDialog: context.showEditPostDialog,
    showDeletePostDialog: context.showDeletePostDialog,
    showEditReplyDialog: context.showEditReplyDialog,
    showDeleteReplyDialog: context.showDeleteReplyDialog,
    showEditSupplementDialog: context.showEditSupplementDialog,
    showDeleteSupplementDialog: context.showDeleteSupplementDialog,
    showEditTagDialog: context.showEditTagDialog,
    showGalleryDialog: context.showGalleryDialog,
    showEditKickedUserDialog: context.showEditKickedUserDialog,
    successGuestRules: context.successGuestRules,
    closeGuestRulesDialog: context.closeGuestRulesDialog,
    doneContinuousPost: context.handleContinuousPost,
  });

export const dispatchTimelineDialogEvent = (handlers, eventName, payload) => {
  const handler = handlers[eventName];
  if (typeof handler === 'function') handler(...payload);
};
