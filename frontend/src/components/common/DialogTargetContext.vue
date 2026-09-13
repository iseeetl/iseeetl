<template>
  <div :id="contextId || undefined" class="dialog-target-context">
    <span class="dialog-target-context__label">{{ label }}</span>
    <bdi class="dialog-target-context__name" dir="auto">{{ name }}</bdi>
  </div>
</template>

<script>
export default {
  name: 'DialogTargetContext',
  props: {
    contextId: {
      type: String,
      default: '',
    },
    label: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
  },
};
</script>

<style scoped>
.dialog-target-context {
  display: grid;
  gap: 4px;
  padding: 12px 16px;
  border-radius: 4px;
  background: #f5f5f5;
}

.dialog-target-context__label {
  color: #555;
  font-size: 13px;
  font-weight: 600;
}

.dialog-target-context__name {
  overflow-wrap: anywhere;
}
</style>
