const axios = require('axios');

const { createAbortError, toGeminiError } = require('./errors');

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const BLOCKED_FINISH_REASONS = Object.freeze(['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII']);

// モデルと要求内容は呼び出し元で決め、HTTP要求は1回だけ送信する。再試行しない。
// 利用者データや秘密情報を残さないよう、送信内容とaxiosの元エラーを外部へ返すエラーに含めない。
function createGeminiGenerateClient({ apiKey, baseURL = DEFAULT_BASE_URL, timeout = 20000 } = {}) {
  if (!apiKey) throw new Error('Gemini API key is required');

  async function generateContent({
    model,
    systemInstruction,
    text,
    audio,
    responseSchema,
    maxOutputTokens,
    thinkingLevel = 'LOW',
    signal,
  } = {}) {
    if (!model) throw new Error('Gemini model is required');
    if (typeof text !== 'string' || !text.trim()) throw new Error('Gemini prompt text is required');
    if (audio && (!Buffer.isBuffer(audio.buffer) || audio.buffer.length === 0 || !audio.mimeType)) {
      throw new Error('Gemini audio input is invalid');
    }
    if (signal?.aborted) throw createAbortError();

    const parts = [{ text }];
    if (audio) {
      parts.push({ inlineData: { mimeType: audio.mimeType, data: audio.buffer.toString('base64') } });
    }
    const generationConfig = {};
    if (maxOutputTokens != null) generationConfig.maxOutputTokens = maxOutputTokens;
    if (responseSchema) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = responseSchema;
    }
    generationConfig.thinkingConfig = { thinkingLevel, includeThoughts: false };

    const body = {
      ...(typeof systemInstruction === 'string' && systemInstruction.trim()
        ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
        : {}),
      contents: [{ role: 'user', parts }],
      generationConfig,
    };

    let response;
    try {
      response = await axios.post(`${baseURL}/models/${model}:generateContent`, body, {
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        timeout,
        signal,
      });
    } catch (error) {
      throw toGeminiError(error, 'Gemini generateContent failed');
    }

    const data = response?.data && typeof response.data === 'object' ? response.data : {};
    const candidate = Array.isArray(data.candidates) ? data.candidates[0] : undefined;
    const candidateParts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    const answer = candidateParts
      .filter((part) => part && !part.thought && typeof part.text === 'string')
      .map((part) => part.text)
      .join('');
    const finishReason = typeof candidate?.finishReason === 'string' ? candidate.finishReason : null;
    const blocked = Boolean(data.promptFeedback?.blockReason) || BLOCKED_FINISH_REASONS.includes(finishReason);
    return { text: answer, finishReason, blocked };
  }

  return { generateContent };
}

module.exports = createGeminiGenerateClient;
