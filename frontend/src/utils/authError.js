import { isAuthenticationUnauthorized } from '@/api/apiClient';

const isNavigationDuplicated = (err) => {
  if (!err) return false;
  if (err.name === 'NavigationDuplicated') return true;
  const msg = err.message || '';
  return typeof msg === 'string' && msg.includes('Avoided redundant navigation');
};

export const handleAuthError = (err, { store, router } = {}) => {
  if (isAuthenticationUnauthorized(err)) {
    const logoutHandled = err?.config?._userLogoutHandled;
    if (!logoutHandled && store && typeof store.dispatch === 'function') {
      try {
        const dispatched = store.dispatch('doLogout');
        if (dispatched && typeof dispatched.catch === 'function') {
          dispatched.catch(() => undefined);
        }
      } catch (_) {
        // 認証エラー時のログアウトに失敗しても、ログイン画面への遷移を試みる。
        void _;
      }
    }
    if (router && typeof router.push === 'function') {
      try {
        const pushed = router.push({ name: 'Login' });
        if (pushed && typeof pushed.catch === 'function') {
          pushed.catch((pushErr) => {
            if (!isNavigationDuplicated(pushErr)) {
              // 認証エラー時の画面遷移エラーは再送出しない。
            }
          });
        }
      } catch (pushErr) {
        if (!isNavigationDuplicated(pushErr)) {
          // 認証エラー時の画面遷移エラーは再送出しない。
        }
      }
    }
    return true;
  }
  return false;
};
