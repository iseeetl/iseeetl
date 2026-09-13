const mongoose = require('mongoose');
const { buildReq, runValidators } = require('./_helpers');
const { validateConditions } = require('../../../validates/pushFilter.validate');

describe('通知条件の入力検証', () => {
  test('有効な通知条件のオブジェクトを受け付ける', async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const req = buildReq({
      body: {
        conditions: {
          filterMode: 'include',
          showRange: 'all',
          keyword: null,
          keywordArray: [],
          logicalOperator: 'or',
          tags: [id],
          tagSearchOperator: 'and',
          noTags: false,
          animation: true,
          displayOrder: [{ key: 'content', display: '1' }],
          userName: null,
        },
      },
    });
    const result = await runValidators(validateConditions('conditions'), req);
    expect(result.isEmpty()).toBe(true);
  });

  test('通知条件の不正なタグIDを拒否する', async () => {
    const req = buildReq({
      body: {
        conditions: {
          filterMode: 'include',
          showRange: 'all',
          keyword: null,
          keywordArray: [],
          logicalOperator: 'or',
          tags: ['bad'],
          tagSearchOperator: 'and',
          noTags: false,
          animation: true,
          displayOrder: [{ key: 'content', display: '1' }],
          userName: null,
        },
      },
    });
    const result = await runValidators(validateConditions('conditions'), req);
    expect(result.isEmpty()).toBe(false);
  });
});
