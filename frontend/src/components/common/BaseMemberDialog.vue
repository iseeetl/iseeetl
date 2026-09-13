<template>
  <UiDialog
    class="base-member-dialog ui-dialog--standard"
    :open="visible"
    :title-id="titleId"
    :description-ids="resolvedDescriptionIds"
    :initial-focus="`#${titleId}`"
    :close-on-escape="!sending"
    :close-on-backdrop="!sending"
    @request-close="requestClose"
    @opened="$emit('opened')"
    @closed="$emit('closed', $event)"
  >
    <template #title>
      <UiButton
        class="ui-dialog__header-start mobile-item"
        appearance="filled"
        tone="neutral"
        icon-only
        :aria-label="closeLabel"
        :disabled="sending"
        :data-testid="makeTestId('close-mobile')"
        @click.stop="requestClose"
      >
        <UiIcon name="close" />
      </UiButton>
      <h2 :id="titleId" class="ui-dialog__heading" tabindex="-1">
        {{ titleText }}
      </h2>
    </template>

    <slot name="context" />

    <MemberCapabilityGuidance
      v-if="guidanceScope"
      :id="guidanceDescriptionId"
      :scope="guidanceScope"
    />

    <div v-if="summaryText" class="member-list-summary">
      {{ summaryText }}
    </div>

    <div class="member-list-container" :aria-busy="loadState === 'loading' ? 'true' : 'false'">
      <div v-if="loadState === 'loading'" class="member-list-state" role="status">
        {{ loadingText }}
      </div>

      <div v-else-if="loadState === 'error'" class="member-list-state member-list-state--error">
        <p role="alert">{{ errorText }}</p>
        <UiButton appearance="filled" tone="primary" :disabled="sending" @click.stop="$emit('retry')">
          {{ retryLabel }}
        </UiButton>
      </div>

      <div v-else-if="loadState === 'empty'" class="member-list-state" role="status">
        {{ emptyText }}
      </div>

      <ul v-else class="member-list" :aria-label="listAriaLabel || titleText">
        <li v-for="member in members" :key="member._id" :class="rowClass">
          <div class="avatar-wrapper">
            <UiAvatar
              class="member-avatar"
              v-if="!hasUserDisplayImage(member.user)"
            >
              <UiIcon name="person" :size="24" />
            </UiAvatar>

            <UiAvatar class="member-avatar" v-else>
              <img :src="getUserDisplayImagePath(member.user)" alt="" />
            </UiAvatar>
            <span dir="auto">{{ resolveUserDisplayName(member.user) }}</span>
          </div>
          <UiButton
            v-if="canDeleteMember(member)"
            :id="deleteButtonId(member)"
            class="delete-button"
            appearance="filled"
            :tone="actionTone"
            :aria-label="resolvedDeleteAriaLabel(member)"
            :data-testid="makeTestId(`delete-${member._id}`)"
            @click.stop="onDelete(member)"
          >
            <UiIcon v-if="actionIcon" :name="actionIcon" :size="18" />
            {{ deleteLabel }}
          </UiButton>
        </li>
      </ul>
    </div>

    <template #actions>
      <div class="common-dialog-actions">
        <UiButton
          class="desktop-item"
          appearance="filled"
          tone="neutral"
          :data-testid="makeTestId('close-desktop')"
          @click.stop="requestClose"
          :disabled="sending"
        >
          {{ closeLabel }}
        </UiButton>
      </div>
    </template>

    <template #status>
      <UiProgress
        v-if="loadState === 'loading'"
        mode="indeterminate"
        :aria-labelledby="titleId"
      />
      <UiProgress
        v-else-if="sending"
        mode="determinate"
        :value="progressAmount"
        :aria-labelledby="titleId"
      />
    </template>
  </UiDialog>
</template>

<script>
import MemberCapabilityGuidance from '@/components/common/MemberCapabilityGuidance.vue';
import UiAvatar from '@/components/ui/UiAvatar.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiDialog from '@/components/ui/UiDialog.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiProgress from '@/components/ui/UiProgress.vue';
import userDisplayMethods from '@/features/profile/userDisplayMethods';

const LOAD_STATES = ['loading', 'ready', 'empty', 'error'];

export default {
  emits: ['closed', 'delete', 'opened', 'request-close', 'retry'],
  name: 'BaseMemberDialog',
  components: {
    MemberCapabilityGuidance,
    UiAvatar,
    UiButton,
    UiDialog,
    UiIcon,
    UiProgress,
  },
  props: {
    visible: {
      type: Boolean,
      required: true,
    },
    sending: {
      type: Boolean,
      default: false,
    },
    titleId: {
      type: String,
      required: true,
    },
    titleText: {
      type: String,
      required: true,
    },
    descriptionIds: {
      type: String,
      default: '',
    },
    guidanceScope: {
      type: String,
      default: '',
      validator: (value) => ['', 'floor', 'room'].includes(value),
    },
    closeLabel: {
      type: String,
      required: true,
    },
    deleteLabel: {
      type: String,
      required: true,
    },
    members: {
      type: Array,
      default: () => [],
    },
    loadState: {
      type: String,
      default: 'ready',
      validator: (value) => LOAD_STATES.includes(value),
    },
    loadingText: {
      type: String,
      default: '',
    },
    emptyText: {
      type: String,
      default: '',
    },
    errorText: {
      type: String,
      default: '',
    },
    retryLabel: {
      type: String,
      default: '',
    },
    summaryText: {
      type: String,
      default: '',
    },
    listAriaLabel: {
      type: String,
      default: '',
    },
    rowClass: {
      type: String,
      default: 'member-row',
    },
    canDelete: {
      type: Function,
      default: () => false,
    },
    deleteAriaLabel: {
      type: Function,
      default: null,
    },
    actionTone: {
      type: String,
      default: 'danger',
      validator: (value) => ['neutral', 'primary', 'danger', 'success'].includes(value),
    },
    actionIcon: {
      type: String,
      default: '',
    },
    progressAmount: {
      type: Number,
      default: 0,
    },
    testIdPrefix: {
      type: String,
      default: '',
    },
  },
  computed: {
    guidanceDescriptionId() {
      return `${this.titleId}-capability-guidance`;
    },
    resolvedDescriptionIds() {
      return [this.descriptionIds, this.guidanceScope ? this.guidanceDescriptionId : '']
        .filter(Boolean)
        .join(' ');
    },
  },
  methods: {
    ...userDisplayMethods,
    makeTestId(suffix) {
      const prefix = this.testIdPrefix || 'dialog-member';
      return `${prefix}-${suffix}`;
    },
    requestClose() {
      if (this.sending) return;
      this.$emit('request-close');
    },
    onDelete(member) {
      this.$emit('delete', member);
    },
    canDeleteMember(member) {
      return this.canDelete(member);
    },
    deleteButtonId(member) {
      return `${this.titleId}-delete-${member._id}`;
    },
    resolvedDeleteAriaLabel(member) {
      if (this.deleteAriaLabel) return this.deleteAriaLabel(member);
      return this.deleteLabel;
    },
    focusDeleteButton(memberId) {
      const element = document.getElementById(`${this.titleId}-delete-${memberId}`);
      if (!element || element.disabled || typeof element.focus !== 'function') return false;
      element.focus({ preventScroll: true });
      return document.activeElement === element;
    },
    focusHeading() {
      const element = document.getElementById(this.titleId);
      if (!element || typeof element.focus !== 'function') return false;
      element.focus({ preventScroll: true });
      return document.activeElement === element;
    },
  },
};
</script>

<style scoped>
.member-row {
  width: 100%;
  display: flex;
}

.member-list .member-row {
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #ddd;
}

.common-dialog-actions {
  display: flex;
  width: 100%;
  justify-content: flex-end;
}

.member-list-container {
  width: 100%;
}

.member-list-summary {
  margin-top: 16px;
  font-weight: 600;
}

.member-list-state {
  padding: 24px 8px;
  text-align: center;
}

.member-list-state--error p {
  margin-top: 0;
}

.member-list {
  padding: 0;
  margin: 8px 0 0;
  list-style: none;
}

.member-list .member-row:last-child {
  border-bottom: 0;
}

.avatar-wrapper {
  display: flex;
  align-items: center;
  margin-inline-end: 8px;
}

.member-avatar {
  margin-inline-end: 8px;
}

.delete-button {
  margin-inline-start: auto;
  gap: 6px;
}

.member-list .delete-button {
  flex: 0 0 auto;
}

:global(.base-member-dialog .ui-dialog__content) {
  min-width: 0;
}

@media screen and (max-width: 896px) {
  :global(.base-member-dialog) {
    --ui-dialog-width: 560px;
  }
}

@media screen and (max-width: 896px) {
  :global(.base-member-dialog .ui-dialog__actions) {
    display: none;
  }
}
</style>
