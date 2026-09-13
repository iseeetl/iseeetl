export const playNotificationAudio = ({ audioRef, onSuccess, onError } = {}) => {
  if (!audioRef || typeof audioRef.play !== 'function') {
    if (typeof onError === 'function') onError(new Error('Notification audio element is unavailable'));
    return Promise.resolve(false);
  }

  let playResult;
  try {
    audioRef.currentTime = 0;
    // ユーザ操作による再生許可を維持するため、awaitより前に同期的に呼び出す。
    playResult = audioRef.play();
  } catch (error) {
    if (typeof onError === 'function') onError(error);
    return Promise.resolve(false);
  }

  return Promise.resolve(playResult).then(
    () => {
      if (typeof onSuccess === 'function') onSuccess();
      return true;
    },
    (error) => {
      if (typeof onError === 'function') onError(error);
      return false;
    }
  );
};

export const playAudioIfMatch = ({
  postTags = [],
  roomTags = [],
  soundTags = [],
  audioRef,
  onSuccess,
  onError,
}) => {
  if (!audioRef) return Promise.resolve(false);
  const matched = [...postTags, ...roomTags].filter((value) => postTags.includes(value) && soundTags.includes(value));
  if (!matched.length) return Promise.resolve(false);
  return playNotificationAudio({ audioRef, onSuccess, onError });
};

export const speakIfNeeded = ({ text, lang, filters, matchFn, speed }) => {
  if (!Array.isArray(filters)) return;
  filters.forEach((filter) => {
    if (!filter || !filter.speech) return;
    if (filter.conditions !== null && !matchFn(filter.conditions)) return;
    const uttr = new SpeechSynthesisUtterance();
    uttr.text = text;
    uttr.lang = lang;
    uttr.rate = speed;
    window.speechSynthesis.speak(uttr);
  });
};
