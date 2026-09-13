const DEFAULT_STORAGE_KEY = 'iseeetl_setting';

const parseStorage = (raw) => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const readTimelineSettings = ({ storageKey = DEFAULT_STORAGE_KEY, localStorageRef } = {}) => {
  const storage = localStorageRef || (typeof window !== 'undefined' ? window.localStorage : null);
  if (!storage || typeof storage.getItem !== 'function') return {};
  return parseStorage(storage.getItem(storageKey));
};

export const resolveTimelineTextStyle = ({ storage = {}, localFontSize } = {}) => {
  const fontFamily = storage.timelineFontFamily ? `font-family:${storage.timelineFontFamily};` : '';
  const storedFontSize = storage.timelineFontSize ? `font-size:${storage.timelineFontSize};` : '';
  const fontSize = localFontSize ? `font-size:${localFontSize};` : storedFontSize;
  return { fontFamily, fontSize };
};

export const applyTimelineSettings = ({ timeline, ui, storage, storageKey, localStorageRef } = {}) => {
  const resolvedStorage = storage || readTimelineSettings({ storageKey, localStorageRef });
  const { fontFamily, fontSize } = resolveTimelineTextStyle({
    storage: resolvedStorage,
    localFontSize: ui?.localFontSize,
  });

  if (timeline) {
    timeline.fontFamily = fontFamily;
    timeline.fontSize = fontSize;
  }

  return { fontFamily, fontSize };
};
