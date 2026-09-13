import { useOptionsVuelidate } from '@/utils/validation';
import { required, maxLength } from '@vuelidate/validators';
import quickTextAPI from '@/api/quickText';
import { appendApiErrorMessage } from '@/api/apiClient';
import { showSnackbar } from '@/utils/snackbar';
import { handleAuthError as handleAuthErrorUtil } from '@/utils/authError';
import UiField from '@/components/ui/UiField.vue';
import BaseEditDialog from '@/components/common/BaseEditDialog.vue';
import DialogTargetContext from '@/components/common/DialogTargetContext.vue';
import { normalizeSupportedLocale } from '@/utils/locale.js';

const buildErrorOptions = (vm, errorWrapper) => {
  const options = { translate: vm.$t };
  if (errorWrapper) options.wrapper = errorWrapper;
  return options;
};

export const createQuickTextGroupDialogComponent = ({
  name,
  resource,
  errorWrapper = null,
  confirmDiscard = false,
}) => {
  const props = {
    dialogVisible: Boolean,
    propsGroup: Object,
  };

  return {
    name,
    emits: ['close', 'success'],
    components: {
      UiField,
      BaseEditDialog,
      DialogTargetContext,
    },
    setup() {
      return { v$: useOptionsVuelidate() };
    },
    props,
    validations: {
      title: { required, maxLength: maxLength(200) },
    },
    data() {
      return {
        visible: Boolean(this.dialogVisible),
        sending: false,
        id: null,
        title: null,
        initialFormSnapshot: null,
        discardConfirmVisible: false,
        closeAfterDiscardConfirmation: false,
      };
    },
    watch: {
      dialogVisible(value) {
        this.visible = value;
      },
    },
    computed: {
      titleInvalid() {
        return this.v$.title.$dirty && this.v$.title.$invalid;
      },
      titleError() {
        if (!this.v$.title.$dirty) return '';
        if (this.v$.title.required.$invalid) return this.$t('必須');
        if (this.v$.title.maxLength.$invalid) return this.$t('200文字まで');
        return '';
      },
      targetName() {
        return this.propsGroup?.title || '';
      },
      hasUnsavedChanges() {
        return this.initialFormSnapshot !== null && this.initialFormSnapshot !== this.createFormSnapshot();
      },
    },
    methods: {
      openedDialog() {
        if (this.propsGroup) {
          this.id = this.propsGroup._id;
          this.title = this.propsGroup.title;
        } else {
          this.id = null;
          this.title = null;
        }
        this.initialFormSnapshot = this.createFormSnapshot();
        this.discardConfirmVisible = false;
        this.closeAfterDiscardConfirmation = false;
        if (this.v$) this.v$.$reset();
      },
      createFormSnapshot() {
        return JSON.stringify({ title: this.title ?? '' });
      },
      onCancel() {
        if (this.sending) return;
        if (confirmDiscard && this.hasUnsavedChanges) {
          this.discardConfirmVisible = true;
          return;
        }
        this.visible = false;
      },
      confirmDiscard() {
        this.closeAfterDiscardConfirmation = true;
        this.discardConfirmVisible = false;
      },
      cancelDiscard() {
        this.closeAfterDiscardConfirmation = false;
        this.discardConfirmVisible = false;
      },
      handleDiscardConfirmationClosed() {
        if (!this.closeAfterDiscardConfirmation) return;
        this.closeAfterDiscardConfirmation = false;
        this.visible = false;
      },
      async onDone() {
        this.v$.$touch();
        if (this.v$.$invalid || this.sending) return;

        this.sending = true;
        try {
          const lang = normalizeSupportedLocale(
            this.id ? this.propsGroup?.lang : this.$store.getters.lang,
            normalizeSupportedLocale(this.$store.getters.lang, 'ja')
          );
          const payloadBase = {
            resource,
            lang,
          };

          if (this.id) {
            await quickTextAPI.updateGroup(this.$store.getters.userToken, {
              ...payloadBase,
              id: this.id,
              title: this.title,
            });
            this.$emit('success');
            showSnackbar(this.$store, this.$t('単語グループを更新しました'), 'status');
          } else {
            await quickTextAPI.createGroup(this.$store.getters.userToken, {
              ...payloadBase,
              title: this.title,
            });
            this.$emit('success');
            showSnackbar(this.$store, this.$t('単語グループを作成しました'), 'status');
          }

          this.visible = false;
        } catch (error) {
          const message = appendApiErrorMessage(
            this.$t('単語グループの保存に失敗しました'),
            error,
            buildErrorOptions(this, errorWrapper)
          );
          showSnackbar(this.$store, message, 'alert');
          return handleAuthErrorUtil(error, { store: this.$store, router: this.$router });
        } finally {
          this.sending = false;
        }
      },
      closedDialog() {
        if (!this.sending) this.$emit('close');
      },
    },
  };
};

export const createQuickTextItemDialogComponent = ({
  name,
  resource,
  errorWrapper = null,
  confirmDiscard = false,
}) => {
  const props = {
    dialogVisible: Boolean,
    propsItem: Object,
    group: Object,
  };

  return {
    name,
    emits: ['close', 'success'],
    components: {
      UiField,
      BaseEditDialog,
      DialogTargetContext,
    },
    setup() {
      return { v$: useOptionsVuelidate() };
    },
    props,
    validations: {
      label: { required, maxLength: maxLength(200) },
    },
    data() {
      return {
        visible: Boolean(this.dialogVisible),
        sending: false,
        id: null,
        label: null,
        initialFormSnapshot: null,
        discardConfirmVisible: false,
        closeAfterDiscardConfirmation: false,
      };
    },
    watch: {
      dialogVisible(value) {
        this.visible = value;
      },
    },
    computed: {
      labelInvalid() {
        return this.v$.label.$dirty && this.v$.label.$invalid;
      },
      labelError() {
        if (!this.v$.label.$dirty) return '';
        if (this.v$.label.required.$invalid) return this.$t('必須');
        if (this.v$.label.maxLength.$invalid) return this.$t('200文字まで');
        return '';
      },
      targetName() {
        return this.propsItem?.label || '';
      },
      hasUnsavedChanges() {
        return this.initialFormSnapshot !== null && this.initialFormSnapshot !== this.createFormSnapshot();
      },
    },
    methods: {
      openedDialog() {
        if (this.propsItem) {
          this.id = this.propsItem._id;
          this.label = this.propsItem.label;
        } else {
          this.id = null;
          this.label = null;
        }
        this.initialFormSnapshot = this.createFormSnapshot();
        this.discardConfirmVisible = false;
        this.closeAfterDiscardConfirmation = false;
        if (this.v$) this.v$.$reset();
      },
      createFormSnapshot() {
        return JSON.stringify({ label: this.label ?? '' });
      },
      onCancel() {
        if (this.sending) return;
        if (confirmDiscard && this.hasUnsavedChanges) {
          this.discardConfirmVisible = true;
          return;
        }
        this.visible = false;
      },
      confirmDiscard() {
        this.closeAfterDiscardConfirmation = true;
        this.discardConfirmVisible = false;
      },
      cancelDiscard() {
        this.closeAfterDiscardConfirmation = false;
        this.discardConfirmVisible = false;
      },
      handleDiscardConfirmationClosed() {
        if (!this.closeAfterDiscardConfirmation) return;
        this.closeAfterDiscardConfirmation = false;
        this.visible = false;
      },
      async onDone() {
        this.v$.$touch();
        if (this.v$.$invalid || this.sending) return;

        this.sending = true;
        try {
          const lang = normalizeSupportedLocale(
            this.id ? this.propsItem?.lang : this.$store.getters.lang,
            normalizeSupportedLocale(this.$store.getters.lang, 'ja')
          );
          const payloadBase = {
            resource,
            lang,
          };

          if (this.id) {
            await quickTextAPI.updateItem(this.$store.getters.userToken, {
              ...payloadBase,
              id: this.id,
              label: this.label,
            });
            this.$emit('success');
            showSnackbar(this.$store, this.$t('単語を更新しました'), 'status');
          } else {
            await quickTextAPI.createItem(this.$store.getters.userToken, {
              ...payloadBase,
              groupId: this.group._id,
              label: this.label,
            });
            this.$emit('success');
            showSnackbar(this.$store, this.$t('単語を作成しました'), 'status');
          }

          this.visible = false;
        } catch (error) {
          const message = appendApiErrorMessage(
            this.$t('単語の保存に失敗しました'),
            error,
            buildErrorOptions(this, errorWrapper)
          );
          showSnackbar(this.$store, message, 'alert');
          return handleAuthErrorUtil(error, { store: this.$store, router: this.$router });
        } finally {
          this.sending = false;
        }
      },
      closedDialog() {
        if (!this.sending) this.$emit('close');
      },
    },
  };
};
