<template>
  <div class="view management-view" :aria-busy="fetching ? 'true' : 'false'">
    <div class="view-header">
      <slot name="header" :fetching="fetching">
        <h1 class="view-title" tabindex="-1">{{ title }}</h1>
      </slot>
    </div>

    <div class="view-content">
      <div v-if="$slots.actions" class="management-page-actions">
        <slot name="actions" :fetching="fetching"></slot>
      </div>

      <div
        v-if="searchEnabled || $slots.filters"
        class="management-list-query"
        :class="{ 'management-list-query--with-filters': searchEnabled && $slots.filters }"
      >
        <div v-if="$slots.filters" class="management-list-filters">
          <slot name="filters" :fetching="fetching"></slot>
        </div>

        <SearchField
          v-if="searchEnabled"
          ref="searchField"
          v-model="search"
          :label="searchLabel || $t('検索')"
          :fieldClass="searchFieldClassMerged"
          :fieldStyle="searchFieldStyle"
          :showMinError="showMinError"
          :showMaxError="showMaxError"
          :minErrorText="searchMinErrorText"
          :maxErrorText="searchMaxErrorText"
          :disabled="fetching"
          :resultRegionId="resultRegionId"
          @blur="touchSearch"
          @search="searchList"
          @clear="clearSearch"
        />
      </div>

      <section
        :id="resultRegionId"
        class="management-list-results"
        role="region"
        :aria-label="$t('一覧結果')"
        :aria-busy="fetching ? 'true' : 'false'"
      >
        <p v-if="fetching" class="management-list-status" role="status">
          {{ $t(hasSuccessfulFetch ? '更新中です' : '読み込み中です') }}
        </p>

        <div v-if="listErrorMessage" class="management-list-error">
          <p role="alert">{{ listErrorMessage }}</p>
          <p v-if="hasSuccessfulFetch">{{ $t('前回取得した結果を表示しています') }}</p>
          <UiButton
            data-testid="management-list-retry"
            type="button"
            appearance="filled"
            tone="primary"
            :disabled="fetching"
            @click="retryFetch"
          >
            {{ $t('再試行') }}
          </UiButton>
        </div>

        <template v-if="hasSuccessfulFetch">
          <p v-if="items.length" class="management-list-summary">
            <span>{{ $t('全{total}件', { total: formattedTotal }, total) }}</span>
            <span>{{ $t('{current} / {last}ページ', { current: current_page, last: last_page }) }}</span>
          </p>

          <slot
            v-if="items.length"
            name="table"
            :items="items"
            :fetching="fetching"
            :currentPage="current_page"
            :lastPage="last_page"
            :total="total"
            :tableLabel="resolvedTableLabel"
            :tableAttrs="tableAttrs"
          ></slot>

          <p v-else data-testid="management-list-empty" class="management-list-empty">
            {{ $t(hasAppliedSearch ? '条件に一致するデータがありません' : 'データがありません') }}
          </p>

          <Pager
            v-if="items.length"
            :currentPage="current_page"
            :lastPage="last_page"
            :disabled="fetching"
            :resultRegionId="resultRegionId"
            @change="changePage"
          />
        </template>
      </section>
    </div>

    <slot name="dialogs"></slot>

    <UiSnackbar
      v-bind="resolvedSnackbarAttrs"
      v-model="snackbarVisible"
      :position="snackbarPosition"
      :duration="snackbarDuration"
      :isInfinity="snackbarIsInfinity"
      :message="snackbarMessage"
    />
  </div>
</template>

<script>
import { appendApiErrorMessage, isUnauthorized } from '@/api/apiClient';
import { useOptionsVuelidate } from '@/utils/validation';
import { minLength, maxLength } from '@vuelidate/validators';
import { isNavigationFailure } from 'vue-router';
import SearchField from '@/components/common/SearchField.vue';
import Pager from '@/components/common/Pager.vue';
import { formatLocaleNumber } from '@/utils/numberFormat';
import UiButton from '@/components/ui/UiButton.vue';
import UiSnackbar from '@/components/ui/UiSnackbar.vue';

export default {
  name: 'ManagementListBase',
  components: {
    Pager,
    SearchField,
    UiButton,
    UiSnackbar,
  },
  setup() {
    return { v$: useOptionsVuelidate() };
  },
  props: {
    title: {
      type: String,
      default: '',
    },
    fetcher: {
      type: Function,
      required: true,
    },
    errorMessage: {
      type: String,
      default: '',
    },
    searchEnabled: {
      type: Boolean,
      default: false,
    },
    searchLabel: {
      type: String,
      default: '',
    },
    searchFieldClass: {
      type: [String, Array, Object],
      default: null,
    },
    searchFieldStyle: {
      type: [String, Object],
      default: null,
    },
    searchMinLength: {
      type: Number,
      default: null,
    },
    searchMaxLength: {
      type: Number,
      default: null,
    },
    searchMinErrorText: {
      type: String,
      default: '',
    },
    searchMaxErrorText: {
      type: String,
      default: '',
    },
    payloadBuilder: {
      type: Function,
      default: null,
    },
    initialPage: {
      type: Number,
      default: 1,
    },
    autoFetch: {
      type: Boolean,
      default: true,
    },
    snackbarAttrs: {
      type: Object,
      default: () => ({}),
    },
    resultRegionId: {
      type: String,
      default: 'management-list-results',
    },
    tableLabel: {
      type: String,
      default: '',
    },
  },
  data() {
    return {
      items: [],
      search: null,
      appliedSearch: null,
      current_page: this.initialPage,
      last_page: 0,
      total: 0,
      fetching: false,
      snackbarVisible: false,
      snackbarPosition: 'center',
      snackbarDuration: 4000,
      snackbarIsInfinity: false,
      snackbarMessage: null,
      fetchRequestSeq: 0,
      activeFetchRequestId: 0,
      hasSuccessfulFetch: false,
      listErrorMessage: '',
      retryRequest: null,
      suppressNextRouteFetch: false,
      restoreSearchFocusAfterFetch: false,
    };
  },
  validations() {
    if (!this.searchEnabled) return {};
    const searchRules = {};
    if (this.searchMinLength != null) searchRules.minLength = minLength(this.searchMinLength);
    if (this.searchMaxLength != null) searchRules.maxLength = maxLength(this.searchMaxLength);
    if (!Object.keys(searchRules).length) return {};
    return { search: searchRules };
  },
  created() {
    this.syncFromRoute();
    if (this.autoFetch) this.fetchPage(this.current_page);
  },
  watch: {
    '$route.query'(nextQuery, prevQuery) {
      const next = this.parseQuery(nextQuery || {});
      const prev = this.parseQuery(prevQuery || {});
      if (next.page === prev.page && next.search === prev.search) return;
      this.current_page = next.page;
      if (this.searchEnabled) {
        this.appliedSearch = next.search;
        if (next.search !== prev.search) this.search = next.search;
      }
      if (this.suppressNextRouteFetch) {
        this.suppressNextRouteFetch = false;
        return;
      }
      if (this.autoFetch) this.fetchPage(this.current_page);
    },
  },
  methods: {
    parseQuery(query = {}) {
      const rawPage = query.page;
      const parsedPage = Number.parseInt(rawPage, 10);
      const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : this.initialPage;

      let search = null;
      if (this.searchEnabled) {
        if (Object.prototype.hasOwnProperty.call(query, 'q')) {
          const queryValue = query.q;
          search = queryValue == null ? '' : String(queryValue);
        }
      }

      return { page, search };
    },
    syncFromRoute() {
      if (!this.$route) return;
      const { page, search } = this.parseQuery(this.$route.query || {});
      this.current_page = page;
      if (this.searchEnabled) {
        this.search = search;
        this.appliedSearch = search;
      }
    },
    syncRouteQuery(page, search, { replace = false } = {}) {
      if (!this.$router || !this.$route) return false;
      const currentQuery = this.$route.query || {};
      const nextQuery = { ...currentQuery, page: String(page) };

      const hasSearch = this.searchEnabled && search !== null && String(search).length > 0;
      if (hasSearch) {
        nextQuery.q = String(search);
      } else if (Object.prototype.hasOwnProperty.call(nextQuery, 'q')) {
        delete nextQuery.q;
      }

      const current = this.parseQuery(currentQuery);
      const next = this.parseQuery(nextQuery);
      if (current.page === next.page && current.search === next.search) return false;

      const location = { query: nextQuery };
      if (this.$route.name) {
        location.name = this.$route.name;
        location.params = this.$route.params || {};
      } else if (this.$route.path) {
        location.path = this.$route.path;
      }
      return this.$router[replace ? 'replace' : 'push'](location);
    },
    buildPayload(page, search = this.appliedSearch) {
      if (this.payloadBuilder) {
        return this.payloadBuilder({ page, search });
      }
      if (!this.searchEnabled) return { page };
      const hasSearch = search !== null && String(search).length > 0;
      return { page, search: hasSearch ? search : null };
    },
    fetchPage(page, options = {}) {
      const requestId = ++this.fetchRequestSeq;
      this.activeFetchRequestId = requestId;
      this.fetching = true;

      const requestSearch = Object.prototype.hasOwnProperty.call(options, 'search')
        ? options.search
        : this.appliedSearch;
      const payload = options.payload || this.buildPayload(page, requestSearch);
      return Promise.resolve()
        .then(() => this.fetcher(payload))
        .then(async (res) => {
          if (requestId !== this.activeFetchRequestId) return;
          const data = res && res.data ? res.data : {};
          const lastPage = Number.isFinite(Number(data.pages)) ? Math.max(Number(data.pages), 0) : 0;
          const correctedPage = lastPage > 0 ? lastPage : 1;
          if (page > correctedPage && !options.correctionAttempted) {
            this.suppressNextRouteFetch = true;
            const navigation = this.syncRouteQuery(correctedPage, requestSearch, { replace: true });
            if (navigation) {
              await navigation;
            } else {
              this.suppressNextRouteFetch = false;
            }
            return this.fetchPage(correctedPage, {
              search: requestSearch,
              correctionAttempted: true,
            });
          }
          if (requestId !== this.activeFetchRequestId) return;
          this.items = Array.isArray(data.docs) ? data.docs : [];
          this.current_page = data.page || page;
          this.last_page = lastPage;
          this.total = data.total || 0;
          this.hasSuccessfulFetch = true;
          this.listErrorMessage = '';
          this.retryRequest = null;
        })
        .catch((error) => {
          if (requestId !== this.activeFetchRequestId) return;
          if (isUnauthorized(error)) {
            this.$store.dispatch('doLogout');
            this.$router.push({ name: 'Login' });
            return;
          }
          this.listErrorMessage = appendApiErrorMessage(this.errorMessage || this.$t('取得に失敗しました'), error, {
            translate: this.$t,
            wrapper: 'paren',
          });
          this.retryRequest = { page, search: requestSearch, payload };
        })
        .finally(() => {
          if (requestId === this.activeFetchRequestId) {
            this.fetching = false;
            if (this.restoreSearchFocusAfterFetch) {
              this.$nextTick(() => this.restoreSearchFocus());
            }
          }
        });
    },
    changePage(page) {
      if (this.fetching || page < 1 || page > this.last_page || page === this.current_page) return;
      this.syncRouteQuery(page, this.appliedSearch);
    },
    reload() {
      return this.fetchPage(this.current_page, { search: this.appliedSearch });
    },
    async reloadFromFirstPage() {
      const search = this.appliedSearch;
      this.suppressNextRouteFetch = true;

      try {
        const navigation = this.syncRouteQuery(1, search);
        if (navigation) {
          const navigationFailure = await navigation;
          if (isNavigationFailure(navigationFailure)) {
            this.suppressNextRouteFetch = false;
            return this.fetchPage(this.current_page, { search: this.appliedSearch });
          }
          await this.$nextTick();
        }
      } catch (error) {
        this.suppressNextRouteFetch = false;
        throw error;
      }

      this.suppressNextRouteFetch = false;
      this.current_page = 1;
      return this.fetchPage(1, { search });
    },
    retryFetch() {
      if (this.fetching || !this.retryRequest) return Promise.resolve();
      const { page, search, payload } = this.retryRequest;
      return this.fetchPage(page, { search, payload });
    },
    setItems(items) {
      this.items = Array.isArray(items) ? items : [];
      this.hasSuccessfulFetch = true;
      this.listErrorMessage = '';
      this.retryRequest = null;
    },
    replaceItem(updatedItem) {
      if (!updatedItem || !updatedItem._id) return;
      const index = this.items.findIndex((item) => item && item._id === updatedItem._id);
      if (index !== -1) {
        this.items.splice(index, 1, updatedItem);
      }
    },
    createLifecycleFocusRequest(targetId, orderedIds = null) {
      const ids = (Array.isArray(orderedIds) ? orderedIds : this.items.map((item) => item?._id))
        .filter((id) => id !== null && typeof id !== 'undefined')
        .map(String);
      const index = ids.indexOf(String(targetId));
      if (index === -1) return { candidateIds: [] };
      return {
        candidateIds: [ids[index + 1], ids[index - 1]].filter(Boolean),
      };
    },
    restoreLifecycleFocus(request) {
      const candidateIds = Array.isArray(request?.candidateIds) ? request.candidateIds.map(String) : [];
      this.$nextTick(() => {
        const actions = Array.from(
          this.$el.querySelectorAll('[data-management-lifecycle-id]')
        );
        const target = candidateIds
          .map((id) =>
            actions.find(
              (action) =>
                action.getAttribute('data-management-lifecycle-id') === id &&
                !action.disabled &&
                action.getAttribute('aria-disabled') !== 'true'
            )
          )
          .find(Boolean);
        if (target && typeof target.focus === 'function') {
          target.focus();
          if (document.activeElement === target) return;
        }
        const heading = this.$el.querySelector('h1.view-title');
        if (heading && typeof heading.focus === 'function') heading.focus();
      });
    },
    touchSearch() {
      if (this.v$ && this.v$.search) this.v$.search.$touch();
    },
    searchList() {
      if (!this.searchEnabled) return;
      this.touchSearch();
      if (this.v$ && this.v$.search && this.v$.search.$invalid) return;
      this.syncRouteQuery(1, this.search);
    },
    clearSearch() {
      if (!this.searchEnabled || this.fetching) return;
      this.search = '';
      if (this.v$ && this.v$.search) this.v$.search.$reset();
      this.restoreSearchFocusAfterFetch = true;
      const navigation = this.syncRouteQuery(1, '');
      if (navigation && typeof navigation.then === 'function') {
        void navigation.then(() => {
          this.$nextTick(() => this.restoreSearchFocus());
        });
      } else {
        this.$nextTick(() => this.restoreSearchFocus());
      }
    },
    restoreSearchFocus() {
      if (!this.restoreSearchFocusAfterFetch || this.fetching) return;
      this.restoreSearchFocusAfterFetch = false;
      const searchField = this.$refs.searchField;
      if (searchField && typeof searchField.focus === 'function') searchField.focus();
    },
    showSnackbar(message) {
      this.snackbarMessage = message;
      this.snackbarVisible = true;
    },
    showError(baseMessage, error, options = {}) {
      if (isUnauthorized(error)) {
        this.$store.dispatch('doLogout');
        this.$router.push({ name: 'Login' });
      }
      const message = appendApiErrorMessage(baseMessage, error, {
        translate: options.translate || this.$t,
        wrapper: options.wrapper || 'paren',
      });
      this.showSnackbar(message);
    },
  },
  computed: {
    formattedTotal() {
      return formatLocaleNumber(this.total, this.$i18n?.locale);
    },
    showMinError() {
      if (this.searchMinLength == null || !this.v$ || !this.v$.search) return false;
      return this.v$.search.minLength.$invalid;
    },
    showMaxError() {
      if (this.searchMaxLength == null || !this.v$ || !this.v$.search) return false;
      if (this.searchMinLength != null) {
        return !this.v$.search.minLength.$invalid && this.v$.search.maxLength.$invalid;
      }
      return this.v$.search.maxLength.$invalid;
    },
    searchFieldClassMerged() {
      return this.searchFieldClass;
    },
    hasAppliedSearch() {
      return this.searchEnabled && this.appliedSearch !== null && String(this.appliedSearch).length > 0;
    },
    resolvedTableLabel() {
      return this.tableLabel || this.title;
    },
    tableAttrs() {
      return this.resolvedTableLabel ? { 'aria-label': this.resolvedTableLabel } : {};
    },
    resolvedSnackbarAttrs() {
      return {
        role: 'alert',
        ariaLive: 'assertive',
        ariaAtomic: 'true',
        ...this.snackbarAttrs,
      };
    },
  },
};
</script>
