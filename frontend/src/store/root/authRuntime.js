const runtimeByStore = new WeakMap();
const storeByState = new WeakMap();

const readSubject = (source) => {
  const state = source?.state || source?.rootState || (source?.user ? source : null);
  const user = state?.user;
  if (user?.isLogin) return { type: 'user', id: user.id ?? null };
  if (user?.guestId) return { type: 'guest', id: user.guestId };

  const getters = source?.getters || source;
  if (getters?.userIsLogin) return { type: 'user', id: getters.userId ?? null };
  if (getters?.guestId) return { type: 'guest', id: getters.guestId };
  return { type: 'anonymous', id: null };
};

const resolveStore = (source) => {
  if (source?.state && typeof source.subscribe === 'function') return source;
  if (source?.rootState && storeByState.has(source.rootState)) return storeByState.get(source.rootState);
  if (source?.user && storeByState.has(source)) return storeByState.get(source);
  return source?.rootState || source;
};

const ensureRuntime = (store) => {
  let runtime = runtimeByStore.get(store);
  if (!runtime) {
    const subject = readSubject(store);
    runtime = { revision: 0, subjectType: subject.type, subjectId: subject.id };
    runtimeByStore.set(store, runtime);
  }
  return runtime;
};

const updateRuntime = (store, { advance = false } = {}) => {
  const runtime = ensureRuntime(store);
  const subject = readSubject(store);
  if (advance) runtime.revision += 1;
  runtime.subjectType = subject.type;
  runtime.subjectId = subject.id;
};

export const authRuntimePlugin = (store) => {
  storeByState.set(store.state, store);
  updateRuntime(store);
  store.subscribe((mutation) => {
    const runtime = ensureRuntime(store);
    const subject = readSubject(store);
    const subjectChanged = runtime.subjectType !== subject.type || runtime.subjectId !== subject.id;
    const credentialChanged = ['setLoginUser', 'setUserToken', 'setUserRole', 'logout'].includes(mutation.type);
    updateRuntime(store, { advance: subjectChanged || credentialChanged });
  });
};

export const captureAuthSnapshot = (source) => {
  const store = resolveStore(source);
  const runtime = ensureRuntime(store);
  const subject = readSubject(store);
  return Object.freeze({
    store,
    revision: runtime.revision,
    subjectType: subject.type,
    subjectId: subject.id,
  });
};

export const isAuthSnapshotCurrent = (snapshot) => {
  if (!snapshot?.store) return false;
  const current = captureAuthSnapshot(snapshot.store);
  return (
    current.store === snapshot.store &&
    current.revision === snapshot.revision &&
    current.subjectType === snapshot.subjectType &&
    current.subjectId === snapshot.subjectId
  );
};

export const isSameAuthSnapshot = (left, right) =>
  Boolean(
    left &&
      right &&
      left.store === right.store &&
      left.revision === right.revision &&
      left.subjectType === right.subjectType &&
      left.subjectId === right.subjectId
  );
