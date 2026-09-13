<template>
  <span class="ui-avatar" :style="avatarStyle">
    <slot />
  </span>
</template>

<script>
export default {
  name: 'UiAvatar',
  props: {
    size: {
      type: Number,
      default: 40,
    },
  },
  computed: {
    avatarStyle() {
      const size = `${this.size}px`;
      return {
        width: size,
        height: size,
      };
    },
  },
};
</script>

<style>
.ui-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  overflow: hidden;
  border-radius: 50%;
  color: #fff;
  background: #000;
}

.ui-avatar > img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
