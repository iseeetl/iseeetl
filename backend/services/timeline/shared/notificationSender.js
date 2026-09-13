const { dispatchNotification } = require('../../../integrations/onesignal/notification.client');
const { getOneSignalConfig, isOneSignalEnabled } = require('../../../config/featureFlags');
const logger = require('../../../utils/logger');
const { buildOneSignalExternalId } = require('../../../integrations/onesignal/identity');
const { filterAuthorizedRoomUserIds } = require('../../room/roomAccess.service');

const dispatchPushNotification = async ({ userIds, roomId, headings, contents, url, appId }) => {
  if (!userIds || !userIds.length || !roomId) return [];
  if (!isOneSignalEnabled()) return [];

  const resolvedAppId = appId || getOneSignalConfig().appId;
  if (!resolvedAppId) return [];

  let authorizedRecipientUserIds;
  try {
    authorizedRecipientUserIds = await filterAuthorizedRoomUserIds(userIds, roomId);
  } catch (error) {
    logger.warn(
      `[OneSignal] recipient authorization failed for room ${String(roomId)}:`,
      (error && error.message) || error
    );
    return [];
  }

  const externalUserIds = Array.from(
    new Set(authorizedRecipientUserIds.map((userId) => buildOneSignalExternalId(userId)).filter(Boolean))
  );
  if (!externalUserIds.length) return [];

  dispatchNotification({
    app_id: resolvedAppId,
    include_external_user_ids: externalUserIds,
    channel_for_external_user_ids: 'push',
    headings,
    contents,
    url,
  });

  return authorizedRecipientUserIds;
};

module.exports = {
  dispatchPushNotification,
};
