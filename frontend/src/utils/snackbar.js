// 通知の表示とスクリーンリーダーへの読み上げを、同じメッセージで更新する。
export const showSnackbar = (store, message, role = 'status') => {
  if (!store || typeof store.dispatch !== 'function') return;
  store.dispatch('doShowSnackbar', { message, role });
};
