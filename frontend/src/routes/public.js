const floorView = () => import('@/views/Floor.vue');
const timelineView = () => import('@/views/Timeline.vue');
const staticDocumentView = () => import('@/views/StaticDocumentView.vue');

export default [
  {
    path: '/register',
    name: 'Register',
    component: () => import('@/views/Register.vue'),
    meta: { isPublic: true, title: 'ユーザ登録' },
  },
  {
    path: '/user/activate/:invite_token',
    name: 'CompleteUserActivate',
    component: () => import('@/views/CompleteUserActivate.vue'),
    meta: { isPublic: true, title: 'ユーザアクティベーション結果' },
  },
  {
    path: '/user/sendresetpasswordlink',
    name: 'SendResetPasswordLink',
    component: () => import('@/views/SendResetPasswordLink.vue'),
    meta: { isPublic: true, title: 'パスワード再設定リンク送信' },
  },
  {
    path: '/user/resetpassword/:reset_token',
    name: 'ResetPassword',
    component: () => import('@/views/ResetPassword.vue'),
    meta: { isPublic: true, title: 'パスワード再設定' },
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { isPublic: true, title: 'ログイン' },
  },
  {
    path: '/',
    name: 'Floor',
    component: floorView,
    meta: { isPublic: true, title: 'フロア一覧' },
  },
  {
    path: '/page/:page',
    name: 'FloorPage',
    component: floorView,
    meta: { isPublic: true, title: 'フロア一覧' },
  },
  {
    path: '/floor/:floor_id/invite/:invite_token',
    name: 'CompleteFloorInvite',
    component: () => import('@/views/CompleteFloorInvite.vue'),
    meta: { isPublic: true, title: 'フロアメンバー参加完了' },
  },
  {
    path: '/floor/:floor_id',
    name: 'Room',
    component: () => import('@/views/Room.vue'),
    meta: { isPublic: true, title: 'ルーム一覧' },
  },
  {
    path: '/floor/:floor_id/room/:room_id/invite/:invite_token',
    name: 'CompleteRoomInvite',
    component: () => import('@/views/CompleteRoomInvite.vue'),
    meta: { isPublic: true, title: 'ルームメンバー参加完了' },
  },
  {
    path: '/floor/:floor_id/room/:room_id',
    name: 'TimeLine',
    component: timelineView,
    meta: { isPublic: true, title: 'タイムライン' },
  },
  {
    path: '/floor/:floor_id/room/:room_id/post/:post_id',
    name: 'TimeLinePostDetail',
    component: timelineView,
    meta: { isPublic: true, title: 'タイムライン' },
  },
  {
    path: '/setting',
    name: 'Setting',
    component: () => import('@/views/Setting.vue'),
    meta: { isPublic: true, title: '設定' },
  },
  {
    path: '/changepassword',
    name: 'ChangePassword',
    component: () => import('@/views/ChangePassword.vue'),
    meta: { requiresAuth: true, title: 'パスワード変更' },
  },
  {
    path: '/terms',
    name: 'Terms',
    component: staticDocumentView,
    meta: {
      isPublic: true,
      title: '利用許諾・著作権・禁止事項・免責事項',
      staticContentName: 'terms',
    },
  },
  {
    path: '/privacy',
    name: 'Privacy',
    component: staticDocumentView,
    meta: {
      isPublic: true,
      title: 'プライバシーポリシー',
      staticContentName: 'privacy',
    },
  },
  {
    path: '/cookie',
    name: 'CookiePolicy',
    component: staticDocumentView,
    meta: {
      isPublic: true,
      title: 'Cookieポリシー',
      staticContentName: 'cookie',
    },
  },
  {
    path: '/accessibility',
    name: 'Accessibility',
    component: staticDocumentView,
    meta: {
      isPublic: true,
      title: 'アクセシビリティ',
      staticContentName: 'accessibility',
    },
  },
  {
    path: '/contact',
    name: 'Contact',
    component: staticDocumentView,
    meta: {
      isPublic: true,
      title: 'お問い合わせ',
      staticContentName: 'contact',
    },
  },
  {
    path: '/tutorial',
    name: 'Tutorial',
    component: () => import('@/views/Tutorial.vue'),
    meta: { isPublic: true, title: 'チュートリアル' },
  },
  {
    path: '/help',
    name: 'Help',
    component: () => import('@/views/Help.vue'),
    meta: { isPublic: true, title: 'ヘルプ' },
  },
];
