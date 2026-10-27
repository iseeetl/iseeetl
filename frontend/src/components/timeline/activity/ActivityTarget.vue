<template>
  <div v-if="value?.post" ref="content" class="activity-target" @click="navigateFromText">
    <div class="target-links"><button type="button" @click.stop="$emit('navigate', value.target)">{{ $t('activity.goToUpdate') }}</button><button v-if="reply || value.target.supplementId || value.target.media" type="button" @click.stop="$emit('navigate', { postId: value.post._id })">{{ $t('activity.parent') }}</button></div>
    <p class="temporary-note">{{ $t('activity.temporary') }}</p>
    <ReplyItem v-if="reply" :post="value.post" :reply="reply" :tags="tags" id-prefix="activity-reply" :hide-info="false" @show-gallery-dialog="item => $emit('gallery', item)" />
    <PostItem :post="value.post" :tags="tags" id-prefix="activity-post" :hide-info="false" @show-gallery-dialog="item => $emit('gallery', item)" />
  </div>
</template>
<script>
import PostItem from '@/components/timeline/items/PostItem.vue';
import ReplyItem from '@/components/timeline/items/ReplyItem.vue';
export default { emits: ['gallery', 'navigate'], components: { PostItem, ReplyItem }, props: { value: Object, tags: Array },
  provide() { return { timelineReadOnly: true, activityTemporaryTarget: () => this.value?.target }; },
  computed: { reply() { return this.value?.post?.replies?.find(reply => reply._id === this.value.target.replyId); } },
  mounted() { this.$nextTick(this.focusTarget); }, watch: { value() { this.$nextTick(this.focusTarget); } },
  methods: {
    navigateFromText(event) {
      if (event.target.closest('button,a,input,textarea,select,video,audio') || window.getSelection()?.toString()) return;
      const item = event.target.closest('[data-timeline-item-id]');
      if (!item) return;
      const id = item.dataset.timelineItemId;
      const alt = event.target.closest('[data-alt-kind]');
      if (id === this.value.post._id && !alt) this.$emit('navigate', { postId: id });
      else if (id === (this.value.target.supplementId || this.value.target.replyId || this.value.target.postId)) this.$emit('navigate', this.value.target);
    }, focusTarget() { const t = this.value?.target; if (!t) return;
    let node = this.$refs.content?.querySelector(`[data-timeline-item-id="${t.supplementId || t.replyId || t.postId}"]`);
    if (t.media) node = node?.querySelector(`[data-alt-kind="${t.media}"]`);
    if (node) { node.setAttribute('tabindex', '-1'); node.classList.add('activity-highlight'); node.scrollIntoView({ block: 'center' }); node.focus({ preventScroll: true }); }
  } } };
</script>
<style scoped>.activity-target{background:#292929;color:white;padding:12px;border-radius:4px;overflow-wrap:anywhere}.temporary-note{font-size:14px;margin:0 0 12px}.activity-target :deep(.activity-highlight){outline:3px solid #ffdb67;outline-offset:3px}.target-links{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.target-links button{font:inherit;background:transparent;color:inherit;border:1px solid #acbad2;border-radius:4px;min-height:36px;padding:4px 8px;cursor:pointer}
.target-links button:focus-visible{outline:3px solid #ffdb67;outline-offset:2px}
.activity-target :deep([data-timeline-item-id]){cursor:pointer}
</style>
