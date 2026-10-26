import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import MobileComposerTools from '@/components/timeline/inputs/MobileComposerTools.vue';
import EditPostDialog from '@/components/timeline/dialogs/EditPostDialog.vue';
import EditReplyDialog from '@/components/timeline/dialogs/EditReplyDialog.vue';
import EditSupplementDialog from '@/components/timeline/dialogs/EditSupplementDialog.vue';
const create = props => mount(MobileComposerTools,{props,global:{mocks:{$t:key=>key}}});
describe('direct composer shortcuts', () => {
  it('uses named native buttons and directly invokes existing media/record actions', async () => {
    const w=create({});const buttons=w.findAll('button');expect(buttons.map(b=>b.attributes('aria-label'))).toEqual(['composerSource.library','composerSource.camera','composerSource.file','composerSource.record']);
    for(const b of buttons) { expect(b.element.tabIndex).toBe(0);expect(b.attributes('aria-expanded')).toBeUndefined();await b.trigger('click'); }
    expect(w.emitted('choose')).toEqual([['library'],['camera'],['file']]);expect(w.emitted('record')).toHaveLength(1);w.unmount();
  });
  it('keeps guest buttons operable so the existing login dialog handles all four', async () => {
    const w=create({locked:true});for(const b of w.findAll('button')) {expect(b.attributes('aria-description')).toBe('ログインが必要です');expect(b.element.disabled).toBe(false);expect(b.classes()).toContain('is-locked');await b.trigger('click');}
    expect(w.emitted('choose')).toHaveLength(3);expect(w.emitted('record')).toHaveLength(1);w.unmount();
  });
  it('allows stopping from either microphone toolbar during recording', async () => {
    const w=create({recording:true});expect(w.findAll('button').slice(0,3).every(b=>b.element.disabled)).toBe(true);const stop=w.get('button[aria-label="録音停止"]');expect(stop.element.disabled).toBe(false);expect(stop.attributes('aria-pressed')).toBe('true');await stop.trigger('click');expect(w.emitted('record')).toHaveLength(1);w.unmount();
  });
  it('disables all controls while sending or transcribing', () => {
    for(const props of [{sending:true},{transcribing:true}]) {const w=create(props);expect(w.findAll('button').every(b=>b.element.disabled)).toBe(true);w.unmount();}
  });
});
for (const dialog of [EditPostDialog,EditReplyDialog,EditSupplementDialog]) {
  it(`${dialog.__file}: disables empty/invalid/busy drafts but allows text or retained media`, () => {
    const state={content:'',v$:{$invalid:false},maxVideoSize:10,maxVideoDuration:10,maxAudioSize:10,maxAudioDuration:10};
    const disabled=overrides=>dialog.computed.submissionDisabled.call({...state,...overrides});
    expect(disabled({})).toBe(true);expect(disabled({content:'hello'})).toBe(false);expect(disabled({imageName:'saved.png'})).toBe(false);
    expect(disabled({content:'hello',v$:{$invalid:true}})).toBe(true);expect(disabled({content:'hello',recording:true})).toBe(true);
    expect(disabled({videoFile:{},videoSize:11})).toBe(true);expect(disabled({audioFile:{},audioSize:5,audioDuration:4})).toBe(false);
  });
}

for (const dialog of [EditPostDialog,EditReplyDialog,EditSupplementDialog]) {
  it('records without automatic transcription even when the capability is enabled', async () => {
    const create=URL.createObjectURL;URL.createObjectURL=()=> 'blob:synthetic';
    const ctx={content:'existing',roomTags:['speech'],removeMedia:vi.fn(),transcribeAudio:vi.fn(),$store:{getters:{openaiTranscriptionAvailable:true}}};
    try { await dialog.methods.handleBlob.call(ctx,{blob:new Blob(['test'],{type:'audio/webm'}),duration:2});expect(ctx.transcribeAudio).not.toHaveBeenCalled();expect(ctx.content).toBe('existing');expect(ctx.roomTags).toEqual(['speech']);expect(ctx.audioFile.type).toBe('audio/webm'); } finally { URL.createObjectURL=create; }
  });
}

for (const dialog of [EditPostDialog,EditReplyDialog]) {
  it('does not submit the underlying post with Ctrl+Enter while the camera is open', () => {
    const ctx={cameraVisible:true,submit:vi.fn()};dialog.methods.handleEditorShortcut.call(ctx,{key:'Enter',ctrlKey:true,preventDefault:vi.fn()});expect(ctx.submit).not.toHaveBeenCalled();
  });
}

it('uses neutral microphone at rest and a named stop control when recording', async () => {
  const w=create({});const mic=w.findAll('button')[3];
  expect(mic.classes()).toContain('ui-button--neutral');expect(mic.attributes('aria-pressed')).toBe('false');
  await w.setProps({recording:true});expect(mic.classes()).toContain('ui-button--danger');expect(mic.attributes('aria-label')).toBe('録音停止');expect(mic.attributes('title')).toBe('録音停止');
  w.unmount();
});
for(const dialog of [EditPostDialog,EditReplyDialog,EditSupplementDialog]) {
 it(`${dialog.__file}: accepts 2000-unit descriptions without extending post/reply bodies`,()=>{
  const rules=typeof dialog.validations==='function'?dialog.validations.call({contentLimit:2000}):dialog.validations;
  for(const field of ['imageCaption','audioDescription']) {const validate=rules[field].maxLength.$validator;expect(validate('あ'.repeat(2000))).toBe(true);expect(validate('a'.repeat(2001))).toBe(false);}
  expect(rules.audioTitle.maxLength.$validator('a'.repeat(201))).toBe(false);
  if(dialog!==EditSupplementDialog)expect(rules.content.maxLength.$validator('a'.repeat(401))).toBe(false);
 });
}
