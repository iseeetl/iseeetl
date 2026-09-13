const crypto = require('crypto');
const moment = require('moment');

const AppError = require('../../utils/appError');
const { getMailDeliveryConfig, isMailDeliveryEnabled } = require('../../config/featureFlags');
const { readIntEnv } = require('../../config/env');
const User = require('../../models/User');
const UserTemp = require('../../models/UserTemp');
const Room = require('../../models/Room');
const Floor = require('../../models/Floor');
const { createMailTransport } = require('../../integrations/mail/mailer');
const { buildRegistrationMail, normalizeMailLocale } = require('../mail/localizedMail');

const DEFAULT_SIGNUP_TOKEN_TTL_MINUTES = 60;
const resolveSignupTokenTtlMinutes = () =>
  readIntEnv('SIGNUP_TOKEN_TTL_MINUTES', { defaultValue: DEFAULT_SIGNUP_TOKEN_TTL_MINUTES, min: 1 });

async function fetchRoomAndFloor(roomId) {
  if (!roomId) return { room: null, floor: null };
  const room = await Room.findOne({ _id: roomId, delete_flg: false });
  if (!room) return { room: null, floor: null };
  const floor = await Floor.findOne({ _id: room.floor.toString(), delete_flg: false });
  return { room, floor };
}

exports.register = async (body) => {
  if (!isMailDeliveryEnabled()) {
    throw new AppError({
      code: 'EXTERNAL_FEATURE_DISABLED',
      details: { feature: 'mailDelivery' },
    });
  }
  const mailConfig = getMailDeliveryConfig();

  const username = body.username;
  const mail = body.mail;
  const password = body.password;
  const lang = normalizeMailLocale(body.lang);
  const roomId = body.room_id || null; // 登録元のルームへ戻るための情報として使う。

  // 論理削除済みの利用者を含め、同じメールアドレスでの重複登録を許可しない。
  const user = await User.findOne({ mail });
  if (user !== null) throw new AppError({ code: 'USER_EMAIL_ALREADY_USED' });

  const token = crypto.randomBytes(24).toString('hex');
  const newUserTemp = { username, password, mail, token, lang };
  await UserTemp.create(newUserTemp);

  const { room: foundRoom, floor: foundFloor } = await fetchRoomAndFloor(roomId);

  const activateUrl = roomId
    ? `${mailConfig.appUrl}/user/activate/${token}?room_id=${roomId}`
    : `${mailConfig.appUrl}/user/activate/${token}`;

  let room = null;
  if (foundRoom && foundFloor) {
    const url = `${mailConfig.appUrl}/floor/${foundRoom.floor.toString()}/room/${foundRoom._id.toString()}`;
    room = { url, floorTitle: foundFloor.title, roomTitle: foundRoom.title };
  }

  const transporter = createMailTransport();
  const mailOptions = {
    ...buildRegistrationMail({
      locale: lang,
      appName: mailConfig.appName,
      noReplyMail: mailConfig.noReplyMail,
      activateUrl,
      room,
    }),
    to: mail,
  };
  await transporter.sendMail(mailOptions);
};

exports.activate = async (body) => {
  const inviteToken = body.invite_token;
  const tokenHash = crypto.createHash('sha256').update(inviteToken).digest('hex');
  const roomId = body.room_id || null; // 登録元のルームへ戻るための情報として使う。

  const foundUserTemp = await UserTemp.findOne({ token: inviteToken });
  // 同じ有効化に由来する本登録だけを復旧対象にする。メール一致だけでは判定しない。
  let completedUser = await User.findOne({
    ...(foundUserTemp ? { mail: foundUserTemp.mail } : {}),
    activation_token_hash: tokenHash, activation_expires_at: { $gte: new Date() }, delete_flg: false,
  });
  if (!completedUser) {
    if (!foundUserTemp) throw new AppError({ code: 'TOKEN_NOT_FOUND' });
    const expiresAt = moment(foundUserTemp.created_at).add(resolveSignupTokenTtlMinutes(), 'minutes').toDate();
    if (Date.now() > expiresAt.getTime()) throw new AppError({ code: 'SIGNUP_TOKEN_EXPIRED' });
    const foundUser = await User.findOne({ mail: foundUserTemp.mail });
    if (foundUser) {
      completedUser = await User.findOne({ activation_token_hash: tokenHash, mail: foundUserTemp.mail, activation_expires_at: { $gte: new Date() }, delete_flg: false });
      if (!completedUser) throw new AppError({ code: 'USER_ALREADY_EXISTS' });
    }
    try {
      if (!completedUser) completedUser = await User.create({
        username: foundUserTemp.username, mail: foundUserTemp.mail, password: foundUserTemp.password,
        lang: normalizeMailLocale(foundUserTemp.lang),
        activation_token_hash: tokenHash, activation_expires_at: expiresAt,
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      completedUser = await User.findOne({ activation_token_hash: tokenHash, mail: foundUserTemp.mail, activation_expires_at: { $gte: new Date() }, delete_flg: false });
      if (!completedUser) throw new AppError({ code: 'USER_ALREADY_EXISTS' });
    }
  }
  if (foundUserTemp) await UserTemp.findByIdAndDelete(foundUserTemp._id);

  let roomTitle = null;
  let floorId = null;
  let floorTitle = null;
  if (roomId) {
    const { room: foundRoom, floor: foundFloor } = await fetchRoomAndFloor(roomId);
    if (foundRoom) {
      roomTitle = foundRoom.title;
      floorId = foundRoom.floor.toString();
    }
    if (foundFloor) {
      floorTitle = foundFloor.title;
    }
  }

  return { roomId, roomTitle, floorId, floorTitle };
};
