<template>
  <span v-if="editable" class="source-language-action">
    <UiTooltip :text="$t('sourceLanguage.edit')">
      <UiButton class="source-language-edit" appearance="text" tone="neutral" density="dense" icon-only
        :aria-label="$t('sourceLanguage.edit')" :data-testid="`source-language-edit-${item._id}`" @click.stop="startEdit">
        <UiIcon name="translate" :size="20" />
      </UiButton>
    </UiTooltip>
    <BaseEditDialog :visible="editing" :sending="saving" :title-id="`${controlId}-title`"
      :title-text="$t('sourceLanguage.edit')" :confirm-label="$t('managementUi.save')" :cancel-label="$t('キャンセル')"
      :confirm-disabled="!language || language === expected?.lang || conflicted" @opened="focusLanguage"
      @confirm="save" @cancel="editing = false" @closed="editing = false">
      <p>{{ $t('sourceLanguage.permissionHint') }}</p>
      <p class="original-text" dir="auto" tabindex="0" :aria-label="$t('sourceLanguage.original')">{{ expected?.content }}</p>
      <SourceLanguageField ref="field" v-model="language" :control-id="controlId" :disabled="saving" />
      <p v-if="error" role="alert">{{ error }}</p>
      <UiButton v-if="conflicted" appearance="filled" tone="neutral" :disabled="saving" @click="refresh">{{ $t('altText.reload') }}</UiButton>
    </BaseEditDialog>
    <span class="sr-only" role="status">{{ status }}</span>
  </span>
</template>
<script>
import { useId } from 'vue';
import chatApi from '@/api/chat';
import SourceLanguageField from './SourceLanguageField.vue';
import BaseEditDialog from '@/components/common/BaseEditDialog.vue';
import UiTooltip from '@/components/ui/UiTooltip.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
export default {
  components: { SourceLanguageField, BaseEditDialog, UiTooltip, UiButton, UiIcon },
  props: { item: { type: Object, required: true }, postId: { type: String, required: true },
    replyId: String, supplementId: String, roomId: String, readOnly: Boolean },
  setup() { return { controlId: `source-language-${useId()}` }; },
  data() { return { editing: false, saving: false, language: null, expected: null,
    savedItem: null, error: '', status: '', conflicted: false }; },
  computed: {
    current() { return this.savedItem || this.item; },
    editable() { return !this.readOnly && !!this.$store.getters.userId && !!this.current.content?.trim(); },
    effectiveRoom() { return this.roomId || this.$store.getters.roomId; },
  },
  watch: { item() { this.savedItem = null; } },
  methods: {
    focusLanguage() { this.$nextTick(() => this.$refs.field?.$el.querySelector('select')?.focus()); },
    startEdit() {
      this.expected = { content: this.current.content ?? null, lang: this.current.lang ?? null };
      this.language = this.current.lang || null; this.error = ''; this.conflicted = false; this.editing = true;
    },
    extract(post) {
      const parent = this.replyId ? post.replies?.find(x => x._id === this.replyId) : post;
      return this.supplementId ? parent?.supplementaries?.find(x => x._id === this.supplementId) : parent;
    },
    async refresh() {
      this.saving = true;
      try {
        const { data } = await chatApi.fetchDetail({ room_id: this.effectiveRoom, post_id: this.postId, isGuest: false });
        const item = this.extract(data);
        if (!item) throw new Error('Item removed');
        this.savedItem = item; this.startEdit(); this.focusLanguage();
      } catch { this.error = this.$t('altText.failed'); } finally { this.saving = false; }
    },
    async save() {
      if (!this.editable || !this.language || this.language === this.expected?.lang || this.saving || this.conflicted) return;
      this.saving = true; this.error = '';
      try {
        const { data } = await chatApi.updateSourceLanguage({ room_id: this.effectiveRoom, post_id: this.postId,
          reply_id: this.replyId, supplement_id: this.supplementId, lang: this.language, expected: this.expected });
        this.savedItem = this.extract(data); this.editing = false; this.status = this.$t('sourceLanguage.saved');
      } catch (error) {
        this.conflicted = error.response?.status === 409;
        this.error = this.$t(this.conflicted ? 'altText.conflict' : 'altText.failed');
      } finally { this.saving = false; }
    },
  },
};
</script>
<style scoped>
.source-language-edit.ui-button { color: rgb(195, 209, 255); }
.source-language-action { display:inline-flex; }
.source-language-action > :deep(.ui-button), .source-language-action > :deep(.ui-tooltip) { margin:0; }
.original-text { white-space:pre-wrap; overflow-wrap:anywhere; max-height:10rem; overflow:auto; }
.sr-only { position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0; }
</style>
