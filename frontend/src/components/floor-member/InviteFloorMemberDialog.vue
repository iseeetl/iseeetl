<template>
  <UiDialog
    class="invite-floor-member-dialog ui-dialog--standard"
    ref="dialogRootRef"
    :open="visible"
    title-id="invite_floor_member_dialog_title"
    :description-ids="descriptionIds"
    initial-focus="#invite_floor_member_dialog_title"
    data-testid="dialog-invite-floor-member"
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
        data-testid="dialog-invite-floor-member-close-mobile"
        @click.stop="onPressCancelButton"
      >
        <UiIcon name="close" />
      </UiButton>
      <h2 id="invite_floor_member_dialog_title" class="ui-dialog__heading" tabindex="-1">
        {{ $t('フロアメンバー招待') }}
      </h2>
      <UiButton
        class="ui-dialog__header-end mobile-item"
        appearance="filled"
        tone="primary"
        icon-only
        :aria-label="$t('コピー')"
        :disabled="!canCopyInviteUrl"
        data-testid="dialog-invite-floor-member-copy-mobile"
        @click="copyInviteUrl"
      >
        <UiIcon name="content_copy" />
      </UiButton>
    </template>

    <DialogTargetContext
      v-if="resolvedFloorTitle"
      :context-id="floorContextId"
      :label="$t('対象フロア')"
      :name="resolvedFloorTitle"
    />
    <MemberCapabilityGuidance id="invite_floor_member_dialog_guidance" scope="floor" />
    <p id="invite_floor_member_dialog_description">{{ $t('フロアのメンバーに招待する') }}</p>
    <div class="invite-create-row" data-testid="dialog-invite-floor-member-create-row">
      <div class="input-field invite-period-field">
        <label for="invite_floor_member_period">{{ $t('有効期限') }}</label>
        <div>
          <select
            id="invite_floor_member_period"
            class="input-select"
            v-model="period"
            :disabled="sending"
          >
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
        data-testid="dialog-invite-floor-member-create-button"
        @click.stop="onPressCreateInviteUrl"
      >
        {{ $t('招待URLを作成') }}
      </UiButton>
    </div>
    <p id="invite_floor_member_dialog_limit">
      <template v-if="inviteUrl !== null">
        {{
          $t('招待URL（有効期限は{period}です。招待できるユーザはログイン可能なユーザになります）', {
            period: periodDisplayName,
          })
        }}
      </template>
    </p>
    <p class="invite-status" role="status" aria-live="polite" data-testid="dialog-invite-floor-member-status">
      {{ inviteStatusMessage }}
    </p>
    <InviteUrlField
      v-if="inviteUrl !== null"
      control-id="invite_floor_member_url"
      :label="$t('floorMemberDialogs.inviteUrl')"
      :url="inviteUrl"
      data-testid="dialog-invite-floor-member-url"
    />

    <template #actions>
      <div class="common-dialog-actions">
        <UiButton
          class="desktop-item"
          appearance="filled"
          tone="neutral"
          data-testid="dialog-invite-floor-member-close-desktop"
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
          data-testid="dialog-invite-floor-member-copy-desktop"
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
        aria-labelledby="invite_floor_member_dialog_title"
      />
    </template>
  </UiDialog>
</template>

<script>
import floorMemberApi from '@/api/floorMember';
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
  name: 'InviteFloorMemberDialog',
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
    floorTitle: {
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
    resolvedFloorId() {
      return this.floorId || this.$store?.getters?.floorId || '';
    },
    resolvedFloorTitle() {
      return this.floorTitle || this.$store?.getters?.floorTitle || '';
    },
    floorContextId() {
      return 'invite_floor_member_dialog_context';
    },
    descriptionIds() {
      return [
        this.resolvedFloorTitle ? this.floorContextId : '',
        'invite_floor_member_dialog_guidance',
        'invite_floor_member_dialog_description',
        'invite_floor_member_dialog_limit',
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
      if (this.invitePeriodChanged) return this.$t('floorMemberDialogs.invitePeriodChanged');
      if (this.inviteUrl) return this.$t('floorMemberDialogs.inviteCreated');
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
      if (this.sending || !this.resolvedFloorId) return;
      this.sending = true;

      const data = {
        floor_id: this.resolvedFloorId,
        period: this.period,
      };
      floorMemberApi
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
          this.inviteUrl = baseUrl + '/floor/' + this.resolvedFloorId + '/invite/' + res.data.token;
        })
        .catch((err) => {
          const message = appendApiErrorMessage(this.$t('フロアメンバー招待に失敗しました'), err, {
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
      this.periodDisplayName = '';
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
  :global(.invite-floor-member-dialog) {
    --ui-dialog-width: 520px;
  }
}

@media screen and (max-width: 896px) {
  :global(.invite-floor-member-dialog .ui-dialog__actions) {
    display: none;
  }
}
</style>
