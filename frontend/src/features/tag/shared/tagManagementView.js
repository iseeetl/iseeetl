export const showTagEditDialog = (vm, { visibleKey, selectedKey }, data) => {
  vm[visibleKey] = true;
  vm[selectedKey] = data;
};

export const closeTagEditDialog = (vm, { visibleKey }) => {
  vm[visibleKey] = false;
};

export const successTagEditDialog =
  (vm, { close }) =>
  (data) => {
    if (vm.$refs.listBase && typeof vm.$refs.listBase.replaceItem === 'function') {
      vm.$refs.listBase.replaceItem(data);
    }
    close();
  };
