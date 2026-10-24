export const SUPPLEMENT_CONTENT_LIMIT = 2000;
export const supplementContentLimit = () => SUPPLEMENT_CONTENT_LIMIT;

// 表示だけを短くする。保存データには触れず、サロゲートペアも分断しない。
export const supplementPreview = (content) => {
  const characters = Array.from(content || '');
  if (characters.length <= 300) return content || '';
  let preview = characters.slice(0, 300).join('');
  const lastSpace = preview.lastIndexOf(' ');
  if (lastSpace > 200) preview = preview.slice(0, lastSpace);
  return preview.trimEnd() + '…';
};
