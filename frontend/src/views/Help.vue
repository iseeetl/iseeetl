<template>
  <div class="view">
    <div class="view-header">
      <BackButton></BackButton>
      <h1 class="view-title">
        {{ $t('ヘルプ及びショートカット一覧') }}
      </h1>
    </div>
    <div class="view-content">
      <HelpContent />
    </div>
  </div>
</template>

<script>
import BackButton from '@/components/common/BackButton.vue';
import HelpContent from '@/components/help/HelpContent.vue';

export default {
  name: 'Help',
  components: {
    BackButton,
    HelpContent,
  },
};
</script>
