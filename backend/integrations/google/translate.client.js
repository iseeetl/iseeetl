// 資格情報はADC（Application Default Credentials）で取得する。

const { TranslationServiceClient } = require('@google-cloud/translate').v3;
const { getGoogleTranslateConfig } = require('../../config/featureFlags');

let client = null;

const getClient = (config) => {
  if (!client) {
    client = new TranslationServiceClient({
      projectId: config.projectId,
      keyFilename: config.credentialsPath,
    });
  }
  return client;
};

// contentsを指定した1言語へ翻訳し、入力順に翻訳結果を返す。
async function translateText({ contents, sourceLanguageCode, targetLanguageCode, mimeType = 'text/plain' }) {
  const config = getGoogleTranslateConfig();
  if (!config) return [];
  if (!Array.isArray(contents) || contents.length === 0) return [];
  const parent = `projects/${config.projectId}/locations/${config.location}`;
  const [res] = await getClient(config).translateText({
    parent,
    contents,
    mimeType,
    sourceLanguageCode,
    targetLanguageCode,
  });
  const translations = res?.translations || [];
  return translations.map((t) => t.translatedText);
}

module.exports = { translateText };
