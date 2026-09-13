import defaultStore from '@/store';

let applicationStore = defaultStore;

export const getApiApplicationStore = () => applicationStore;

export const setApiApplicationStore = (nextStore) => {
  applicationStore = nextStore || defaultStore;
};

export const resetApiApplicationStore = () => {
  applicationStore = defaultStore;
};
