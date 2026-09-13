const DEFAULT_RECORDING_TIMEOUT_MS = 29 * 1000;

const clearRecordingTimeout = (ctx) => {
  if (ctx && ctx.recordingTimeoutId) {
    clearTimeout(ctx.recordingTimeoutId);
    ctx.recordingTimeoutId = null;
  }
};

export const startRecording = async (
  ctx,
  { recorder, onStartError, onStopError, timeoutMs = DEFAULT_RECORDING_TIMEOUT_MS } = {}
) => {
  const rec = recorder || (ctx && ctx.$refs ? ctx.$refs.recorder : null);
  if (!rec) {
    if (onStartError) onStartError();
    return false;
  }

  ctx.waveformVisible = true;
  ctx.micReady = false;
  ctx.recording = false;

  try {
    await rec.start();
    ctx.micReady = true;
    ctx.recording = true;

    clearRecordingTimeout(ctx);
    ctx.recordingTimeoutId = setTimeout(() => {
      if (ctx.recording) {
        stopRecording(ctx, { recorder: rec, onStopError });
      }
    }, timeoutMs);
    return true;
  } catch (err) {
    ctx.waveformVisible = false;
    if (onStartError) onStartError(err);
    return false;
  }
};

export const stopRecording = async (ctx, { recorder, onStopError } = {}) => {
  clearRecordingTimeout(ctx);

  const rec = recorder || (ctx && ctx.$refs ? ctx.$refs.recorder : null);
  if (!rec) return;

  try {
    await rec.stop();
    ctx.recording = false;
  } catch (err) {
    if (onStopError) onStopError(err);
  }
};

export const handleDeviceReady = (ctx) => {
  ctx.micReady = true;
  ctx.recording = true;
};

export const handleDeviceError = (ctx, { onError } = {}) => {
  ctx.recording = false;
  ctx.waveformVisible = false;
  if (onError) onError();
};

export const handleRecordingBlob = (ctx, { blob, duration, revokeExistingAudioData = false, onTranscribe } = {}) => {
  ctx.recording = false;
  ctx.transcribing = typeof onTranscribe === 'function';

  if (!blob) {
    ctx.transcribing = false;
    ctx.waveformVisible = false;
    return;
  }

  const ext = blob.type.split('/')[1].split(';')[0].replace(/^x-/, '');
  if (revokeExistingAudioData && typeof ctx.audioData === 'string' && ctx.audioData.startsWith('blob:')) {
    window.URL.revokeObjectURL(ctx.audioData);
  }

  ctx.audioFile = new File([blob], `record_${Date.now()}.${ext}`, { type: blob.type });
  ctx.audioData = URL.createObjectURL(blob);
  ctx.audioSize = blob.size;
  ctx.audioDuration = duration;

  if (onTranscribe) {
    onTranscribe(ctx.audioFile);
  } else {
    ctx.waveformVisible = false;
  }
};

export const transcribeAudio = async (ctx, { file, transcribeApi, onText, onError } = {}) => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('lang', ctx.$i18n.locale);
    formData.append('room_id', ctx.$store.getters.roomId);

    const res = await transcribeApi(formData);
    if (res && res.data && res.data.text) {
      if (onText) {
        onText(res.data.text);
      } else {
        ctx.content = ctx.content ? ctx.content + '\n' + res.data.text : res.data.text;
      }
    }
    ctx.waveformVisible = false;
  } catch (err) {
    if (onError) onError(err);
    ctx.waveformVisible = false;
  } finally {
    ctx.transcribing = false;
  }
};
