<template>
  <section class="alternative-text" :data-alt-kind="kind" :aria-label="$t('altText.heading')">
    <span :id="descriptionId" hidden>{{ text || $t('altText.missing') }}</span>
    <template v-if="text">
      <div :id="bodyId" v-show="inline || opened" class="alt-copy">
        <strong>{{ $t('altText.heading') }}</strong>
        <p dir="auto">{{ text.length > 400 && !expanded ? preview(text) : text }}</p>
        <UiButton v-if="text.length > 400" appearance="filled" tone="neutral" :aria-controls="bodyId"
          :aria-expanded="String(expanded)" @click.stop="expanded = !expanded">
          {{ $t(expanded ? 'aiAnswer.collapse' : 'aiAnswer.expand') }}
        </UiButton>
      </div>
      <UiButton v-if="!inline" appearance="filled" tone="neutral" :aria-expanded="String(opened)"
        :aria-controls="bodyId" @click.stop="opened = !opened">{{ $t(opened ? 'altText.close' : 'altText.open') }}</UiButton>
    </template>
    <div v-if="text && (inline || opened)" class="alt-reactions">
      <ReactionItem :read-only="readOnly" :post-id="postId" :reply-id="replyId" :supplement-id="supplementId" :media-kind="kind" :reactions="altReactions" />
    </div>
    <div class="alt-actions">
      <div v-if="text && (inline || opened) && !readOnly && postId && $store.getters.displayActionButton" class="reaction-container">
        <div v-if="picker" class="reaction-picker-wrapper">
          <ReactionPicker ref="reactionPicker" :picker-id="`${bodyId}-reactions`" :reaction-picker-visible="picker" :post-id="postId" :reply-id="replyId" :supplement-id="supplementId"
            :media-kind="kind" :target-label="$t('altText.reactionTarget')" :reactions="altReactions" @close="closeReactionPicker" />
        </div>
        <UiTooltip ref="reactionButtonTooltip" :text="$t('altText.reactionTarget')" :disabled="picker">
          <UiButton class="alt-react-button" appearance="text" tone="neutral" density="dense" iconOnly
            :aria-label="$t('altText.reactionTarget')" :aria-expanded="String(picker)" :aria-controls="picker ? `${bodyId}-reactions` : null" @click.stop="toggleReactionPicker">
            <UiIcon name="add_reaction" :size="20" />
          </UiButton>
        </UiTooltip>
      </div>
      <UiTooltip v-if="editable" :text="$t(text ? 'altText.edit' : 'altText.add')">
        <UiButton class="shared-text-edit" appearance="text" tone="neutral" density="dense" iconOnly
          :aria-label="$t(text ? 'altText.edit' : 'altText.add')" @click.stop="startEdit">
          <UiIcon name="edit" :size="20" />
        </UiButton>
      </UiTooltip>
    </div>
    <BaseEditDialog :visible="editing" :sending="saving" :title-id="`${bodyId}-title`"
      :title-text="$t('altText.edit')" :confirm-label="$t('managementUi.save')" :cancel-label="$t('キャンセル')"
      :confirm-disabled="draft.length > 2000 || conflicted" @opened="focusText" @confirm="save" @cancel="editing = false" @closed="editing = false">
      <p>{{ $t('altText.shared') }}</p><p>{{ $t('sharedText.noHistory') }}</p>
      <UiField class="alt-edit-field" :control-id="`${bodyId}-input`" :label="$t('altText.heading')" counter stacked
        :invalid="draft.length > 2000" :error="draft.length > 2000 ? $t('composerSource.textLimit', { count: 2000 }) : ''">
        <template #default="{ controlAttrs }"><textarea ref="draftInput" v-bind="controlAttrs" v-model="draft" maxlength="2000" rows="8" :disabled="saving" /></template>
      </UiField>
      <p role="alert" v-if="error">{{ error }}</p>
      <UiButton v-if="conflicted" appearance="filled" tone="neutral" @click="refresh">{{ $t('altText.reload') }}</UiButton>
    </BaseEditDialog>
    <span role="status" class="alt-sr-only">{{ status }}</span>
  </section>
</template>
<script>
import ReactionPicker from '@/components/timeline/inputs/ReactionPicker.vue';
import ReactionItem from '@/components/timeline/items/ReactionItem.vue';
import { canEditSharedText } from '@/features/timeline/sharedTextPermission';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiTooltip from '@/components/ui/UiTooltip.vue';
import { useId } from 'vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiField from '@/components/ui/UiField.vue';
import BaseEditDialog from '@/components/common/BaseEditDialog.vue';
import chatApi from '@/api/chat';
import { mediaText, mediaTextSnapshot } from '@/features/timeline/alternativeText';
import { supplementPreview } from '@/features/timeline/supplementLength';
export default {
  components: { ReactionPicker, ReactionItem, UiIcon, UiTooltip, UiButton, UiField, BaseEditDialog },
  props: { item: { type: Object, required: true }, kind: { type: String, required: true },
    descriptionId: String, postId: String, replyId: String, supplementId: String,
    readOnly: { type: Boolean, default: false }, roomId: String },
  setup() { return { bodyId: `alternative-text-${useId()}` }; },
  data() { return { picker: false, opened: false, expanded: false, editing: false, saving: false,
    draft: '', expected: null, error: '', status: '', conflicted: false, savedItem: null }; },
  computed: {
    altReactions() { return (this.item.alternative_reactions || []).filter(r => r.media_kind === this.kind); },
    current() { return this.savedItem || this.item; },
    text() { return mediaText(this.current, this.kind); },
    inline() { return this.$store.getters.displayAlternativeText !== false; },
    editable() { return !this.readOnly && !!this.postId && canEditSharedText(this.current, this.$store.getters); },
    effectiveRoom() { return this.roomId || this.$store.getters.roomId; },
  },
  watch: { item() { this.savedItem = null; }, text() { this.expanded = false; }, inline() { this.opened = false; } },
  methods: {
    toggleReactionPicker() {
      const shouldOpen = !this.picker;
      if (shouldOpen) this.$refs.reactionButtonTooltip?.hideTooltip();
      this.picker = shouldOpen;
      if (shouldOpen) this.$nextTick(() => this.$refs.reactionPicker?.focusFirstReactionButton());
    },
    closeReactionPicker() {
      this.$refs.reactionButtonTooltip?.focusTrigger({ showTooltip: false });
      this.picker = false;
    },
    preview: supplementPreview,
    focusText() { this.$nextTick(() => { const input = this.$refs.draftInput; if (input) { input.focus(); input.setSelectionRange(0, 0); input.scrollTop = 0; } }); },
    startEdit() { this.draft = this.text; this.expected = mediaTextSnapshot(this.current); this.error = ''; this.conflicted = false; this.editing = true; },
    extract(post) {
      const parent = this.replyId ? post.replies?.find((x) => x._id === this.replyId) : post;
      return this.supplementId ? parent?.supplementaries?.find((x) => x._id === this.supplementId) : parent;
    },
    async refresh() {
      this.saving = true;
      try {
        const { data } = await chatApi.fetchDetail({ room_id: this.effectiveRoom, post_id: this.postId, isGuest: false });
        const item = this.extract(data);
        if (!item?.[`${this.kind}_name`]) throw new Error('Media removed');
        this.savedItem = item; this.startEdit(); this.focusText();
      } catch { this.error = this.$t('altText.failed'); } finally { this.saving = false; }
    },
    async save() {
      if (this.saving || this.conflicted || this.draft.length > 2000) return;
      this.saving = true; this.error = '';
      try {
        const { data } = await chatApi.updateAlternativeText({ room_id: this.effectiveRoom, post_id: this.postId,
          reply_id: this.replyId, supplement_id: this.supplementId, kind: this.kind, text: this.draft, expected: this.expected });
        this.savedItem = this.extract(data); this.editing = false; this.status = this.$t('altText.saved');
      } catch (error) {
        this.conflicted = error.response?.status === 409;
        this.error = this.$t(this.conflicted ? 'altText.conflict' : 'altText.failed');
      } finally { this.saving = false; }
    },
  },
};
</script>
<style scoped>
.alt-react-button.ui-button, .shared-text-edit.ui-button { color: rgb(195, 209, 255); }
.alternative-text { border:1px solid #748298;border-radius:5px;padding:10px; margin:8px 0; font-size:inherit; line-height:1.5; overflow-wrap:anywhere; }
.alt-copy p { white-space:pre-wrap; margin:4px 0; }
.alternative-text .ui-button { margin:4px 6px 4px 0; }
.alt-actions { display:flex;align-items:center; }
.alt-actions .ui-button { margin:0; }
.reaction-container { position:relative;display:inline-block; }
.reaction-picker-wrapper { position:absolute;bottom:100%;left:0;z-index:20;padding-bottom:8px; }
.alt-sr-only { position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0; }
textarea { width:100%;box-sizing:border-box; font:inherit; line-height:1.5; padding:8px; }
.alt-edit-field :deep(.ui-field__label) { position:static;display:block;transform:none;margin-bottom:6px; }
.alt-edit-field :deep(.ui-field__counter) { position:static;display:block;height:auto;text-align:end; }
</style>
