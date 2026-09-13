export const runWithSendingAndProgress = async ({ setSending, setProgress, task }) => {
  if (typeof setSending === 'function') setSending(true);

  const onProgress = (progressEvent) => {
    if (typeof setProgress !== 'function') return;
    if (!progressEvent || !progressEvent.total) return;
    setProgress(Math.floor((progressEvent.loaded * 100) / progressEvent.total));
  };

  try {
    return await task({ onProgress });
  } finally {
    if (typeof setSending === 'function') setSending(false);
    if (typeof setProgress === 'function') setProgress(0);
  }
};
