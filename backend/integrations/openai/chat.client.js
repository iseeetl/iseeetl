const axios = require('axios');

const { createAbortError, toOpenAIError } = require('./errors');

// モデルと要求内容は呼び出し元で決め、HTTP要求は1回だけ送信する。
// 利用者データや秘密情報を残さないよう、送信内容とaxiosの元エラーを外部へ返すエラーに含めない。
function createOpenAIChatClient({ apiKey, baseURL = 'https://api.openai.com/v1', timeout = 20000 } = {}) {
  if (!apiKey) throw new Error('OpenAI API key is required');

  async function chatCompletions({
    model,
    messages,
    max_tokens,
    max_completion_tokens,
    modalities,
    signal,
  } = {}) {
    if (!model) throw new Error('OpenAI model is required');
    if (!Array.isArray(messages)) throw new Error('OpenAI messages are required');
    if (signal?.aborted) throw createAbortError();

    const body = { model, messages };
    if (max_tokens != null) body.max_tokens = max_tokens;
    if (max_completion_tokens != null) body.max_completion_tokens = max_completion_tokens;
    if (Array.isArray(modalities) && modalities.length > 0) body.modalities = modalities;

    try {
      const response = await axios.post(`${baseURL}/chat/completions`, body, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        timeout,
        signal,
      });
      return response?.data?.choices?.[0]?.message?.content || '';
    } catch (error) {
      throw toOpenAIError(error, 'OpenAI chat failed');
    }
  }

  return { chatCompletions };
}

module.exports = createOpenAIChatClient;
