const AppError = require('../../utils/appError');
const User = require('../../models/User');
const { findActiveUser } = require('../_shared/activeResource');
const { revokeUserSessions } = require('../../socket/configurationRevocation');
const { deliverPasswordChangeNotice } = require('../mail/passwordChangeNotice');

const changePassword = async (body, jwtPayload, io) => {
  const oldPassword = body.old_password;
  const newPassword = body.new_password;
  const userId = jwtPayload.user_id;

  const foundUser = await findActiveUser(userId, {
    select: '+password',
    error: { code: 'INVALID_PARAMS' },
  });
  if (!(await foundUser.comparePassword(oldPassword))) {
    throw new AppError({ code: 'INVALID_PARAMS' });
  }

  const updatedUser = await User.findOneAndUpdate(
    { _id: foundUser._id, delete_flg: false },
    {
      $set: {
        password: newPassword, updated_at: Date.now(),
      },
      $inc: { session_version: 1 },
    },
    { new: true, runValidators: true }
  );
  if (!updatedUser) throw new AppError({ code: 'INVALID_PERMISSION' });

  await revokeUserSessions(io, foundUser._id);
  await deliverPasswordChangeNotice({ mail: updatedUser.mail, lang: updatedUser.lang });

  return {};
};

module.exports = {
  changePassword,
};
