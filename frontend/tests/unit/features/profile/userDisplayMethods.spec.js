import { expect } from 'vitest';
import { syncUserProfileSnapshots, userDisplayMethods } from '@/features/profile/userDisplayMethods';

const createContext = (getters = {}) => ({
  $store: { getters },
  ...userDisplayMethods,
});

describe('プロフィール表示の共通処理', () => {
  it('プロフィールの表示情報をVuexから取得する', () => {
    const user = { _id: 'user-1', username: '旧名', image_name: 'old.png' };
    const context = createContext({
      resolveUserDisplayName: () => '新名',
      resolveUserDisplayImageName: () => 'new.png',
    });

    expect(context.resolveActorDisplayName({ user })).to.equal('新名');
    expect(context.hasUserDisplayImage(user)).to.equal(true);
    expect(context.getUserDisplayImagePath(user)).to.equal('/profile/user-1/new.png');
  });

  it('画像削除後は画像なしとして扱う', () => {
    const user = { _id: 'user-1', username: 'User', image_name: 'old.png' };
    const context = createContext({
      resolveUserDisplayName: () => 'User',
      resolveUserDisplayImageName: () => null,
    });

    expect(context.hasUserDisplayImage(user)).to.equal(false);
    expect(context.getUserDisplayImagePath(user)).to.equal(null);
  });

  it('表示情報の取得処理がなければ、取得済みのユーザ情報を使う', () => {
    const user = { _id: 'user-2', username: '取得名', image_name: 'fetched.png' };
    const context = createContext();

    expect(context.resolveUserDisplayName(user)).to.equal('取得名');
    expect(context.getUserDisplayImagePath(user)).to.equal('/profile/user-2/fetched.png');
    expect(context.resolveActorDisplayName({ guest_name: 'Guest' })).to.equal('Guest');
  });

  it('表示中データの本人スナップショットを再帰的に同期する', () => {
    const ownUser = { _id: 'user-1', username: '旧名', image_name: 'old.png' };
    const ownReplyUser = { _id: 'user-1', username: '旧名', image_name: 'old.png' };
    const ownNotificationUser = { _id: 'user-1', username: '旧名', image_name: 'old.png' };
    const otherUser = { _id: 'user-2', username: '別名', image_name: 'other.png' };
    const rootValue = {
      posts: [
        {
          user: ownUser,
          replies: [{ user: ownReplyUser }, { user: otherUser }],
          reactionNotification: { user: ownNotificationUser },
        },
      ],
    };

    const count = syncUserProfileSnapshots(rootValue, {
      userId: 'user-1',
      userName: '新名',
      userImageName: null,
    });

    expect(count).to.equal(3);
    expect(ownUser).to.deep.equal({ _id: 'user-1', username: '新名', image_name: null });
    expect(ownReplyUser).to.deep.equal({ _id: 'user-1', username: '新名', image_name: null });
    expect(ownNotificationUser).to.deep.equal({ _id: 'user-1', username: '新名', image_name: null });
    expect(otherUser).to.deep.equal({ _id: 'user-2', username: '別名', image_name: 'other.png' });
  });
});
