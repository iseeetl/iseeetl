export const copyText = async (text, documentObject = document, navigatorObject = navigator) => {
  const value = String(text ?? '');
  if (navigatorObject.clipboard && typeof navigatorObject.clipboard.writeText === 'function') {
    await navigatorObject.clipboard.writeText(value);
    return;
  }

  const textarea = documentObject.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  documentObject.body.appendChild(textarea);
  textarea.select();

  try {
    if (!documentObject.execCommand || !documentObject.execCommand('copy')) {
      throw new Error('Clipboard copy is not supported.');
    }
  } finally {
    textarea.remove();
  }
};
