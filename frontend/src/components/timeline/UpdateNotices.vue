<template>
 <section v-if="notices.length && !activityController?.center()?.enabled" class="update-notices" :aria-label="$t('updateNotice.title')">
  <div v-if="pendingCount" class="pending" role="status"><span>{{ $t('updateNotice.pending',{count:pendingCount}) }}</span><button @click="show">{{ $t('updateNotice.show') }}</button></div>
  <article v-for="group in groups" :key="group.postId" class="update-card">
   <strong>{{ $t('updateNotice.updated') }}</strong><time>{{ new Date(group.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) }}</time>
   <p class="post-preview">{{ preview(group.postId) }}</p>
   <div v-for="notice in group.items" :key="notice.key" class="notice-row"><span>{{ noticeLabel(notice) }}</span><button :aria-label="`${noticeLabel(notice)}: ${$t('updateNotice.viewTarget')}`" @click="go(notice)">{{ $t('updateNotice.viewTarget') }}</button></div>
   <button class="dismiss" @click="dismiss(group)">{{ $t('updateNotice.dismiss') }}</button>
  </article>
 </section>
</template>
<script>
import { noticeVisible } from '@/features/timeline/updateNotices';
export default {
 inject: { activityController: { default: null } },
 props:{filter:{type:Object,required:true},roomId:String,matches:Function},
 data(){return{shown:[]};},
 computed:{
  notices(){return (this.$store.state.updateNotices||[]).filter(n=>n.roomId===this.roomId).filter(n=>{
    const post=(this.filter.posts||[]).find(p=>p._id===n.postId&&!p.origin_id);
    if(!noticeVisible(n,post,this.$store.getters))return false;
    return !this.matches || this.matches(post);
  });},
  pendingCount(){return new Set(this.notices.filter(n=>!this.shown.includes(`${n.key}:${n.at}`)).map(n=>n.postId)).size;},
  groups(){const map=new Map();for(const n of this.notices.filter(x=>this.shown.includes(`${x.key}:${x.at}`))){if(!map.has(n.postId))map.set(n.postId,{postId:n.postId,at:n.at,items:[]});map.get(n.postId).items.push(n);map.get(n.postId).at=Math.max(map.get(n.postId).at,n.at);}return [...map.values()].sort((a,b)=>b.at-a.at);},
 },
 methods:{preview(id){const post=(this.filter.posts||[]).find(p=>p._id===id&&!p.origin_id);return (post?.content || '').slice(0,80);}, noticeLabel(n){return this.$t(`updateNotice.${n.kind==='reaction'&&n.media?'alternativeReaction':n.kind}`);},show(){this.shown=this.notices.map(n=>`${n.key}:${n.at}`);},dismiss(group){this.$store.commit('dismissUpdateNotices',group.items.map(n=>n.key));},
 go(n){const root=this.$el.closest('.timeline-content');const id=n.supplementId||n.replyId||n.postId;
   const item=root?.querySelector(`[data-timeline-item-id="${id}"]`)||root?.querySelector(`[data-timeline-item-id="${n.replyId||n.postId}"]`);
   const target=n.media?item?.querySelector(`[data-alt-kind="${n.media}"]`):item;
   if(target){target.setAttribute('tabindex','-1');target.scrollIntoView({block:'center'});target.focus({preventScroll:true});}
 }},
};
</script>
<style scoped>
.update-notices{margin:8px}.pending{padding:8px;display:flex;align-items:center;justify-content:space-between;gap:8px;background:#303c5d;color:#fff;border-radius:5px}.update-notices button{font:inherit;cursor:pointer;border:1px solid #8b9ac1;border-radius:4px;padding:6px 9px;background:transparent;color:inherit;min-height:36px}.update-notices button:focus-visible{outline:3px solid #ffdb67;outline-offset:2px}.update-card{margin:8px 0;border:1px solid #7789b1;border-radius:5px;padding:10px;background:#253148;color:#fff}.post-preview{font-size:.85rem;margin:8px 0;overflow-wrap:anywhere}.update-card time{float:right;font-size:.8rem}.notice-row{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:7px 0;font-size:.9rem}.dismiss{font-size:.85rem!important}
</style>