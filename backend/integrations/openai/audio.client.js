const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const { createAbortError, toOpenAIError } = require('./errors');

const EXT_MIME_MAP = Object.freeze({
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  oga: 'audio/oga',
  aac: 'audio/aac',
  mp4: 'audio/mp4',
  m4a: 'audio/x-m4a',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
});

const extFromMime = (mime) =>
  Object.keys(EXT_MIME_MAP).find((extension) => EXT_MIME_MAP[extension] === mime) || null;

const mimeFromExt = (extension) => EXT_MIME_MAP[extension] || 'audio/wav';

// 文字起こしのHTTP要求は1回だけ送信する。クライアント内や呼び出し元で自動再試行しない。
function createOpenAIAudioClient({
  apiKey,
  model,
  baseURL = 'https://api.openai.com/v1',
  timeout = 20000,
} = {}) {
  if (!apiKey) throw new Error('OpenAI API key is required');
  if (typeof model !== 'string' || !model.trim()) throw new Error('OpenAI transcription model is required');

  async function callTranscriptions(formData, { signal } = {}) {
    if (signal?.aborted) throw createAbortError();
    try {
      const response = await axios.post(`${baseURL}/audio/transcriptions`, formData, {
        headers: { Authorization: `Bearer ${apiKey}`, ...formData.getHeaders() },
        maxBodyLength: Infinity,
        timeout,
        signal,
      });
      return response?.data?.text ?? '';
    } catch (error) {
      throw toOpenAIError(error, 'OpenAI transcription failed');
    }
  }

  async function transcribeFromBuffer({
    buffer,
    mimetype = 'audio/mpeg',
    filename,
    language,
    prompt,
    signal,
  } = {}) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('buffer is required');

    const mimeClean = String(mimetype || '').split(';')[0].trim() || 'audio/mpeg';
    const extension =
      extFromMime(mimeClean) ||
      (filename && path.extname(filename).slice(1).toLowerCase()) ||
      'mp3';
    const formData = new FormData();
    formData.append('file', buffer, {
      filename: filename || `record.${extension}`,
      contentType: mimeFromExt(extension),
    });
    formData.append('model', model);
    if (language) formData.append('language', language);
    if (prompt) formData.append('prompt', prompt);

    return callTranscriptions(formData, { signal });
  }

  async function transcribeFromFilePath({ filePath, language, prompt, signal } = {}) {
    if (!filePath || !fs.existsSync(filePath)) {
      const error = new Error('Audio file not found');
      error.status = 400;
      throw error;
    }

    const extension = path.extname(filePath).slice(1).toLowerCase();
    const mime = mimeFromExt(extension);

    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath), {
      filename: path.basename(filePath),
      contentType: mime,
    });
    formData.append('model', model);
    if (language) formData.append('language', language);
    if (prompt) formData.append('prompt', prompt);
    return callTranscriptions(formData, { signal });
  }

  return { transcribeFromBuffer, transcribeFromFilePath };
}

module.exports = createOpenAIAudioClient;
