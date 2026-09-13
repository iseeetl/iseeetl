<template>
  <div>
    <div class="view">
      <div class="view-header">
        <h1 id="floor_list_title" class="view-title" tabindex="-1">
          {{ $t('フロア一覧') }}
        </h1>
      </div>

      <div class="view-content">
        <div class="floor-action">
          <UiButton
            v-if="$store.getters.userRole === 'Administrator' || $store.getters.userRole === 'Editor'"
            class="create-floor-button"
            appearance="filled"
            tone="success"
            data-testid="floor-list-create-button"
            @click="showEditFloorDialog(null)"
          >
            {{ $t('フロア作成') }}
          </UiButton>

          <UiButton
            v-if="$store.getters.userRole === 'Administrator' || $store.getters.userRole === 'Editor'"
            class="create-floor-button"
            appearance="filled"
            tone="success"
            data-testid="floor-list-hide-all-button"
            @click="showUpdateFloorDisplayConfirm(true)"
          >
            {{ $t('全フロア非表示') }}
          </UiButton>

          <UiButton
            v-if="$store.getters.userRole === 'Administrator' || $store.getters.userRole === 'Editor'"
            class="create-floor-button"
            appearance="filled"
            tone="success"
            @click="showUpdateFloorDisplayConfirm(false)"
          >
            {{ $t('全フロア表示') }}
          </UiButton>

          <div class="search-floor">
            <UiField
              class="search-floor-input"
              :class="{ 'search-floor-input--has-value': search !== '' }"
              control-id="search_floor_input"
              :label="$t('フロア検索')"
              :invalid="v$.search.$dirty && v$.search.$invalid"
              :error="searchError"
            >
              <template #default="{ controlAttrs }">
                <UiIcon class="search-floor-icon" name="search" />
                <input
                  v-bind="controlAttrs"
                  v-model="search"
                  dir="auto"
                  type="search"
                  :disabled="sending"
                  maxlength="100"
                  @blur="v$.search.$touch()"
                />
              </template>
            </UiField>
            <UiButton
              class="search-floor-button"
              appearance="filled"
              tone="primary"
              :disabled="sending"
              @click="handleSearch"
            >
              {{ $t('検索') }}
            </UiButton>
          </div>
        </div>

        <ul class="card-wrapper">
          <li v-for="floor in floors" :key="floor._id">
            <article class="floor-card floor-card--interactive">
              <router-link :id="floor._id" class="floor-card__link" :to="{ path: `/floor/${floor._id}` }">
                <figure class="floor-card__media">
                  <img
                    class="floor-card__image"
                    alt=""
                    :src="
                      floor.image_name === null
                        ? '/assets/image/floor_default.jpg'
                        : '/media/' + floor._id + '/' + floor.image_name
                    "
                  />
                  <span v-if="floor.floor_display_hidden" class="floor-card__visibility">
                    {{ $t('非表示中') }}
                  </span>
                </figure>
                <section class="floor-card__content">
                  <div class="floor-title-description-wrappe">
                    <h2 class="floor-title" dir="auto" :class="'floor-title-' + floor._id">
                      {{ getFloorTitle(floor) }}
                    </h2>
                    <p class="floor-description" dir="auto">
                      {{ getFloorDescription(floor) }}
                    </p>
                  </div>
                  <div class="floor-created-wrapper">
                    <div class="floor-created">
                      <div class="user-icon">
                        <UiAvatar>
                          <UiIcon
                            v-if="!hasUserDisplayImage(floor.user)"
                            name="person"
                            :size="24"
                          />
                          <img v-else alt="" :src="getUserDisplayImagePath(floor.user)" />
                        </UiAvatar>
                      </div>

                      <div>
                        <div>
                          <span>{{ $t('フロア作成者') }} </span
                          ><span dir="auto">{{ resolveUserDisplayName(floor.user) }}</span>
                        </div>
                        <div>
                          {{ $t('フロア作成日') + ' ' + getLocalDate(floor.created_at) }}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </router-link>
              <footer v-if="canManageFloor(floor)" class="floor-card__actions">
                <UiButton
                  :id="`delete_floor_button_${floor._id}`"
                  appearance="filled"
                  tone="danger"
                  @click="showDeleteFloorDialog(floor)"
                >
                  {{ $t('削除') }}
                </UiButton>

                <UiButton
                  :id="`edit_floor_button_${floor._id}`"
                  appearance="filled"
                  tone="primary"
                  @click="showEditFloorDialog(floor)"
                >
                  {{ $t('編集') }}
                </UiButton>
              </footer>
            </article>
          </li>
        </ul>

        <!-- 遷移後にフォーカスをリセットするため、a要素でページ全体を読み込み直す。 -->
        <div class="pager" role="navigation" :aria-label="$t('ページ番号')">
          <ul>
            <li>
              <template v-if="currentPage > 1">
                <a :href="generatePageLink(1)" :aria-label="$t('最初のページ')"><UiIcon name="first_page" /></a>
              </template>
              <template v-else>
                <span aria-disabled="true" :aria-label="$t('最初のページ')"><UiIcon name="first_page" /></span>
              </template>
            </li>
            <li>
              <template v-if="currentPage > 1">
                <a :href="generatePageLink(currentPage - 1)" :aria-label="$t('前のページ')"><UiIcon name="chevron_left" /></a>
              </template>
              <template v-else>
                <span aria-disabled="true" :aria-label="$t('前のページ')"><UiIcon name="chevron_left" /></span>
              </template>
            </li>
            <li v-for="page in pages" :key="page">
              <span v-if="page === currentPage" class="pager-current-page" aria-current="page">
                {{ page }}
              </span>
              <a v-else :href="generatePageLink(page)" :aria-label="$t('{page}ページ', { page: page })">
                {{ page }}
              </a>
            </li>
            <li>
              <template v-if="currentPage < lastPage">
                <a :href="generatePageLink(currentPage + 1)" :aria-label="$t('次のページ')"><UiIcon name="chevron_right" /></a>
              </template>
              <template v-else>
                <span aria-disabled="true" :aria-label="$t('次のページ')"><UiIcon name="chevron_right" /></span>
              </template>
            </li>
            <li>
              <template v-if="currentPage < lastPage">
                <a :href="generatePageLink(lastPage)" :aria-label="$t('最後のページ')"><UiIcon name="last_page" /></a>
              </template>
              <template v-else>
                <span aria-disabled="true" :aria-label="$t('最後のページ')"><UiIcon name="last_page" /></span>
              </template>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <EditFloorDialog
      :dialogVisible="editFloorDialogVisible"
      :propsFloor="editFloorValue"
      :targetName="editFloorValue ? getFloorTitle(editFloorValue) : ''"
      :managementMode="false"
      @success="successEditFloor"
      @close="closeEditFloor()"
    />

    <DeleteFloorDialog
      :dialogVisible="deleteFloorDialogVisible"
      :propsFloor="deleteFloorValue"
      :targetName="deleteFloorValue ? getFloorTitle(deleteFloorValue) : ''"
      @success="successDeleteFloor"
      @close="closeDeleteFloor()"
    />

    <UpdateFloorDisplayConfirm
      :confirmVisible="updateFloorDisplayVisible"
      :floorDisplayHidden="floorDisplayHidden"
      :sending="sending"
      @done="updateFloorDisplay"
      @close="closeUpdateFloorDisplayConfirm"
    />
  </div>
</template>

<script>
import { mapState } from 'vuex';
import floorApi from '@/api/floor';
import { appendApiErrorMessage } from '@/api/apiClient';
import DateUtil from '@/utils/dateUtil.js';
import { useOptionsVuelidate } from '@/utils/validation';
import { minLength, maxLength } from '@vuelidate/validators';
import EditFloorDialog from '@/components/floor/EditFloorDialog.vue';
import DeleteFloorDialog from '@/components/floor/DeleteFloorDialog.vue';
import UpdateFloorDisplayConfirm from '@/components/floor/UpdateFloorDisplayConfirm.vue';
import { handleAuthError as handleAuthErrorUtil } from '@/utils/authError';
import UiAvatar from '@/components/ui/UiAvatar.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiField from '@/components/ui/UiField.vue';
import UiIcon from '@/components/ui/UiIcon.vue';
import userDisplayMethods from '@/features/profile/userDisplayMethods';

export default {
  name: 'Floor',
  components: {
    EditFloorDialog,
    DeleteFloorDialog,
    UpdateFloorDisplayConfirm,
    UiAvatar,
    UiButton,
    UiField,
    UiIcon,
  },
  setup() {
    return { v$: useOptionsVuelidate() };
  },
  data() {
    return {
      floors: [],
      search: '',
      currentPage: 1,
      lastPage: 0,
      total: 0,

      editFloorDialogVisible: false,
      editFloorValue: null,

      deleteFloorDialogVisible: false,
      deleteFloorValue: null,
      deleteFloorFocusRequest: null,

      updateFloorDisplayVisible: false,
      floorDisplayHidden: null,

      sending: false,
      floorFetchRequestSeq: 0,
      activeFloorFetchRequestId: 0,
    };
  },
  validations: {
    search: {
      minLength: minLength(1),
      maxLength: maxLength(100),
    },
  },
  created() {
    this.syncFloorRoute(this.$route);
  },
  mounted() {
    // 前の画面から引き継いだエラーは、一度だけ表示して消去する。
    if (this.$store.getters.errorMessage !== null) {
      this.setSnackbar(this.$store.getters.errorMessage, 'alert');

      this.$store.dispatch('doUpdateErrorMessage', {
        message: null,
      });
    }
  },
  computed: {
    ...mapState({
      userIsLogin: (state) => state.user.isLogin,
      userId: (state) => state.user.id,
      userRole: (state) => state.user.role,
    }),
    pages() {
      let from = Math.max(...[this.currentPage - 2, 1]);
      let to = Math.min(...[from + 4, this.lastPage]);
      from = Math.max(...[to - 4, 1]);
      return [...Array(to - from + 1).keys()].map((x) => x + from);
    },
    searchError() {
      const field = this.v$.search;
      if (!field.$dirty) return '';
      if (field.minLength.$invalid) return this.$t('1文字以上です');
      if (field.maxLength.$invalid) return this.$t('100文字以内です');
      return '';
    },
  },
  watch: {
    $route(to) {
      this.syncFloorRoute(to);
    },
  },
  methods: {
    ...userDisplayMethods,
    normalizePageParam(page) {
      if (typeof page === 'undefined') return 1;
      const rawPage = String(page);
      if (!/^[1-9]\d*$/.test(rawPage)) return 1;
      const parsedPage = Number(rawPage);
      return Number.isSafeInteger(parsedPage) ? parsedPage : 1;
    },

    syncFloorRoute(route) {
      const pageParam = route.params.page;
      const page = this.normalizePageParam(pageParam);
      this.search = route.query.q || '';

      if (typeof pageParam !== 'undefined' && String(page) !== String(pageParam)) {
        this.$router.replace({ path: '/page/1', query: { ...route.query } });
        return;
      }

      this.currentPage = page;
      this.fetchFloor(page);
    },

    canManageFloor(floor) {
      if (!this.userIsLogin) return false;
      if (this.userRole === 'Administrator') return true;
      return this.userRole === 'Editor' && floor.user && floor.user._id === this.userId;
    },

    refreshFirstPage() {
      if (this.currentPage === 1) {
        this.fetchFloor(1);
        return;
      }
      this.$router.replace({ path: '/page/1', query: { ...this.$route.query } });
    },

    getFloorTitle(floor) {
      if (floor.lang === this.$i18n.locale) return floor.title;
      if (floor.translations === undefined) return floor.title;
      const translation = floor.translations.find((t) => t.lang === this.$i18n.locale);
      if (translation === undefined) return floor.title;
      return translation.title;
    },

    getFloorDescription(floor) {
      if (floor.lang === this.$i18n.locale) return floor.description;
      if (floor.translations === undefined) return floor.description;
      const translation = floor.translations.find((t) => t.lang === this.$i18n.locale);
      if (translation === undefined) return floor.description;
      return translation.description;
    },

    getLocalDate(createdAt) {
      return DateUtil.getLocalDate(createdAt, this.$i18n.locale, 'date');
    },

    fetchFloor(page) {
      const requestId = ++this.floorFetchRequestSeq;
      this.activeFloorFetchRequestId = requestId;
      this.sending = true;

      const data = {
        page: page,
        search: this.search,
      };
      floorApi
        .paginate({ ...data, isGuest: !this.userIsLogin })
        .then((res) => {
          if (requestId !== this.activeFloorFetchRequestId) return;
          this.floors = res.data.docs;
          this.currentPage = res.data.page;
          this.lastPage = res.data.pages;
          this.total = res.data.total;
        })
        .catch((err) => {
          if (requestId !== this.activeFloorFetchRequestId) return;

          const message = appendApiErrorMessage(this.$t('フロアの取得に失敗しました'), err, { translate: this.$t });
          this.setSnackbar(message, 'alert');

          return handleAuthErrorUtil(err, { store: this.$store, router: this.$router });
        })
        .finally(() => {
          if (requestId === this.activeFloorFetchRequestId) {
            this.sending = false;
            this.markDeleteFloorListReady();
          }
        });
    },

    handleSearch() {
      this.v$.search.$touch();
      if (this.v$.search.$invalid) return;
      if (this.search === '') {
        this.$router.replace({ path: '/page/1' });
        return;
      }
      const currentQuery = this.$route.query;
      const newQuery = { ...currentQuery, q: this.search };
      const currentPath = this.$route.fullPath;
      const newPath = `/page/1?${new URLSearchParams(newQuery).toString()}`;

      if (currentPath !== newPath) {
        this.$router.replace({ path: '/page/1', query: newQuery });
      }
    },

    generatePageLink(page) {
      const query = this.search ? `?q=${encodeURIComponent(this.search)}` : '';
      return `/page/${page}${query}`;
    },

    showEditFloorDialog(floor = null) {
      this.editFloorDialogVisible = true;
      if (floor !== null) {
        this.editFloorValue = floor;
      }
    },
    successEditFloor() {
      this.refreshFirstPage();
      this.editFloorDialogVisible = false;
    },
    closeEditFloor() {
      this.editFloorDialogVisible = false;
      this.editFloorValue = null;
    },

    showDeleteFloorDialog(floor) {
      this.deleteFloorFocusRequest = null;
      this.deleteFloorDialogVisible = true;
      this.deleteFloorValue = floor;
    },
    successDeleteFloor() {
      const deletedFloorId = this.deleteFloorValue?._id;
      const index = this.floors.findIndex((floor) => floor._id === deletedFloorId);
      const candidateIds = [];
      if (index !== -1) {
        if (this.floors[index + 1]?._id) candidateIds.push(this.floors[index + 1]._id);
        if (this.floors[index - 1]?._id) candidateIds.push(this.floors[index - 1]._id);
      }
      this.deleteFloorFocusRequest = {
        candidateIds,
        dialogClosed: false,
        listReady: false,
      };
      this.refreshFirstPage();
      this.deleteFloorDialogVisible = false;
    },
    closeDeleteFloor() {
      this.deleteFloorDialogVisible = false;
      this.deleteFloorValue = null;
      if (!this.deleteFloorFocusRequest) return;
      this.deleteFloorFocusRequest.dialogClosed = true;
      this.restoreDeleteFloorFocusIfReady();
    },
    markDeleteFloorListReady() {
      if (!this.deleteFloorFocusRequest) return;
      this.deleteFloorFocusRequest.listReady = true;
      this.restoreDeleteFloorFocusIfReady();
    },
    restoreDeleteFloorFocusIfReady() {
      const request = this.deleteFloorFocusRequest;
      if (!request?.dialogClosed || !request.listReady) return;
      this.deleteFloorFocusRequest = null;
      this.$nextTick(() => {
        const floorLink = request.candidateIds
          .map((id) => document.getElementById(id))
          .find((element) => element?.isConnected && !element.disabled);
        const createButton = document.querySelector('[data-testid="floor-list-create-button"]');
        const listTitle = document.getElementById('floor_list_title');
        const focusTarget = floorLink || createButton || listTitle;
        if (!focusTarget?.isConnected || focusTarget.disabled || typeof focusTarget.focus !== 'function') return;
        focusTarget.focus({ preventScroll: true });
      });
    },

    showUpdateFloorDisplayConfirm(floorDisplayHidden) {
      this.updateFloorDisplayVisible = true;
      this.floorDisplayHidden = floorDisplayHidden;
    },
    updateFloorDisplay(floorDisplayHidden) {
      if (this.sending) return;
      this.sending = true;

      const data = { floor_display_hidden: floorDisplayHidden };

      floorApi
        .updateDisplayHidden(data)
        .then(() => {
          this.sending = false;
          if (floorDisplayHidden) {
            this.setSnackbar(this.$t('全フロアを非表示に変更しました'), 'status');
          } else {
            this.setSnackbar(this.$t('全フロアを表示に変更しました'), 'status');
          }

          this.updateFloorDisplayVisible = false;
          this.fetchFloor(1);
        })
        .catch((e) => {
          this.sending = false;
          if (floorDisplayHidden) {
            const message = appendApiErrorMessage(this.$t('全フロアの非表示変更に失敗しました'), e, {
              translate: this.$t,
            });
            this.setSnackbar(message, 'alert');
          } else {
            const message = appendApiErrorMessage(this.$t('全フロアの表示変更に失敗しました'), e, {
              translate: this.$t,
            });
            this.setSnackbar(message, 'alert');
          }
          return handleAuthErrorUtil(e, { store: this.$store, router: this.$router });
        });
    },
    closeUpdateFloorDisplayConfirm() {
      this.updateFloorDisplayVisible = false;
      this.floorDisplayHidden = null;
    },
    setSnackbar(message, role = 'status') {
      this.$store.dispatch('doShowSnackbar', { message, role });
    },
  },
};
</script>

<style scoped>
.search-floor {
  margin-inline-start: auto;
  display: flex;
  align-items: flex-start;
}
.search-floor-input {
  margin: -8px 8px 0px;
  width: 300px;
  position: relative;
  padding-top: 12px;
}
.search-floor-input :deep(.ui-field__label){
  position: absolute;
  z-index: 1;
  top: 22px;
  inset-inline-start: 36px;
  padding: 0 2px;
  line-height: 20px;
  background: #fff;
  pointer-events: none;
  transition: top 150ms ease, font-size 150ms ease, line-height 150ms ease, color 150ms ease;
}
.search-floor-input:focus-within :deep(.ui-field__label),
.search-floor-input--has-value :deep(.ui-field__label){
  top: 0;
  font-size: 12px;
  line-height: 16px;
}
.search-floor-input:focus-within :deep(.ui-field__label){
  color: var(--ui-color-primary);
}
.search-floor-icon {
  position: absolute;
  top: 50%;
  inset-inline-start: 8px;
  transform: translateY(-50%);
  color: var(--ui-color-primary);
}
.search-floor-input input {
  padding-inline-start: 36px;
}
.search-floor-button {
  margin-inline-start: 0;
  margin-bottom: 0;
}

.card-wrapper {
  padding: 0px;
  margin: 0px;
  list-style-type: none;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  justify-content: flex-start;
  flex-wrap: wrap;
  align-content: stretch;
}

.floor-card {
  position: relative;
  margin: 8px;
  width: 300px;
  overflow: hidden;
  border: 1px solid var(--ui-color-border);
  border-radius: 3px;
  background: #fff;
}
.floor-card--interactive:hover,
.floor-card--interactive:focus-within {
  border-color: var(--ui-color-primary);
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.24);
}
.floor-card__link {
  display: block;
  height: 420px;
  color: #000;
  text-decoration: none;
}
.floor-card__media {
  position: relative;
  margin: 0;
}
.floor-card__image {
  display: block;
  width: 300px;
  height: 200px;
  object-fit: cover;
}
.floor-card__visibility {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 6px 12px;
  border-radius: 16px;
  color: #fff;
  background: var(--ui-color-danger);
  font-size: 18px;
  font-weight: normal;
}
.floor-card__content {
  position: relative;
  box-sizing: border-box;
  padding: 8px;
  height: calc(100% - 200px);
}
.floor-card__actions {
  display: flex;
  justify-content: flex-end;
  padding: 0 8px 8px;
}
.floor-title-description-wrappe {
  overflow: hidden;
  height: 150px;
  margin-bottom: 8px;
}
.floor-title {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  word-break: break-all;
  font-size: 22px;
  line-height: 26px;
  font-weight: normal;
  margin: 0 0 8px;
}
.floor-description {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  word-break: break-all;
  font-size: 14px;
  line-height: 16px;
}
.floor-created-wrapper {
  position: absolute;
  inset-inline-start: 0;
  bottom: 0;
  padding: 8px;
  width: 100%;
}
.floor-created {
  width: 100%;
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}
.floor-action {
  display: flex;
  align-items: flex-start;
  padding-bottom: 4px;
}
.create-floor-button {
  margin-inline-start: 8px;
  margin-bottom: 0;
}
.user-icon {
  margin-inline-end: 8px;
}

.pager ul {
  list-style: none;
  display: flex;
  justify-content: center;
  padding: 0;
}

.pager ul li {
  margin: 0 8px;
}

.pager ul li > a,
.pager ul li > span {
  display: block;
  font-size: 16px;
  padding: 0.6em 1em;
  border-radius: 3px;
  text-decoration: none;
  border: solid 1px transparent;
  color: #000000;
}

.pager ul li > a:hover,
.pager ul li > span:hover {
  text-decoration: none;
}

.pager ul li > a:hover {
  border-color: #000000;
}

.pager ul li > a.pager-current-page,
.pager ul li > span.pager-current-page {
  border-color: #005aff;
}

@media screen and (max-width: 896px) {
  .floor-action {
    display: block !important;
  }
  .floor-search-input {
    width: 150px !important;
  }

  .pager ul li > a,
  .pager ul li > span {
    padding: 0.1em 0.5em;
    border-radius: 3px;
  }
}
</style>
