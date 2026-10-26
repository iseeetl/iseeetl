import { REACTION_TYPES } from '@/constants/reactionTypes';
export const roomEmojiChoices = (catalog, lang) => {
 if (!catalog?.configured) return REACTION_TYPES;
 return (catalog.items || []).filter(x=>x.emoji).map(x=>({type:`room:${x._id}`,emoji:x.emoji,
  label:x.lang===lang?x.label:(x.translations||[]).find(t=>t.lang===lang)?.content||x.label}));
};
export const reactionChoicesWithHistory = (choices, reactions = []) => {
 const map=new Map(choices.map(x=>[x.type,x]));
 for(const r of reactions)if(!map.has(r.type)){
  const old=REACTION_TYPES.find(x=>x.type===r.type);
  if(old)map.set(r.type,old);else if(r.emoji)map.set(r.type,{type:r.type,emoji:r.emoji,label:r.label||r.emoji,retired:true});
 }
 return [...map.values()];
};
