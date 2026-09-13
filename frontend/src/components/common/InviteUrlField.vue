<template>
  <div class="invite-url-field">
    <label :for="controlId">{{ label }}</label>
    <div class="invite-url-content" :data-value="url" dir="ltr">
      <textarea v-bind="$attrs" :id="controlId" :value="url" rows="3" readonly />
    </div>
  </div>
</template>

<script>
export default {
  name: 'InviteUrlField',
  inheritAttrs: false,
  props: {
    controlId: { type: String, required: true },
    label: { type: String, required: true },
    url: { type: String, required: true },
  },
};
</script>

<style scoped>
.invite-url-field {
  display: grid;
  min-width: 0;
  gap: 4px;
}
.invite-url-content {
  display: grid;
  min-width: 0;
}
.invite-url-content::after,
.invite-url-content textarea {
  grid-area: 1 / 1;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 10px;
  border: 1px solid #bbb;
  border-radius: 3px;
  font: inherit;
  font-size: 16px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-all;
}
/* 同じ幅で折り返した文字に合わせ、画面幅が変わっても欄の高さを確保する。 */
.invite-url-content::after {
  content: attr(data-value);
  visibility: hidden;
}
.invite-url-content textarea {
  height: 100%;
  background-color: #f7f7f7;
  resize: none;
  overflow: hidden;
}
</style>
