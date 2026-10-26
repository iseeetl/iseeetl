<template>
  <section class="update-settings" :aria-labelledby="headingId">
    <h3 :id="headingId">{{ $t('updateNotice.title') }}</h3>
    <p>{{ roomTitle }} · {{ $t('updateNotice.thisRoom') }}</p>
    <label><input type="checkbox" :checked="modelValue.enabled" @change="change('enabled', $event.target.checked)" />{{ $t('updateNotice.enabled') }}</label>
    <fieldset :disabled="!modelValue.enabled">
      <label :for="scopeId">{{ $t('updateNotice.scope') }}</label>
      <select :id="scopeId" :value="modelValue.scope" @change="change('scope', $event.target.value)">
        <option value="related">{{ $t('updateNotice.related') }}</option><option value="all">{{ $t('updateNotice.all') }}</option>
      </select>
      <p v-if="modelValue.scope === 'related'">{{ $t('updateNotice.relatedHelp') }}</p>
      <label v-for="key in ['alternative','supplement','reaction']" :key="key"><input type="checkbox" :checked="modelValue[key]" @change="change(key, $event.target.checked)" />{{ $t(`updateNotice.${key}`) }}</label>
    </fieldset>
    <p>{{ $t('updateNotice.help') }}</p>
  </section>
</template>
<script>
import { useId } from 'vue';
export default {props:{modelValue:{type:Object,required:true},roomTitle:String},emits:['update:modelValue'],
 setup(){const uid=useId();return{headingId:`updates-${uid}`,scopeId:`updates-scope-${uid}`};},
 methods:{change(key,value){this.$emit('update:modelValue',{...this.modelValue,[key]:value});}}};
</script>
<style scoped>
.update-settings{border-top:1px solid #8a91a0;margin-top:18px;padding-top:8px}.update-settings h3{font-size:1rem}.update-settings p{font-size:.85rem;line-height:1.5}.update-settings label{display:flex;align-items:center;gap:8px;margin:12px 0}.update-settings input{width:18px;height:18px;flex-shrink:0}.update-settings fieldset{border:0;padding:0;margin:0}.update-settings select{font:inherit;padding:6px;max-width:100%}
</style>