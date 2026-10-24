const { conversationBodyLimit } = require('../../../../services/analysis/conversationBudget');
const { assertSupplementContentLimit } = require('../../../../services/timeline/shared/supplementContentLimit');
test('会話予算は2000から翻訳済みタグ接頭辞を差し引く', () => {
  expect(conversationBodyLimit({source:{lang:'en'},triggerTag:{name:'相談',translations:[{lang:'en',name:'Help'}]}})).toBe(1994);
});
test('編集時の上限はDBの会話由来だけで決まり、人や他解析の上限を広げない', () => {
  const ai={meta:{analysis_kind:'conversation'}};
  expect(()=>assertSupplementContentLimit({content:'x'.repeat(2000)},ai)).not.toThrow();
  expect(()=>assertSupplementContentLimit({content:'😀'.repeat(1001)},ai)).toThrow();
  for(const current of [{},{meta:{analysis_kind:'vision'}},{title:'AI'},{ai_origin:{kind:'conversation'}}]) {
    expect(()=>assertSupplementContentLimit({content:'x'.repeat(401),meta:ai.meta},current)).toThrow();
    expect(()=>assertSupplementContentLimit({content:'x'.repeat(400)},current)).not.toThrow();
  }
  expect(()=>assertSupplementContentLimit({title:'new'},{})).not.toThrow();
});
