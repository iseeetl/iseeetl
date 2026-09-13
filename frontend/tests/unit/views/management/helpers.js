import { createMemoryHistory, createRouter as createVueRouter } from 'vue-router';
import { setTestRoute } from '../../helpers/testUtils';

const UiFieldStub = {
  name: 'UiField',
  props: {
    controlId: {
      type: String,
      required: true,
    },
  },
  template: '<div class="ui-field-stub"><slot :control-attrs="{ id: controlId }" /></div>',
};

const ManagementListBaseStub = {
  name: 'ManagementListBase',
  props: [
    'title',
    'fetcher',
    'errorMessage',
    'searchEnabled',
    'searchLabel',
    'searchFieldClass',
    'searchFieldStyle',
    'searchMinLength',
    'searchMaxLength',
    'searchMinErrorText',
    'searchMaxErrorText',
    'payloadBuilder',
    'initialPage',
    'autoFetch',
    'snackbarAttrs',
    'tableLabel',
  ],
  computed: {
    resolvedTableLabel() {
      return this.tableLabel || this.title;
    },
    tableAttrs() {
      return this.resolvedTableLabel ? { 'aria-label': this.resolvedTableLabel } : {};
    },
  },
  methods: {
    reload() {},
    reloadFromFirstPage() {},
    replaceItem() {},
    setItems() {},
    showError() {},
    showSnackbar() {},
  },
  template: `
    <div class="management-list-base-stub">
      <slot name="header" />
      <slot name="actions" :fetching="false" />
      <slot name="filters" :fetching="false" />
      <slot
        name="table"
        :items="[]"
        :fetching="false"
        :current-page="1"
        :last-page="0"
        :total="0"
        :table-label="resolvedTableLabel"
        :table-attrs="tableAttrs"
      />
      <slot name="dialogs" />
    </div>
  `,
};

const EditFloorTagDialogStub = {
  name: 'EditFloorTagDialog',
  props: ['dialogVisible', 'floorTag', 'floorName', 'tagName', 'managementMode'],
  template: '<div />',
};

const EditRoomTagDialogStub = {
  name: 'EditRoomTagDialog',
  props: [
    'dialogVisible',
    'roomTag',
    'floorName',
    'roomName',
    'tagName',
    'managementMode',
  ],
  template: '<div />',
};

const baseStubs = {
  ManagementListBase: ManagementListBaseStub,
  UiSnackbar: true,
  ConfirmDialog: true,
  EditFloorDialog: true,
  EditRoomDialog: true,
  EditRoomTagDialog: EditRoomTagDialogStub,
  EditFloorTagDialog: EditFloorTagDialogStub,
  EditQuickTextGroupDialog: true,
  EditQuickTextItemDialog: true,
  FloorMemberDialog: true,
  DeleteFloorMemberDialog: true,
  RoomMemberDialog: true,
  DeleteRoomMemberDialog: true,
  EditPostDialog: true,
  EditSpamDialog: true,
  UiField: UiFieldStub,
  draggable: true,
};

const translate = (key, params) => {
  if (!params) return key;
  return key.replace(/\{(\w+)\}/g, (match, name) => (name in params ? params[name] : match));
};

const createRouter = (overrides = {}) => {
  const router = createVueRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'Home', component: {} },
      { path: '/login', name: 'Login', component: {} },
    ],
  });
  return setTestRoute(router, overrides.route || '/');
};

const createStoreMock = (overrides = {}) => {
  const getters = {
    lang: 'ja',
    userRole: 'Administrator',
    userIsLogin: true,
    userId: 'user-1',
    userToken: 'token-1',
    floorId: 'floor-1',
    roomId: 'room-1',
    errorMessage: null,
    ariahiddenAppView: false,
    ...(overrides.getters || {}),
  };
  const state = {
    user: {
      role: getters.userRole,
      isLogin: getters.userIsLogin,
      token: getters.userToken,
      ...((overrides.state && overrides.state.user) || {}),
    },
    ...(overrides.state || {}),
  };
  return {
    getters,
    state,
    dispatch: overrides.dispatch || (() => {}),
  };
};

const createMountOptions = (overrides = {}) => ({
  stubs: { ...baseStubs, ...(overrides.stubs || {}) },
  router: overrides.router || createRouter({ route: overrides.route }),
  mocks: {
    $store: overrides.store || createStoreMock(),
    $t: translate,
    $i18n: { locale: 'ja' },
    ...(overrides.mocks || {}),
  },
});

const buildViewWithoutLifecycle = (view) => ({
  ...view,
  created() {},
  mounted() {},
  beforeUnmount() {},
});

export { baseStubs, translate, createRouter, createStoreMock, createMountOptions, buildViewWithoutLifecycle };
