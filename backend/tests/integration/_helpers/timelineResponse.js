function stringifyBody(body) {
  try {
    return JSON.stringify(body);
  } catch (_) {
    return '[unserializable-body]';
  }
}

function assertTimelineOk(response, label = 'タイムライン取得') {
  if (response?.status !== 200) {
    throw new Error(`${label}: ステータスの期待値は200ですが、実際は${response?.status}でした。body=${stringifyBody(response?.body)}`);
  }
  expect(response.status).toBe(200);
  expect(response.body?.error).toBeUndefined();
  return response;
}

function extractFirstReplyId(response, label = '返信作成') {
  const ok = assertTimelineOk(response, label);
  expect(Array.isArray(ok.body?.replies)).toBe(true);
  expect(ok.body.replies.length).toBeGreaterThan(0);
  const replyId = ok.body.replies[0]?._id;
  expect(replyId).toBeTruthy();
  return replyId;
}

function extractFirstSupplementId(response, label = '付加情報作成') {
  const ok = assertTimelineOk(response, label);
  expect(Array.isArray(ok.body?.supplementaries)).toBe(true);
  expect(ok.body.supplementaries.length).toBeGreaterThan(0);
  const supplementId = ok.body.supplementaries[0]?._id;
  expect(supplementId).toBeTruthy();
  return supplementId;
}

function extractFirstReplySupplementId(response, label = '返信の付加情報作成') {
  const ok = assertTimelineOk(response, label);
  expect(Array.isArray(ok.body?.replies)).toBe(true);
  expect(ok.body.replies.length).toBeGreaterThan(0);
  const reply = ok.body.replies[0];
  expect(Array.isArray(reply?.supplementaries)).toBe(true);
  expect(reply.supplementaries.length).toBeGreaterThan(0);
  const supplementId = reply.supplementaries[0]?._id;
  expect(supplementId).toBeTruthy();
  return supplementId;
}

module.exports = {
  assertTimelineOk,
  extractFirstReplyId,
  extractFirstSupplementId,
  extractFirstReplySupplementId,
};
