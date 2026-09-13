export const sortTagsByOrder = (tags) => {
  const list = Array.isArray(tags) ? [...tags] : [];
  return list.sort((a, b) => {
    const left = Number.isFinite(Number(a?.order)) ? Number(a.order) : Number.POSITIVE_INFINITY;
    const right = Number.isFinite(Number(b?.order)) ? Number(b.order) : Number.POSITIVE_INFINITY;
    if (left !== right) return left - right;
    return String(a?.name || '').localeCompare(String(b?.name || ''));
  });
};

export const resolveLangLabel = (languages, t, langCode) => {
  const items = Array.isArray(languages) ? languages : [];
  const found = items.find((language) => language.value === langCode);
  return found ? t(found.label) : langCode;
};

export const parseAndValidateTagCsv = (text, { minOrder = 1, maxOrder = 100, maxNameLength = 50 } = {}) => {
  const raw = String(text || '').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/);

  let hasError = false;
  const rows = [];

  for (const line of lines) {
    if (line.indexOf(',') === -1) continue;
    const matched = line.match(/^\s*(\d+)\s*,\s*(?:"((?:[^"]|"")*)"|([^",]*))\s*$/);
    if (!matched) {
      hasError = true;
      break;
    }

    const order = Number((matched[1] || '').trim().replace(/^\uFEFF/, ''));
    const nameRaw = matched[2] == null ? matched[3] : matched[2].replace(/""/g, '"');
    const name = String(nameRaw || '').trim();

    if (!Number.isInteger(order) || order < minOrder || order > maxOrder || name.length < 1) {
      hasError = true;
      break;
    }
    if (name.length > maxNameLength) {
      hasError = true;
      break;
    }

    rows.push([order, name]);
  }

  if (hasError || rows.length === 0) return { isValid: false, rows: [] };
  return { isValid: true, rows };
};

export const buildTagCsvText = (tags) => {
  const sorted = sortTagsByOrder(tags);
  return sorted
    .map((tag) => {
      const name = String(tag?.name || '');
      const escaped = name.replace(/"/g, '""');
      const needsQuote = /[",\r\n]/.test(name);
      return `${tag.order},${needsQuote ? `"${escaped}"` : escaped}\r\n`;
    })
    .join('');
};

export const downloadCsvFile = ({ filename, content }) => {
  const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
  const blob = new Blob([bom, content], { type: 'text/csv' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(objectUrl);
};

export const normalizeTagOrderInput = (rawOrder, { min = 1, max = 100, fallback = 100 } = {}) => {
  if (rawOrder === '' || rawOrder === null || typeof rawOrder === 'undefined') {
    return { valid: true, value: fallback };
  }

  const value = Number(rawOrder);
  if (!Number.isInteger(value) || value < min || value > max) {
    return { valid: false, value: null };
  }

  return { valid: true, value };
};

export const buildTagListPayload = ({ scope, scopeId }) => {
  if (scope === 'floor' && scopeId != null) return { floor_id: scopeId };
  if (scope === 'room' && scopeId != null) return { room_id: scopeId };
  return {};
};

export const buildTagUpsertPayload = ({
  scope,
  scopeId,
  tagId,
  order,
  name,
  lang,
  managementMode = false,
  deleteFlg,
}) => {
  const payload = {
    ...buildTagListPayload({ scope, scopeId }),
    order,
    name,
  };
  if (typeof lang !== 'undefined') payload.lang = lang;
  if (tagId != null) payload._id = tagId;
  if (managementMode && typeof deleteFlg !== 'undefined') payload.delete_flg = deleteFlg;
  return payload;
};

export const buildTagDeletePayload = (tag) => {
  if (!tag || !tag._id) return {};
  return { _id: tag._id };
};
