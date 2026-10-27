import { describe, expect, it } from 'vitest';
import { isAppleMobile, usesNativeCamera } from '@/features/timeline/mediaPicker';
describe('native media picker routing', () => {
  it('keeps desktop webcam capture', () => {
    expect(usesNativeCamera({userAgent:'Macintosh Safari',platform:'MacIntel',maxTouchPoints:0})).toBe(false);
  });
  it.each([{userAgent:'iPhone Mobile Safari'},{userAgent:'Macintosh Safari',platform:'MacIntel',maxTouchPoints:5}])('uses native capture on Apple mobile devices', nav => {
    expect(isAppleMobile(nav)).toBe(true);expect(usesNativeCamera(nav)).toBe(true);
  });
  it('uses native capture on Android', () => {
    expect(usesNativeCamera({userAgent:'Android Chrome'})).toBe(true);
  });
});
