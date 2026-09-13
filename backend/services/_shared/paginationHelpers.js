function buildPaginationLabels() {
  return {
    totalDocs: 'total',
    totalPages: 'pages',
    docs: 'docs',
    page: 'page',
    nextPage: 'nextPage',
    prevPage: 'prevPage',
    pagingCounter: 'pagingCounter',
    hasPrevPage: 'hasPrevPage',
    hasNextPage: 'hasNextPage',
    meta: null,
  };
}

function buildPaginationOptions({ page, sort, limit = 10, populate, lean = false }) {
  const options = {
    page,
    limit,
    sort,
    customLabels: buildPaginationLabels(),
  };
  if (populate) options.populate = populate;
  if (lean) options.lean = true;
  return options;
}

function withOptionalDeleteFlag(query, deleteFlg) {
  if (typeof deleteFlg !== 'boolean') return query;
  return { ...query, delete_flg: deleteFlg };
}

module.exports = {
  buildPaginationLabels,
  buildPaginationOptions,
  withOptionalDeleteFlag,
};
