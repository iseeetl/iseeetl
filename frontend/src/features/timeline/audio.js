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

const speechQueue = [];
let activeSpeech = null;
const pumpSpeech = () => {
  if (activeSpeech) return;
  while (speechQueue.length) {
    const entry = speechQueue.shift();
    if (!entry.allowed()) continue;
    activeSpeech = entry;
    entry.utterance.onend = entry.utterance.onerror = () => { activeSpeech = null; pumpSpeech(); };
    window.speechSynthesis.speak(entry.utterance);
    return;
  }
};
export const refreshSpeechVisibility = () => {
  for (let i = speechQueue.length - 1; i >= 0; i--) if (!speechQueue[i].allowed()) speechQueue.splice(i, 1);
  if (activeSpeech && !activeSpeech.allowed()) {
    activeSpeech.utterance.onend = activeSpeech.utterance.onerror = null;
    activeSpeech = null;
    window.speechSynthesis.cancel();
  }
  pumpSpeech();
};
export const clearTimelineSpeech = () => {
  speechQueue.length = 0;
  if (activeSpeech) activeSpeech.utterance.onend = activeSpeech.utterance.onerror = null;
  activeSpeech = null;
  window.speechSynthesis.cancel();
};
export const speakIfNeeded = ({ text, lang, filters, matchFn, speed, isAllowed = () => true }) => {
  if (!Array.isArray(filters) || !isAllowed()) return;
  filters.forEach((filter) => {
    if (!filter || !filter.speech) return;
    if (filter.conditions !== null && !matchFn(filter.conditions)) return;
    const utterance = new SpeechSynthesisUtterance();
    utterance.text = text;
    utterance.lang = lang;
    utterance.rate = speed;
    speechQueue.push({ utterance, allowed: isAllowed });
  });
  pumpSpeech();
};
