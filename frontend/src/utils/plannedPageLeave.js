let plannedPageLeave = false;

export const beginPlannedPageLeave = () => {
  plannedPageLeave = true;
};

export const resetPlannedPageLeave = () => {
  plannedPageLeave = false;
};

export const isPlannedPageLeave = () => plannedPageLeave;

export const isExplicitRequestCancellation = (error) =>
  !!(
    error &&
    (error.code === 'ERR_CANCELED' ||
      error.name === 'CanceledError' ||
      error.name === 'AbortError' ||
      error.__CANCEL__ === true)
  );

export const shouldIgnorePageLeaveError = (error) => isPlannedPageLeave() || isExplicitRequestCancellation(error);

export const shouldBeginPlannedPageLeaveForClick = (event) => {
  if (!event || event.defaultPrevented) return false;
  if (typeof event.button === 'number' && event.button !== 0) return false;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;

  const link = event.currentTarget;
  if (!link || typeof link.getAttribute !== 'function') return true;

  const target = link.getAttribute('target');
  if (target && target.toLowerCase() !== '_self') return false;
  if (link.hasAttribute('download')) return false;

  return true;
};
