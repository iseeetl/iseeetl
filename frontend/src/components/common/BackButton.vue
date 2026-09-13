<template>
  <UiTooltip :text="$t(label)">
    <UiButton
      class="back-button"
      appearance="filled"
      tone="neutral"
      :aria-label="$t(label)"
      @click="onClickBackButton"
    >
      <UiIcon name="chevron_left" />
    </UiButton>
  </UiTooltip>
</template>

<script>
import { isNavigationFailure, NavigationFailureType } from 'vue-router';
import UiButton from '@/components/ui/UiButton.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import UiTooltip from '@/components/ui/UiTooltip.vue';

export default {
  name: 'BackButton',
  components: {
    UiButton,
    UiIcon,
    UiTooltip,
  },
  props: {
    to: {
      type: [String, Object],
      default: () => ({ name: 'Floor' }),
    },
    label: {
      type: String,
      default: 'フロア一覧へ戻る',
    },
    afterNavigate: {
      type: Function,
      default: null,
    },
  },
  methods: {
    async onClickBackButton() {
      const afterNavigate = this.afterNavigate;
      const failure = await this.$router.push(this.to);
      if (!failure || isNavigationFailure(failure, NavigationFailureType.duplicated)) {
        await afterNavigate?.();
      }
    },
  },
};
</script>
<style scoped>
.back-button {
  margin-inline-start: 0px;
}
</style>
