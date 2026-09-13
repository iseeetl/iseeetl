const AppError = require('../../utils/appError');
const { isOneSignalEnabled } = require('../../config/featureFlags');
const User = require('../../models/User');
const { findActiveUser } = require('../_shared/activeResource');
const { removeFileBestEffort } = require('../upload/fileCleanup');

const getUserDetail = (userId) =>
  findActiveUser(userId, {
    select: [
      'username',
      'image_name',
      'lang',
      'eye_friendly_mode',
      'push_enabled',
      'reply_push_enabled',
      'replied_post_push_enabled',
    ].join(' '),
  });

const removePreviousProfileImage = async ({ userId, fileName }) => {
  await removeFileBestEffort({
    baseDir: process.env.PROFILE_PATH,
    segments: [userId],
    fileName,
    context: { userId: String(userId), kind: 'profile-image' },
  });
};

const PUSH_SETTING_FIELDS = [
  'push_enabled',
  'reply_push_enabled',
  'replied_post_push_enabled',
];

const resolvePushSettings = (body, foundUser) => {
  if (isOneSignalEnabled()) {
    return Object.fromEntries(PUSH_SETTING_FIELDS.map((field) => [field, body[field]]));
  }

  const enablesNewSetting = PUSH_SETTING_FIELDS.some(
    (field) => body[field] === true && foundUser[field] !== true
  );
  if (enablesNewSetting) {
    throw new AppError({
      code: 'EXTERNAL_FEATURE_DISABLED',
      details: { feature: 'oneSignalPush' },
    });
  }

  return Object.fromEntries(PUSH_SETTING_FIELDS.map((field) => [field, foundUser[field]]));
};

const updateUser = async (body, userId) => {
  const username = body.username;
  const imageName = body.image_name;
  const lang = body.lang;
  const eyeFriendlyMode = body.eye_friendly_mode;
  const foundUser = await findActiveUser(userId, { error: { code: 'INVALID_PERMISSION' } });
  const pushSettings = resolvePushSettings(body, foundUser);
  const updateData = {
    username,
    image_name: imageName,
    lang,
    eye_friendly_mode: eyeFriendlyMode,
    ...pushSettings,
    updated_at: Date.now(),
  };

  const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true, runValidators: true }).select({
    username: 1,
    image_name: 1,
    lang: 1,
    eye_friendly_mode: 1,
    push_enabled: 1,
    reply_push_enabled: 1,
    replied_post_push_enabled: 1,
  });

  if (foundUser.image_name && foundUser.image_name !== imageName) {
    await removePreviousProfileImage({ userId, fileName: foundUser.image_name });
  }

  return updatedUser;
};

module.exports = {
  getUserDetail,
  updateUser,
};
