const { ALLOWED_LANGUAGES } = require('../../constants/languages');

const COPY = {
  ja: ['送信専用メール', '仮登録のご案内', '仮登録ありがとうございます。', '以下のURLから本登録を完了してください。', 'ルームはこちら', 'パスワード再設定', '以下のURLからパスワードの再設定を行ってください。', 'パスワード再設定通知', 'パスワードが再設定されました。', 'パスワード変更通知', 'パスワードが変更されました。'],
  en: ['No-reply email', 'Temporary user registration', 'Thank you for registering.', 'Complete your registration using the verification URL below.', 'Open this room', 'Password reset', 'Reset your password using the URL below.', 'Password reset notification', 'Your password has been reset.', 'Password change notification', 'Your password has been changed.'],
  zh: ['请勿回复', '用户预注册邮件', '感谢您注册。', '请通过以下验证网址完成用户注册。', '打开此房间', '重置密码', '请通过以下网址重置密码。', '密码重置通知', '您的密码已重置。', '密码更改通知', '您的密码已更改。'],
  pt: ['E-mail sem resposta', 'Pré-registo de utilizador', 'Obrigado pelo seu registo.', 'Conclua o registo através do URL de verificação abaixo.', 'Abrir esta sala', 'Redefinição da palavra-passe', 'Redefina a palavra-passe através do URL abaixo.', 'Notificação de redefinição da palavra-passe', 'A sua palavra-passe foi redefinida.', 'Notificação de alteração da palavra-passe', 'A sua palavra-passe foi alterada.'],
  ko: ['발신 전용 메일', '사용자 임시 등록', '등록해 주셔서 감사합니다.', '아래 인증 URL에서 사용자 등록을 완료해 주세요.', '이 룸 열기', '비밀번호 재설정', '아래 URL에서 비밀번호를 재설정해 주세요.', '비밀번호 재설정 알림', '비밀번호가 재설정되었습니다.', '비밀번호 변경 알림', '비밀번호가 변경되었습니다.'],
  vi: ['Email không nhận phản hồi', 'Đăng ký người dùng tạm thời', 'Cảm ơn bạn đã đăng ký.', 'Hãy hoàn tất đăng ký qua URL xác minh bên dưới.', 'Mở phòng này', 'Đặt lại mật khẩu', 'Hãy đặt lại mật khẩu qua URL bên dưới.', 'Thông báo đặt lại mật khẩu', 'Mật khẩu của bạn đã được đặt lại.', 'Thông báo đổi mật khẩu', 'Mật khẩu của bạn đã được thay đổi.'],
  fr: ['E-mail sans réponse', 'Préinscription utilisateur', 'Merci pour votre inscription.', 'Terminez votre inscription avec l’URL de vérification ci-dessous.', 'Ouvrir cette salle', 'Réinitialisation du mot de passe', 'Réinitialisez votre mot de passe avec l’URL ci-dessous.', 'Notification de réinitialisation du mot de passe', 'Votre mot de passe a été réinitialisé.', 'Notification de modification du mot de passe', 'Votre mot de passe a été modifié.'],
  es: ['Correo sin respuesta', 'Registro provisional de usuario', 'Gracias por registrarte.', 'Completa el registro mediante la URL de verificación siguiente.', 'Abrir esta sala', 'Restablecimiento de contraseña', 'Restablece tu contraseña mediante la URL siguiente.', 'Notificación de restablecimiento de contraseña', 'Tu contraseña se ha restablecido.', 'Notificación de cambio de contraseña', 'Tu contraseña se ha cambiado.'],
  sv: ['E-post utan svar', 'Tillfällig användarregistrering', 'Tack för din registrering.', 'Slutför registreringen via verifieringslänken nedan.', 'Öppna det här rummet', 'Återställ lösenord', 'Återställ lösenordet via länken nedan.', 'Meddelande om återställt lösenord', 'Ditt lösenord har återställts.', 'Meddelande om ändrat lösenord', 'Ditt lösenord har ändrats.'],
  hi: ['केवल प्रेषण ईमेल', 'अस्थायी उपयोगकर्ता पंजीकरण', 'पंजीकरण के लिए धन्यवाद।', 'नीचे दिए गए सत्यापन URL से पंजीकरण पूरा करें।', 'यह रूम खोलें', 'पासवर्ड रीसेट', 'नीचे दिए गए URL से पासवर्ड रीसेट करें।', 'पासवर्ड रीसेट सूचना', 'आपका पासवर्ड रीसेट कर दिया गया है।', 'पासवर्ड परिवर्तन सूचना', 'आपका पासवर्ड बदल दिया गया है।'],
  it: ['E-mail senza risposta', 'Registrazione provvisoria utente', 'Grazie per la registrazione.', 'Completa la registrazione tramite l’URL di verifica seguente.', 'Apri questa stanza', 'Reimpostazione della password', 'Reimposta la password tramite l’URL seguente.', 'Notifica di reimpostazione della password', 'La password è stata reimpostata.', 'Notifica di modifica della password', 'La password è stata modificata.'],
  ru: ['Письмо без возможности ответа', 'Предварительная регистрация пользователя', 'Спасибо за регистрацию.', 'Завершите регистрацию по ссылке подтверждения ниже.', 'Открыть эту комнату', 'Сброс пароля', 'Сбросьте пароль по ссылке ниже.', 'Уведомление о сбросе пароля', 'Ваш пароль был сброшен.', 'Уведомление об изменении пароля', 'Ваш пароль был изменён.'],
  uk: ['Лист без можливості відповіді', 'Попередня реєстрація користувача', 'Дякуємо за реєстрацію.', 'Завершіть реєстрацію за посиланням підтвердження нижче.', 'Відкрити цю кімнату', 'Скидання пароля', 'Скиньте пароль за посиланням нижче.', 'Сповіщення про скидання пароля', 'Ваш пароль скинуто.', 'Сповіщення про зміну пароля', 'Ваш пароль змінено.'],
  de: ['Keine Antwort möglich', 'Vorläufige Benutzerregistrierung', 'Vielen Dank für deine Registrierung.', 'Schließe die Registrierung über den Bestätigungslink unten ab.', 'Diesen Raum öffnen', 'Passwort zurücksetzen', 'Setze dein Passwort über den Link unten zurück.', 'Benachrichtigung zur Passwortzurücksetzung', 'Dein Passwort wurde zurückgesetzt.', 'Benachrichtigung zur Passwortänderung', 'Dein Passwort wurde geändert.'],
  tr: ['Yanıtlanmayan e-posta', 'Geçici kullanıcı kaydı', 'Kaydolduğunuz için teşekkür ederiz.', 'Aşağıdaki doğrulama URL’siyle kaydınızı tamamlayın.', 'Bu odayı aç', 'Parola sıfırlama', 'Aşağıdaki URL’den parolanızı sıfırlayın.', 'Parola sıfırlama bildirimi', 'Parolanız sıfırlandı.', 'Parola değişikliği bildirimi', 'Parolanız değiştirildi.'],
  he: ['דוא״ל ללא מענה', 'רישום משתמש זמני', 'תודה שנרשמת.', 'יש להשלים את הרישום באמצעות כתובת האימות שלהלן.', 'פתיחת החדר', 'איפוס סיסמה', 'יש לאפס את הסיסמה באמצעות הכתובת שלהלן.', 'הודעה על איפוס סיסמה', 'הסיסמה שלך אופסה.', 'הודעה על שינוי סיסמה', 'הסיסמה שלך שונתה.'],
};

const normalizeMailLocale = (locale) => {
  if (typeof locale !== 'string') return 'ja';
  const normalized = locale.trim().toLowerCase().split(/[-_]/u)[0];
  return ALLOWED_LANGUAGES.includes(normalized) ? normalized : 'ja';
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const getCopy = (locale) => COPY[normalizeMailLocale(locale)];
const getDirection = (locale) => (normalizeMailLocale(locale) === 'he' ? 'rtl' : 'ltr');

const buildMailBase = ({ locale, appName, noReplyMail, subjectIndex, body }) => {
  const lang = normalizeMailLocale(locale);
  const copy = getCopy(lang);
  const safeAppName = escapeHtml(appName);
  return {
    from: { name: `${appName} ${copy[0]}`, address: noReplyMail },
    subject: `${appName} ${copy[subjectIndex]}`,
    html: `<div lang="${lang}" dir="${getDirection(lang)}"><p>${body(copy, safeAppName)}</p></div>`,
  };
};

const safeLink = (url, label = url) =>
  `<a href="${escapeHtml(url)}"><bdi dir="ltr">${escapeHtml(label)}</bdi></a>`;

const buildRegistrationMail = ({ locale, appName, noReplyMail, activateUrl, room = null }) =>
  buildMailBase({
    locale,
    appName,
    noReplyMail,
    subjectIndex: 1,
    body: (copy, safeAppName) => {
      let html = `${safeAppName}: ${escapeHtml(copy[2])}<br>${escapeHtml(copy[3])}<br>${safeLink(activateUrl)}`;
      if (room?.url) {
        const roomLabel = `${room.floorTitle || ''} / ${room.roomTitle || ''}`;
        html += `<br><br>${safeLink(room.url, roomLabel)} — ${escapeHtml(copy[4])}`;
      }
      return html;
    },
  });

const buildPasswordResetMail = ({ locale, appName, noReplyMail, resetUrl }) =>
  buildMailBase({
    locale,
    appName,
    noReplyMail,
    subjectIndex: 5,
    body: (copy, safeAppName) => `${safeAppName}<br>${escapeHtml(copy[6])}<br>${safeLink(resetUrl)}`,
  });

const buildPasswordResetCompletedMail = ({ locale, appName, noReplyMail }) =>
  buildMailBase({
    locale,
    appName,
    noReplyMail,
    subjectIndex: 7,
    body: (copy, safeAppName) => `${safeAppName}<br>${escapeHtml(copy[8])}`,
  });

const buildPasswordChangedMail = ({ locale, appName, noReplyMail }) =>
  buildMailBase({
    locale,
    appName,
    noReplyMail,
    subjectIndex: 9,
    body: (copy, safeAppName) => `${safeAppName}<br>${escapeHtml(copy[10])}`,
  });

module.exports = {
  buildPasswordChangedMail,
  buildPasswordResetCompletedMail,
  buildPasswordResetMail,
  buildRegistrationMail,
  normalizeMailLocale,
};
