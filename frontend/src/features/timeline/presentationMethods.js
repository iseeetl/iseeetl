import { LANGUAGES } from '@/constants/languages';
import TranslationUtil from '@/utils/translationUtil';
import {
  queueUpdateAnimationObserver as queueAnimationObserver,
  resetDisabledAnimations as resetObservedAnimations,
  setupAnimationObserver as setupObserver,
  toggleAnimation as toggleObservedAnimation,
} from '@/features/timeline/observers';

const VALID_LANGUAGE_VALUES = new Set(LANGUAGES.map((language) => language.value));

export const timelinePresentationMethods = {
  getPresentationQueryLanguage(query = {}) {
    const requestedLanguage = typeof query.lang === 'string' ? query.lang : null;
    return VALID_LANGUAGE_VALUES.has(requestedLanguage) ? requestedLanguage : null;
  },
  applyEyeFriendlyPreference(query = {}) {
    const eyeFriendlyMode = query.eyeFriendlyMode === 'on' || this.$store.getters.userEyeFriendlyMode;
    this.ui.localFontSize = eyeFriendlyMode ? '20px' : null;
    this.ui.localEnableTextAnimation = !eyeFriendlyMode;
  },
  applyPresentationQuery(query = {}) {
    const requestedLanguage = this.getPresentationQueryLanguage(query);
    this.$i18n.locale = requestedLanguage || this.$store.getters.lang || this.$i18n.locale;
    this.ui.hideReply = query.reply === 'no';
    this.ui.hideInfo = query.info === 'no';
    this.applyEyeFriendlyPreference(query);
  },
  setTargetLangs() {
    const floorTargetLangs = Array.isArray(this.$store.getters.floorTargetLangs)
      ? this.$store.getters.floorTargetLangs
      : [];
    const roomLanguages = Array.isArray(this.room?.status?.languages) ? this.room.status.languages : [];
    const uniqueLangs = [...new Set([...floorTargetLangs, ...roomLanguages])];
    this.timeline.targetLangs = uniqueLangs.filter((language) => language !== this.$i18n.locale);
  },
  checkMobile() {
    this.ui.windowWidth = window.innerWidth;
    this.$nextTick(() => this.timeline.filters.forEach((_, index) => this.reevaluateAutoLoad(index)));
  },
  getTranslatedTitle(data) {
    return TranslationUtil.getTitle(data, this.$i18n.locale);
  },
  getTranslatedDescription(data) {
    return TranslationUtil.getDescription(data, this.$i18n.locale);
  },
  getTranslatedTagName(tagId) {
    return TranslationUtil.getTranslatedTagName(tagId, this.room.tags, this.$i18n.locale);
  },
  queueUpdateAnimationObserver() {
    return queueAnimationObserver(this);
  },
  setupAnimationObserver() {
    return setupObserver(this);
  },
  getAnimationDuration(speedKey) {
    switch (speedKey) {
      case 'slow':
        return 18_000;
      case 'fast':
        return 6_000;
      case 'very_fast':
        return 3_000;
      default:
        return 12_000;
    }
  },
  toggleAnimation(animationElement) {
    return toggleObservedAnimation(this, animationElement);
  },
  resetDisabledAnimations() {
    return resetObservedAnimations(this);
  },
  closeTimelineSettingDialog() {
    Object.assign(this.dialogs.settings, { visible: false, operationToken: null });
  },
  toggleColumnSpeech(index) {
    const target = this.timeline.filters[index];
    if (typeof target.speech === 'undefined') target.speech = false;
    if (!target.speech) {
      this.ui.audio.speechColumnIndex = index;
      this.showSpeechDialog();
      return;
    }
    target.speech = false;
    this.persistFilters();
  },
};
