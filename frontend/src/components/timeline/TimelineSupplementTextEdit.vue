<template>
  <section class="alternative-text" :aria-label="$t('sharedText.content')">
    <UiTooltip v-if="editable" :text="$t('sharedText.edit')">
      <UiButton class="shared-text-edit" appearance="text" tone="neutral" density="dense" iconOnly
        :aria-label="$t('sharedText.edit')" @click.stop="startEdit">
        <UiIcon name="edit" :size="20" />
      </UiButton>
    </UiTooltip>
    <BaseEditDialog :visible="editing" :sending="saving" :title-id="`${bodyId}-title`"
      :title-text="$t('sharedText.edit')" :confirm-label="$t('managementUi.save')" :cancel-label="$t('キャンセル')"
      :confirm-disabled="!draft.trim() || draft.length > 2000 || conflicted" @opened="focusText" @confirm="save" @cancel="editing = false" @closed="editing = false">
      <p>{{ $t('sharedText.hint') }}</p><p>{{ $t('sharedText.noHistory') }}</p>
      <UiField class="alt-edit-field" :control-id="`${bodyId}-input`" :label="$t('sharedText.content')" counter stacked
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
import { canEditSharedText } from '@/features/timeline/sharedTextPermission';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiTooltip from '@/components/ui/UiTooltip.vue';
import { useId } from 'vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiField from '@/components/ui/UiField.vue';
import BaseEditDialog from '@/components/common/BaseEditDialog.vue';
import chatApi from '@/api/chat';
const mediaTextSnapshot = (item) => ({ content: item.content ?? null, lang: item.lang ?? null });

export default {
  components: { UiIcon, UiTooltip, UiButton, UiField, BaseEditDialog },
  props: { item: { type: Object, required: true }, kind: { type: String, required: true },
    descriptionId: String, postId: String, replyId: String, supplementId: String,
    readOnly: { type: Boolean, default: false }, roomId: String },
  setup() { return { bodyId: `alternative-text-${useId()}` }; },
  data() { return { editing: false, saving: false,
    draft: '', expected: null, error: '', status: '', conflicted: false, savedItem: null }; },
  computed: {
    current() { return this.savedItem || this.item; },
    text() { return this.current.content || ''; },
    editable() { return !this.readOnly && !!this.postId && canEditSharedText(this.current, this.$store.getters); },
    effectiveRoom() { return this.roomId || this.$store.getters.roomId; },
  },
  watch: { item() { this.savedItem = null; } },
  methods: {

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
        if (!item) throw new Error('Media removed');
        this.savedItem = item; this.startEdit(); this.focusText();
      } catch { this.error = this.$t('altText.failed'); } finally { this.saving = false; }
    },
    async save() {
      if (this.saving || this.conflicted || !this.draft.trim() || this.draft.length > 2000) return;
      this.saving = true; this.error = '';
      try {
        const { data } = await chatApi.updateSupplementText({ room_id: this.effectiveRoom, post_id: this.postId,
          reply_id: this.replyId, supplement_id: this.supplementId, text: this.draft, lang: this.current.lang || this.$i18n.locale, expected: this.expected });
        this.savedItem = this.extract(data); this.editing = false; this.status = this.$t('sharedText.saved');
      } catch (error) {
        this.conflicted = error.response?.status === 409;
        this.error = this.$t(this.conflicted ? 'altText.conflict' : 'altText.failed');
      } finally { this.saving = false; }
    },
  },
};
</script>
<style scoped>
.shared-text-edit.ui-button { color: rgb(195, 209, 255); }
.alternative-text { margin:0;display:inline-flex; font-size:1rem; line-height:1.5; overflow-wrap:anywhere; }
.alt-copy p { white-space:pre-wrap; margin:4px 0; }
.alternative-text .ui-button { margin:0; }
.alt-sr-only { position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0; }
textarea { width:100%;box-sizing:border-box; font:inherit; line-height:1.5; padding:8px; }
.alt-edit-field :deep(.ui-field__label) { position:static;display:block;transform:none;margin-bottom:6px; }
.alt-edit-field :deep(.ui-field__counter) { position:static;display:block;height:auto;text-align:end; }
</style>
