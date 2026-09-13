export const DEFAULT_GUEST_NAMES = Object.freeze({
  de: 'Gast',
  en: 'Guest',
  es: 'Invitado',
  fr: 'Invité',
  he: 'אורח',
  hi: 'अतिथि',
  it: 'Ospite',
  ja: 'ゲスト',
  ko: '게스트',
  pt: 'Convidado',
  ru: 'Гость',
  sv: 'Gäst',
  tr: 'Misafir',
  uk: 'Гість',
  vi: 'Khách',
  zh: '访客',
});

export const resolveDefaultGuestName = (locale) => DEFAULT_GUEST_NAMES[locale] || DEFAULT_GUEST_NAMES.ja;
