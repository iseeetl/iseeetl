<template>
  <UiDialog
    class="invite-room-member-dialog ui-dialog--standard"
    ref="dialogRootRef"
    :open="visible"
    title-id="invite_room_member_dialog_title"
    :description-ids="descriptionIds"
    initial-focus="#invite_room_member_dialog_title"
    data-testid="dialog-invite-room-member"
    :close-on-escape="!sending"
    :close-on-backdrop="!sending"
    @request-close="onPressCancelButton"
    @closed="closedDialog"
  >
    <template #title>
      <UiButton
        class="ui-dialog__header-start mobile-item"
        appearance="filled"
        tone="neutral"
        icon-only
        :aria-label="$t('閉じる')"
        :disabled="sending"
        data-testid="dialog-invite-room-member-close-mobile"
        @click.stop="onPressCancelButton"
      >
        <UiIcon name="close" />
      </UiButton>
      <h2 id="invite_room_member_dialog_title" class="ui-dialog__heading" tabindex="-1">
        {{ $t('ルームメンバー招待') }}
      </h2>
      <UiButton
        class="ui-dialog__header-end mobile-item"
        appearance="filled"
        tone="primary"
        icon-only
        :aria-label="$t('コピー')"
        :disabled="!canCopyInviteUrl"
        data-testid="dialog-invite-room-member-copy-mobile"
        @click="copyInviteUrl"
      >
        <UiIcon name="content_copy" />
      </UiButton>
    </template>

    <DialogTargetContext
      v-if="roomTitle"
      :context-id="roomContextId"
      :label="$t('対象ルーム')"
      :name="roomTitle"
    />
    <MemberCapabilityGuidance id="invite_room_member_dialog_guidance" scope="room" />
    <p id="invite_room_member_dialog_description">{{ $t('ルームのメンバーに招待する') }}</p>
    <div class="invite-create-row" data-testid="dialog-invite-room-member-create-row">
      <div class="input-field invite-period-field">
        <label for="invite_room_member_period">{{ $t('有効期限') }}</label>
        <div>
          <select id="invite_room_member_period" class="input-select" v-model="period" :disabled="sending">
            <option value="8h">{{ $t('8時間') }}</option>
            <option value="3d">{{ $t('3日') }}</option>
            <option value="1m">{{ $t('1ヶ月') }}</option>
          </select>
        </div>
      </div>
      <UiButton
        class="create-invite-button"
        appearance="filled"
        tone="primary"
        :disabled="sending"
        data-testid="dialog-invite-room-member-create-button"
        @click.stop="onPressCreateInviteUrl"
      >
        {{ $t('招待URLを作成') }}
      </UiButton>
    </div>
    <p id="invite_room_member_dialog_limit">
      <template v-if="inviteUrl !== null">
        {{
          $t('招待URL（有効期限は{period}です。招待できるユーザはログイン可能なユーザになります）', {
            period: periodDisplayName,
          })
        }}
      </template>
    </p>
    <p class="invite-status" role="status" aria-live="polite" data-testid="dialog-invite-room-member-status">
      {{ inviteStatusMessage }}
    </p>
    <InviteUrlField
      v-if="inviteUrl !== null"
      control-id="invite_room_member_url"
      :label="$t('roomMemberDialogs.inviteUrl')"
      :url="inviteUrl"
      data-testid="dialog-invite-room-member-url"
    />

    <template #actions>
      <div class="common-dialog-actions">
        <UiButton
          class="desktop-item"
          appearance="filled"
          tone="neutral"
          data-testid="dialog-invite-room-member-close-desktop"
          :disabled="sending"
          @click.stop="onPressCancelButton"
        >
          {{ $t('閉じる') }}
        </UiButton>
        <UiButton
          class="desktop-item"
          appearance="filled"
          tone="primary"
          :disabled="!canCopyInviteUrl"
          data-testid="dialog-invite-room-member-copy-desktop"
          @click="copyInviteUrl"
        >
          {{ $t('コピー') }}
        </UiButton>
      </div>
    </template>

    <template #status>
      <UiProgress
        v-show="sending"
        mode="determinate"
        :value="progressAmount"
        aria-labelledby="invite_room_member_dialog_title"
      />
    </template>
  </UiDialog>
</template>

<script>
import roomMemberApi from '@/api/roomMember';
import { API_BASE_URL, appendApiErrorMessage } from '@/api/apiClient';
import { showSnackbar } from '@/utils/snackbar';
import { copyText } from '@/utils/clipboard';
import { handleAuthError as handleAuthErrorUtil } from '@/utils/authError';
import InviteUrlField from '@/components/common/InviteUrlField.vue';
import MemberCapabilityGuidance from '@/components/common/MemberCapabilityGuidance.vue';
import DialogTargetContext from '@/components/common/DialogTargetContext.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiDialog from '@/components/ui/UiDialog.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiProgress from '@/components/ui/UiProgress.vue';

export default {
  emits: ['close'],
  name: 'InviteRoomMemberDialog',
  components: {
    InviteUrlField,
    MemberCapabilityGuidance,
    DialogTargetContext,
    UiButton,
    UiDialog,
    UiIcon,
    UiProgress,
  },
  props: {
    dialogVisible: Boolean,
    floorId: {
      type: String,
      default: '',
    },
    roomId: {
      type: String,
      default: '',
    },
    roomTitle: {
      type: String,
      default: '',
    },
  },
  data() {
    return {
      inviteUrl: null,
      period: '8h',
      periodDisplayName: '',
      issuedPeriod: null,

      visible: this.dialogVisible,
      sending: false,
      progressAmount: 0,
    };
  },
  computed: {
    roomContextId() {
      return 'invite_room_member_dialog_context';
    },
    descriptionIds() {
      return [
        this.roomTitle ? this.roomContextId : '',
        'invite_room_member_dialog_guidance',
        'invite_room_member_dialog_description',
        'invite_room_member_dialog_limit',
      ]
        .filter(Boolean)
        .join(' ');
    },
    invitePeriodChanged() {
      return Boolean(this.inviteUrl && this.issuedPeriod && this.period !== this.issuedPeriod);
    },
    canCopyInviteUrl() {
      return Boolean(this.inviteUrl && !this.invitePeriodChanged);
    },
    inviteStatusMessage() {
      if (this.invitePeriodChanged) return this.$t('roomMemberDialogs.invitePeriodChanged');
      if (this.inviteUrl) return this.$t('roomMemberDialogs.inviteCreated');
      return '';
    },
  },
  watch: {
    dialogVisible() {
      this.visible = this.dialogVisible;
    },
  },
  methods: {
    async copyInviteUrl() {
      if (!this.canCopyInviteUrl) return;
      try {
        await copyText(this.inviteUrl);
        this.clipbordCopySuccess();
      } catch {
        this.clipbordCopyError();
      }
    },
    onPressCreateInviteUrl() {
      if (this.sending || !this.floorId || !this.roomId) return;
      this.progressAmount = 0;
      this.sending = true;

      const data = {
        room_id: this.roomId,
        period: this.period,
      };
      roomMemberApi
        .invite(data, {
          onUploadProgress: (progressEvent) => {
            this.progressAmount = Math.floor((progressEvent.loaded * 100) / progressEvent.total);
          },
        })
        .then((res) => {
          switch (this.period) {
            case '8h':
              this.periodDisplayName = this.$t('8時間');
              break;
            case '3d':
              this.periodDisplayName = this.$t('3日');
              break;
            case '1m':
              this.periodDisplayName = this.$t('1ヶ月');
              break;
          }
          this.issuedPeriod = this.period;

          const baseUrl = API_BASE_URL || '';
          this.inviteUrl =
            baseUrl +
            '/floor/' +
            this.floorId +
            '/room/' +
            this.roomId +
            '/invite/' +
            res.data.token;
        })
        .catch((err) => {
          const message = appendApiErrorMessage(this.$t('ルームメンバー招待に失敗しました'), err, {
            translate: this.$t,
          });
          this.setSnackbar(message, 'alert');
          if (this.handleAuthError(err)) return;
        })
        .finally(() => {
          this.sending = false;
          this.progressAmount = 0;
        });
    },

    onPressCancelButton() {
      if (this.sending) return;
      this.visible = false;
    },

    clipbordCopySuccess() {
      this.setSnackbar(this.$t('クリップボードへコピーしました'), 'status');
    },

    clipbordCopyError() {
      this.setSnackbar(this.$t('クリップボードへのコピーに失敗しました'), 'alert');
    },

    clearValue() {
      this.period = '8h';
      this.periodDisplayName = null;
      this.issuedPeriod = null;
      this.inviteUrl = null;
      this.sending = false;
      this.progressAmount = 0;
    },

    closedDialog() {
      if (this.sending) return;
      this.clearValue();
      this.$emit('close');
    },

    setSnackbar(message, role = 'status') {
      showSnackbar(this.$store, message, role);
    },

    handleAuthError(err) {
      return handleAuthErrorUtil(err, { store: this.$store, router: this.$router });
    },
  },
};
</script>

<style scoped>
.common-dialog-actions {
  display: flex;
  width: 100%;
  justify-content: flex-end;
  gap: 12px;
}

.invite-create-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 12px;
}

.invite-period-field {
  min-width: 0;
}

.invite-period-field .input-select {
  width: 100%;
}

.create-invite-button {
  margin: 0;
  min-width: 0;
  line-height: 1.3;
  white-space: normal;
}
.invite-status {
  min-height: 1.5em;
}
@media screen and (max-width: 896px) {
  :global(.invite-room-member-dialog) {
    --ui-dialog-width: 520px;
  }
}

@media screen and (max-width: 896px) {
  :global(.invite-room-member-dialog .ui-dialog__actions) {
    display: none;
  }
}
</style>
