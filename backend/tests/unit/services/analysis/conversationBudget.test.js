const { analysisBodyLimit } = require('../../../../services/analysis/conversationBudget');
const { assertSupplementContentLimit } = require('../../../../services/timeline/shared/supplementContentLimit');
const { mapTimelineRequest } = require('../../../../validates/timelineResource');
const adapter = require('../../../../services/v1/timelineMutation.adapter');
const params = Object.fromEntries(['floor_id','room_id','post_id','reply_id','supplement_id'].map(k=>[k,'012345678901234567890123']));
test.each(['conversation','speech','vision','video','audioScene'])('%sは保存言語のタグ接頭辞を2000から差し引く', (kind) => {
  expect(analysisBodyLimit({kind,source:{lang:'en'},triggerTag:{name:'相談',translations:[{lang:'en',name:'Help'}]}}))
    .toBe(['conversation','speech'].includes(kind)?1994:1996);
});
test('人・AI・新規とも2000 UTF-16単位まで許可',()=>{
  expect(()=>assertSupplementContentLimit({content:'x'.repeat(2000)})).not.toThrow();
  expect(()=>assertSupplementContentLimit({content:'😀'.repeat(1001)})).toThrow();
  expect(()=>assertSupplementContentLimit({title:'new'})).not.toThrow();
});
test.each(['post','reply','postSupplement','replySupplement'].flatMap(kind=>['create','update'].map(op=>[kind,op])))('%s/%sの通常API境界', (kind,op)=>{
  const limit=kind.endsWith('Supplement')?2000:400;
  expect(mapTimelineRequest(params,{content:'a'.repeat(limit),lang:'ja'},op,kind).content).toHaveLength(limit);
  expect(()=>mapTimelineRequest(params,{content:'a'.repeat(limit+1),lang:'ja'},op,kind)).toThrow();
});
test.each(['Post','Reply','PostSupplement','ReplySupplement'].flatMap(kind=>['Create','Update'].map(op=>[kind,op])))('%s/%sのv1 API境界', (kind,op)=>{
  const limit=kind.endsWith('Supplement')?2000:400;
  const fn=adapter['adapt'+kind+op];
  expect(fn({...params,content:'a'.repeat(limit)}).content).toHaveLength(limit);
  expect(()=>fn({...params,content:'a'.repeat(limit+1)})).toThrow();
});
