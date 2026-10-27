// Native pickers are selected by device capabilities, not the timeline width.
export const isAppleMobile = (nav = globalThis.navigator) => Boolean(nav && (
  /iPhone|iPad|iPod/.test(nav.userAgent || '') ||
  (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
));
export const usesNativeCamera = (nav = globalThis.navigator) =>
  isAppleMobile(nav) || /Android/i.test(nav?.userAgent || '');

export const usesAttachmentMenu = (nav = globalThis.navigator) => /Android/i.test(nav?.userAgent || '');
