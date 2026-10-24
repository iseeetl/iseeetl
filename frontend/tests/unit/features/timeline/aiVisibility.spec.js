import { describe, it, expect, vi, afterEach } from 'vitest';
import { normalizeAIVisibility, sanitizeRoomAIVisibility, isSupplementVisible } from '@/features/timeline/aiVisibility';
import { createApplicationStore } from '@/store';
import { clearTimelineSpeech, speakIfNeeded, refreshSpeechVisibility } from '@/features/timeline/audio';
const a = '202610240000000000000001';
const b = '202610240000000000000002';
const ai = (id) => ({ ai_origin: { tag_id: id, kind: 'conversation' } });
describe('AI supplement viewing by provenance', () => {
  it('retains humans and unknown legacy records, including replies', () => {
    expect(isSupplementVisible({}, true, { mode: 'none' })).toBe(true);
    expect(isSupplementVisible({ user: { name: 'AI' } }, true, { mode: 'none' })).toBe(true);
    expect(isSupplementVisible(ai(a), true, { mode: 'none' })).toBe(false);
    expect(isSupplementVisible({}, false, { mode: 'all' })).toBe(false);
  });
  it('uses origin IDs, not parent tags; new tags remain shown', () => {
    const pref = { mode: 'tags', hiddenTagIds: [a] };
    expect(isSupplementVisible({ ...ai(a), room_tags: [b] }, true, pref)).toBe(false);
    expect(isSupplementVisible(ai(b), true, pref)).toBe(true);
    expect(isSupplementVisible(ai(null), true, pref)).toBe(true);
    expect(isSupplementVisible(ai(null), true, { ...pref, hiddenTagIds: ['__unknown__'] })).toBe(false);
  });
  it('rejects malformed stored preferences and prototype keys', () => {
    expect(normalizeAIVisibility({ mode: 'bad', hiddenTagIds: [a, a, null, 1] })).toEqual({ mode: 'all', hiddenTagIds: [a] });
    expect(sanitizeRoomAIVisibility(JSON.parse('{"__proto__":{"mode":"none"}}'))).toEqual({});
  });
  it('isolates rooms and preserves hidden selections across modes', () => {
    const store = createApplicationStore({ plugins: [] });
    store.commit('setRoomAIVisibility', { roomId: a, preference: { mode: 'tags', hiddenTagIds: [a] } });
    expect(store.getters.isSupplementVisible(ai(a), a)).toBe(false);
    expect(store.getters.isSupplementVisible(ai(a), b)).toBe(true);
    store.commit('setRoomAIVisibility', { roomId: a, preference: { ...store.getters.roomAIVisibility(a), mode: 'all' } });
    expect(store.getters.isSupplementVisible(ai(a), a)).toBe(true);
    expect(store.getters.roomAIVisibility(a).hiddenTagIds).toEqual([a]);
  });
});
describe('speech follows the same viewing permission', () => {
  afterEach(() => { clearTimelineSpeech(); vi.unstubAllGlobals(); });
  it('skips hidden queued AI and preserves a following human utterance', () => {
    vi.stubGlobal('SpeechSynthesisUtterance', function () {});
    const spoken = [];
    vi.stubGlobal('speechSynthesis', { speak: (u) => spoken.push(u), cancel: vi.fn() });
    let show = true;
    const speak = (text, isAllowed) => speakIfNeeded({ text, lang: 'ja', filters: [{ speech: true, conditions: null }], speed: 1, isAllowed });
    speak('human one'); speak('AI', () => show); speak('human two');
    show = false; refreshSpeechVisibility();
    expect(spoken.map((u) => u.text)).toEqual(['human one']);
    spoken[0].onend();
    expect(spoken.map((u) => u.text)).toEqual(['human one', 'human two']);
  });
  it('stops currently playing hidden AI and keeps visible queued content', () => {
    vi.stubGlobal('SpeechSynthesisUtterance', function () {});
    const spoken = []; const cancel = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak: (u) => spoken.push(u), cancel });
    let show = true;
    speakIfNeeded({ text: 'AI', filters: [{ speech: true, conditions: null }], isAllowed: () => show });
    speakIfNeeded({ text: 'human', filters: [{ speech: true, conditions: null }] });
    show = false; refreshSpeechVisibility();
    expect(cancel).toHaveBeenCalledOnce();
    expect(spoken.map((u) => u.text)).toEqual(['AI', 'human']);
  });
});
