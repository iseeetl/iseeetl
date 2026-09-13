<template>
  <nav
    v-if="lastPage > 1"
    class="pager pager--management"
    :aria-label="$t('ページ番号')"
  >
    <ul>
      <li v-if="currentPage > 1">
        <button
          type="button"
          :disabled="disabled"
          :aria-label="$t('最初のページ')"
          :aria-controls="resultRegionId"
          @click.stop="emitChange(1)"
        >
          <UiIcon name="first_page" />
        </button>
      </li>
      <li v-if="currentPage > 1">
        <button
          type="button"
          :disabled="disabled"
          :aria-label="$t('前のページ')"
          :aria-controls="resultRegionId"
          @click.stop="emitChange(currentPage - 1)"
        >
          <UiIcon name="chevron_left" />
        </button>
      </li>
      <li v-for="page in pages" :key="page">
        <button
          type="button"
          :class="page === currentPage ? 'pager-current-page' : ''"
          :disabled="disabled || page === currentPage"
          :aria-label="$t('{page}ページ', { page })"
          :aria-controls="resultRegionId"
          :aria-current="page === currentPage ? 'page' : undefined"
          @click.stop="emitChange(page)"
        >
          {{ page }}
        </button>
      </li>
      <li v-if="currentPage < lastPage">
        <button
          type="button"
          :disabled="disabled"
          :aria-label="$t('次のページ')"
          :aria-controls="resultRegionId"
          @click.stop="emitChange(currentPage + 1)"
        >
          <UiIcon name="chevron_right" />
        </button>
      </li>
      <li v-if="currentPage < lastPage">
        <button
          type="button"
          :disabled="disabled"
          :aria-label="$t('最後のページ')"
          :aria-controls="resultRegionId"
          @click.stop="emitChange(lastPage)"
        >
          <UiIcon name="last_page" />
        </button>
      </li>
    </ul>
  </nav>
</template>

<script>
import UiIcon from '@/components/ui/UiIcon.vue';

export default {
  emits: ['change'],
  name: 'Pager',
  components: { UiIcon },
  props: {
    currentPage: {
      type: Number,
      required: true,
    },
    lastPage: {
      type: Number,
      required: true,
    },
    disabled: {
      type: Boolean,
      default: false,
    },
    resultRegionId: {
      type: String,
      default: 'management-list-results',
    },
  },
  computed: {
    pages() {
      let from = Math.max(this.currentPage - 2, 1);
      let to = Math.min(from + 4, this.lastPage);
      from = Math.max(to - 4, 1);
      return [...Array(to - from + 1).keys()].map((x) => x + from);
    },
  },
  methods: {
    emitChange(page) {
      if (this.disabled || page === this.currentPage || page < 1 || page > this.lastPage) return;
      this.$emit('change', page);
    },
  },
};
</script>
