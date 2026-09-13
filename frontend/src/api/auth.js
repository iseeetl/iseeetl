import apiClient from '@/api/apiClient';

const withCredentials = { withCredentials: true };

const login = ({ mail, password }) => apiClient.post('/api/auth/login', { mail, password }, withCredentials);

const loginWithGoogle = ({ idToken, lang }) =>
  apiClient.post('/api/auth/google/login', { id_token: idToken, lang }, withCredentials);

const fetchPushIdentity = () => apiClient.get('/api/auth/push-identity', withCredentials);

const register = (payload) => apiClient.post('/api/auth/register/', payload, withCredentials);

const activate = (payload) => apiClient.post('/api/auth/activate', payload, withCredentials);

const sendResetPasswordLink = ({ mail }) =>
  apiClient.post('/api/auth/resetpassword/sendmail', { mail }, withCredentials);

const verifyResetPasswordToken = ({ token }) =>
  apiClient.post('/api/auth/resetpassword/verify', { token }, withCredentials);

const resetPassword = ({ password, token }) =>
  apiClient.post('/api/auth/resetpassword', { password, token }, withCredentials);

export default {
  logout: () => apiClient.post('/api/auth/logout', {}, { withCredentials: true, skipAuthRecovery: true }),
  login,
  loginWithGoogle,
  fetchPushIdentity,
  register,
  activate,
  sendResetPasswordLink,
  verifyResetPasswordToken,
  resetPassword,
};
