import apiClient, { withAuth } from '@/api/apiClient';
import { getApiApplicationStore } from '@/api/apiStoreAdapter';
export const changeScopedReaction = ({postId,replyId,supplementId,mediaKind,reactionType,reactionId,isDelete,guestName}) => {
 const store=getApiApplicationStore();
 const roomId=store.getters.roomId;
 let path=`/api/rooms/${roomId}/timeline/posts/${postId}`;
 if(replyId)path+=`/replies/${replyId}`;
 if(supplementId)path+=`/supplements/${supplementId}`;
 path+='/reactions';
 const body={...(isDelete?{}:{type:reactionType}),...(mediaKind?{media_kind:mediaKind}:{}),...(guestName?{guest_name:guestName}:{})};
 const config=store.getters.userIsLogin?withAuth(store.getters.userToken):{headers:{'x-guest-token':store.getters.guestToken}};
 return isDelete?apiClient.delete(`${path}/${reactionId}`,{...config,data:body}):apiClient.post(path,body,config);
};
