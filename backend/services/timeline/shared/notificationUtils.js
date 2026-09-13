const normalizeId = (value) => (value == null ? '' : value.toString());

const buildUrl = (appUrl, floorId, roomId) =>
  `${appUrl}/floor/${normalizeId(floorId)}/room/${normalizeId(roomId)}`;

module.exports = {
  buildUrl,
  normalizeId,
};
