const buildPaginateParams = (payload = {}) => {
  const params = { page: payload.page };
  if (Object.prototype.hasOwnProperty.call(payload, 'search')) {
    params.search = payload.search ?? '';
  }
  if (typeof payload.delete_flg === 'boolean') {
    params.delete_flg = payload.delete_flg;
  }
  return params;
};

export { buildPaginateParams };
