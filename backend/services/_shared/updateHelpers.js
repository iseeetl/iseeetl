function buildDeleteFlagUpdate({ deleteFlg, alwaysSetDeletedAt = false }) {
  const updateData = { delete_flg: deleteFlg };
  if (alwaysSetDeletedAt || typeof deleteFlg === 'boolean') {
    updateData.deleted_at = deleteFlg ? Date.now() : null;
  }
  return updateData;
}

module.exports = {
  buildDeleteFlagUpdate,
};
