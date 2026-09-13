// OneSignalが端末の言語設定に応じて通知文を選ぶため、アプリの全対応言語をそろえる。
const { ALLOWED_LANGUAGES } = require('./languages');

const LOCALIZED_HEADINGS = {
  ja: ['あなたの投稿へ情報が付加されました', 'あなたの返信へ情報が付加されました', '絞り込みに一致する付加情報がありました', '絞り込みに一致する投稿がありました', '絞り込みに一致する返信がありました', '返信がありました', '返信した投稿に新しい返信がありました'],
  en: ['Additional information was added to your post', 'Additional information was added to your reply', 'A supplement matching your filter was added', 'A post matching your filter was made', 'A reply matched your filter', 'A new reply was added', 'A thread you replied to got a new reply'],
  zh: ['您的帖子添加了附加信息', '您的回复添加了附加信息', '添加了符合筛选条件的附加信息', '发布了符合筛选条件的帖子', '发布了符合筛选条件的回复', '有新回复', '您回复过的帖子有新回复'],
  pt: ['Foram adicionadas informações à sua publicação', 'Foram adicionadas informações à sua resposta', 'Foi adicionado um complemento que corresponde ao seu filtro', 'Foi publicada uma mensagem que corresponde ao seu filtro', 'Uma resposta correspondeu ao seu filtro', 'Foi adicionada uma nova resposta', 'Uma publicação à qual respondeu recebeu uma nova resposta'],
  ko: ['내 게시물에 추가 정보가 등록되었습니다', '내 답글에 추가 정보가 등록되었습니다', '필터와 일치하는 추가 정보가 등록되었습니다', '필터와 일치하는 게시물이 등록되었습니다', '필터와 일치하는 답글이 등록되었습니다', '새 답글이 등록되었습니다', '답글을 남긴 게시물에 새 답글이 등록되었습니다'],
  vi: ['Thông tin bổ sung đã được thêm vào bài đăng của bạn', 'Thông tin bổ sung đã được thêm vào phản hồi của bạn', 'Đã thêm thông tin bổ sung khớp với bộ lọc của bạn', 'Đã có bài đăng khớp với bộ lọc của bạn', 'Đã có phản hồi khớp với bộ lọc của bạn', 'Đã có phản hồi mới', 'Bài đăng bạn đã phản hồi có phản hồi mới'],
  fr: ['Des informations ont été ajoutées à votre publication', 'Des informations ont été ajoutées à votre réponse', 'Un complément correspondant à votre filtre a été ajouté', 'Une publication correspondant à votre filtre a été créée', 'Une réponse correspond à votre filtre', 'Une nouvelle réponse a été ajoutée', 'Une publication à laquelle vous avez répondu a reçu une nouvelle réponse'],
  es: ['Se añadió información a tu publicación', 'Se añadió información a tu respuesta', 'Se añadió información que coincide con tu filtro', 'Se publicó una entrada que coincide con tu filtro', 'Una respuesta coincide con tu filtro', 'Se añadió una respuesta nueva', 'Una publicación a la que respondiste recibió una respuesta nueva'],
  sv: ['Ytterligare information lades till i ditt inlägg', 'Ytterligare information lades till i ditt svar', 'Ett tillägg som matchar ditt filter lades till', 'Ett inlägg som matchar ditt filter publicerades', 'Ett svar matchade ditt filter', 'Ett nytt svar lades till', 'Ett inlägg som du svarade på har fått ett nytt svar'],
  hi: ['आपकी पोस्ट में अतिरिक्त जानकारी जोड़ी गई', 'आपके उत्तर में अतिरिक्त जानकारी जोड़ी गई', 'आपके फ़िल्टर से मेल खाने वाली अतिरिक्त जानकारी जोड़ी गई', 'आपके फ़िल्टर से मेल खाने वाली पोस्ट की गई', 'एक उत्तर आपके फ़िल्टर से मेल खाता है', 'एक नया उत्तर जोड़ा गया', 'जिस पोस्ट का आपने उत्तर दिया था उस पर नया उत्तर आया है'],
  it: ['Sono state aggiunte informazioni al tuo post', 'Sono state aggiunte informazioni alla tua risposta', 'È stato aggiunto un supplemento corrispondente al tuo filtro', 'È stato pubblicato un post corrispondente al tuo filtro', 'Una risposta corrisponde al tuo filtro', 'È stata aggiunta una nuova risposta', 'Un post a cui hai risposto ha ricevuto una nuova risposta'],
  ru: ['К вашей публикации добавлена информация', 'К вашему ответу добавлена информация', 'Добавлена информация, соответствующая вашему фильтру', 'Опубликована запись, соответствующая вашему фильтру', 'Ответ соответствует вашему фильтру', 'Добавлен новый ответ', 'В публикации, на которую вы отвечали, появился новый ответ'],
  uk: ['До вашої публікації додано інформацію', 'До вашої відповіді додано інформацію', 'Додано інформацію, що відповідає вашому фільтру', 'Опубліковано допис, що відповідає вашому фільтру', 'Відповідь відповідає вашому фільтру', 'Додано нову відповідь', 'У дописі, на який ви відповідали, з’явилася нова відповідь'],
  de: ['Zu deinem Beitrag wurden Informationen hinzugefügt', 'Zu deiner Antwort wurden Informationen hinzugefügt', 'Ein zu deinem Filter passender Zusatz wurde hinzugefügt', 'Ein zu deinem Filter passender Beitrag wurde veröffentlicht', 'Eine Antwort entspricht deinem Filter', 'Eine neue Antwort wurde hinzugefügt', 'Ein Beitrag, auf den du geantwortet hast, hat eine neue Antwort'],
  tr: ['Gönderinize ek bilgi eklendi', 'Yanıtınıza ek bilgi eklendi', 'Filtrenizle eşleşen ek bilgi eklendi', 'Filtrenizle eşleşen bir gönderi yayımlandı', 'Bir yanıt filtrenizle eşleşti', 'Yeni bir yanıt eklendi', 'Yanıtladığınız bir gönderiye yeni yanıt geldi'],
  he: ['נוסף מידע לפוסט שלך', 'נוסף מידע לתגובה שלך', 'נוסף מידע התואם למסנן שלך', 'פורסם פוסט התואם למסנן שלך', 'תגובה תואמת למסנן שלך', 'נוספה תגובה חדשה', 'נוספה תגובה חדשה לפוסט שהגבת עליו'],
};

const KEYS = [
  'SUPPLEMENT_POST_AUTHOR',
  'SUPPLEMENT_REPLY_AUTHOR',
  'SUPPLEMENT_PUSHFILTER',
  'POST_FILTER_MATCH',
  'REPLY_FILTER_MATCH',
  'REPLY_POST_AUTHOR',
  'REPLY_REPLIERS',
];

const toOneSignalLanguageCode = (language) => (language === 'zh' ? 'zh-Hans' : language);
const ONE_SIGNAL_LANGUAGES = Object.freeze(ALLOWED_LANGUAGES.map(toOneSignalLanguageCode));

const NOTIFICATION_MESSAGES = Object.fromEntries(
  KEYS.map((key, index) => [
    key,
    Object.fromEntries(
      ALLOWED_LANGUAGES.map((lang) => [toOneSignalLanguageCode(lang), LOCALIZED_HEADINGS[lang][index]])
    ),
  ])
);

const buildContent = ({ senderName, snippet }) =>
  Object.fromEntries(
    ALLOWED_LANGUAGES.map((lang) => [
      toOneSignalLanguageCode(lang),
      lang === 'ja' || lang === 'zh'
        ? `${senderName}: 「${snippet}」`
        : `${senderName}: “${snippet}”`,
    ])
  );

NOTIFICATION_MESSAGES.CONTENT_TEMPLATES = {
  DEFAULT: buildContent,
  COMPACT: buildContent,
};
Object.defineProperty(NOTIFICATION_MESSAGES, 'ONE_SIGNAL_LANGUAGES', {
  value: ONE_SIGNAL_LANGUAGES,
  enumerable: false,
});

module.exports = NOTIFICATION_MESSAGES;
