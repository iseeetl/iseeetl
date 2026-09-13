import store from '@/store/index.js';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const entries = [];
const subscribers = new Set();
let savedDocumentOverflow;
let isKeydownListening = false;

const warn = (message) => {
  if (!import.meta.env.PROD) {
    console.warn(`[overlayStack] ${message}`);
  }
};

const hasHiddenAncestor = (element) => {
  let current = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    if (current.hidden || current.inert === true || current.getAttribute('aria-hidden') === 'true') {
      return true;
    }

    const style = window.getComputedStyle(current);
    if (!style || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') {
      return true;
    }
    current = current.parentElement;
  }

  return false;
};

const isFocusable = (element) => {
  if (
    !element ||
    !element.isConnected ||
    element.disabled ||
    element.matches(':disabled') ||
    hasHiddenAncestor(element)
  ) {
    return false;
  }
  return element.getClientRects().length > 0;
};

const getFocusableElements = (panel) => Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isFocusable);

const focusElement = (element) => {
  if (!element || typeof element.focus !== 'function') return false;
  element.focus();
  return document.activeElement === element;
};

const handleKeydown = (event) => {
  const topEntry = entries[entries.length - 1];
  if (!topEntry) return;

  if (event.key === 'Escape') {
    if (!topEntry.closeOnEscape || typeof topEntry.requestClose !== 'function') return;

    topEntry.requestClose({ reason: 'escape' });
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  if (event.key !== 'Tab') return;

  const focusableElements = getFocusableElements(topEntry.panel);
  let focusTarget = null;

  if (!focusableElements.length) {
    focusTarget = topEntry.panel;
  } else {
    const first = focusableElements[0];
    const last = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;
    const activeIndex = focusableElements.indexOf(activeElement);

    if (event.shiftKey && (activeElement === first || activeIndex === -1)) {
      focusTarget = last;
    } else if (!event.shiftKey && (activeElement === last || activeIndex === -1)) {
      focusTarget = first;
    }
  }

  if (!focusTarget) return;

  focusElement(focusTarget);
  event.preventDefault();
  event.stopPropagation();
};

const setKeydownListening = (listening) => {
  if (listening === isKeydownListening) return;

  if (listening) {
    document.addEventListener('keydown', handleKeydown, true);
  } else {
    document.removeEventListener('keydown', handleKeydown, true);
  }
  isKeydownListening = listening;
};

const setPanelIsTop = (panel, isTop) => {
  if (isTop) {
    panel.inert = false;
    panel.removeAttribute('inert');
    panel.removeAttribute('aria-hidden');
    return;
  }

  panel.inert = true;
  panel.setAttribute('inert', '');
  panel.setAttribute('aria-hidden', 'true');
};

const getBackdrop = (wrapper) =>
  Array.from(wrapper.children).find((element) => element.classList.contains('ui-dialog__backdrop'));

const clearEntryPresentation = (entry) => {
  const backdrop = getBackdrop(entry.wrapper);

  entry.wrapper.style.removeProperty('z-index');
  if (backdrop) backdrop.style.removeProperty('z-index');
  entry.panel.style.removeProperty('z-index');
  setPanelIsTop(entry.panel, true);
};

const updateEntryPresentation = () => {
  entries.forEach((entry, index) => {
    const backdrop = getBackdrop(entry.wrapper);
    const backdropZIndex = 1000 + index * 2;

    entry.wrapper.style.zIndex = String(backdropZIndex);
    if (backdrop) backdrop.style.zIndex = String(backdropZIndex);
    entry.panel.style.zIndex = String(backdropZIndex + 1);
    setPanelIsTop(entry.panel, index === entries.length - 1);
  });
};

const notifySubscribers = () => {
  const state = {
    size: entries.length,
    topPanel: entries.length ? entries[entries.length - 1].panel : null,
  };
  subscribers.forEach((listener) => listener(state));
};

const setGlobalOverlayState = (active) => {
  const rootStyle = document.documentElement.style;

  if (active) {
    savedDocumentOverflow = {
      value: rootStyle.getPropertyValue('overflow'),
      priority: rootStyle.getPropertyPriority('overflow'),
    };
    rootStyle.setProperty('overflow', 'hidden');
    setKeydownListening(true);
  } else {
    if (savedDocumentOverflow.value) {
      rootStyle.setProperty('overflow', savedDocumentOverflow.value, savedDocumentOverflow.priority);
    } else {
      rootStyle.removeProperty('overflow');
    }
    savedDocumentOverflow = undefined;
    setKeydownListening(false);
  }

  if (store && typeof store.dispatch === 'function') {
    store.dispatch('doSetInertAppContainer', active);
  }
};

export const registerDialog = ({ wrapper, panel, closeOnEscape, requestClose }) => {
  const token = Symbol('ui-dialog');
  const wasEmpty = entries.length === 0;

  entries.push({ token, wrapper, panel, closeOnEscape, requestClose });
  if (wasEmpty) setGlobalOverlayState(true);
  updateEntryPresentation();
  notifySubscribers();

  return token;
};

export const updateDialog = (token, { closeOnEscape, requestClose }) => {
  const entry = entries.find((candidate) => candidate.token === token);
  if (!entry) {
    warn('updateDialog received an unknown token.');
    return;
  }

  entry.closeOnEscape = closeOnEscape;
  entry.requestClose = requestClose;
  notifySubscribers();
};

export const unregisterDialog = (token) => {
  const index = entries.findIndex((entry) => entry.token === token);
  if (index === -1) {
    warn('unregisterDialog received an unknown token.');
    return;
  }

  const [entry] = entries.splice(index, 1);
  clearEntryPresentation(entry);
  updateEntryPresentation();
  if (!entries.length) setGlobalOverlayState(false);
  notifySubscribers();
};

export const getTopPanel = () => (entries.length ? entries[entries.length - 1].panel : null);

export const subscribeStackChange = (listener) => {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
};
