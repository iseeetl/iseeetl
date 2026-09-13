// 再生時間を秒で返す。指定済みの有効な値を優先し、取得できない場合は0を返す。
export async function getAudioDuration(file, presetDurationSeconds) {
  if (Number.isFinite(presetDurationSeconds) && presetDurationSeconds > 0) return presetDurationSeconds;

  if (!(file instanceof Blob)) return 0;

  const url = URL.createObjectURL(file);
  try {
    const durationSeconds = await new Promise((resolve) => {
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.src = url;

      audio.onloadedmetadata = () => resolve(audio.duration);
      audio.onerror = () => resolve(Infinity);
    });

    const roundToTenths = (value) => Number(value.toFixed(1));
    if (Number.isFinite(durationSeconds) && durationSeconds > 0) return roundToTenths(durationSeconds);
  } finally {
    URL.revokeObjectURL(url);
  }

  // 取得できなければ、Web Audio APIで再生時間を調べる。
  try {
    const arrayBuffer = await file.arrayBuffer();
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContextConstructor();
    const decodedAudioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    return Math.round(decodedAudioBuffer.duration);
  } catch {
    return 0;
  }
}
