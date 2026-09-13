const callProfileResolver = (context, getterName, user, fallback) => {
  const resolver = context?.$store?.getters?.[getterName];
  return typeof resolver === 'function' ? resolver(user) : fallback;
};

const isSameUserId = (left, right) => left != null && right != null && String(left) === String(right);

export const syncUserProfileSnapshots = (rootValue, { userId, userName, userImageName }) => {
  if (userId == null || rootValue == null) return 0;

  const visited = new WeakSet();
  let updatedCount = 0;

  const visit = (value) => {
    if (value == null || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);

    const user = value.user;
    if (user && typeof user === 'object' && isSameUserId(user._id, userId)) {
      user.username = userName;
      user.image_name = userImageName;
      updatedCount += 1;
    }

    Object.values(value).forEach(visit);
  };

  visit(rootValue);
  return updatedCount;
};

export const userDisplayMethods = {
  resolveUserDisplayName(user) {
    return callProfileResolver(this, 'resolveUserDisplayName', user, user?.username);
  },

  resolveUserDisplayImageName(user) {
    return callProfileResolver(this, 'resolveUserDisplayImageName', user, user?.image_name);
  },

  hasUserDisplayImage(user) {
    return Boolean(user && this.resolveUserDisplayImageName(user));
  },

  getUserDisplayImagePath(user) {
    const imageName = this.resolveUserDisplayImageName(user);
    return user?._id != null && imageName ? `/profile/${user._id}/${imageName}` : null;
  },

  resolveActorDisplayName(data) {
    if (data?.user) return this.resolveUserDisplayName(data.user);
    return data?.guest_name || data?.guestname;
  },
};

export default userDisplayMethods;
