const normalizeEnvValue = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const hasEnv = (name) => normalizeEnvValue(process.env[name]).length > 0;

const requireEnv = (name) => {
  const value = normalizeEnvValue(process.env[name]);
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
};

const missingEnv = (names = []) => names.filter((name) => !hasEnv(name));

const assertRequiredEnv = (names = []) => {
  const missing = missingEnv(names);
  if (missing.length > 0) {
    throw new Error(`Missing required env: ${missing.join(', ')}`);
  }
};

const readIntEnv = (name, { defaultValue, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const raw = normalizeEnvValue(process.env[name]);
  if (!raw) return defaultValue;

  const value = Number(raw);
  if (!Number.isInteger(value)) return defaultValue;
  if (value < min || value > max) return defaultValue;
  return value;
};

const readCsvEnv = (name, { defaultValue = [] } = {}) => {
  const raw = normalizeEnvValue(process.env[name]);
  if (!raw) return [...defaultValue];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

module.exports = {
  normalizeEnvValue,
  hasEnv,
  requireEnv,
  missingEnv,
  assertRequiredEnv,
  readIntEnv,
  readCsvEnv,
};
