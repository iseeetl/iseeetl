import {describe,it,expect} from 'vitest';
import {mount} from '@vue/test-utils';
import Field from '@/components/timeline/SourceLanguageField.vue';
import ja from '@/locales/ja.json';import en from '@/locales/en.json';
describe('text language field',()=>{
  it.each([ja,en])('labels a keyboard-accessible native select and connects its help text',async(locale)=>{
    const w=mount(Field,{props:{modelValue:'ja',controlId:'source'},global:{mocks:{$t:k=>k.startsWith('sourceLanguage.')?locale.sourceLanguage[k.split('.')[1]]:k}}});
    const select=w.get('select');expect(select.attributes('id')).toBe('source');expect(w.get('label').attributes('for')).toBe('source');
    expect(w.get('label').text()).toBe(locale.sourceLanguage.label);expect(select.attributes('aria-describedby')).toBe('source-description');
    await select.setValue('en');expect(w.emitted('update:modelValue')).toEqual([['en']]);w.unmount();
  });
});
