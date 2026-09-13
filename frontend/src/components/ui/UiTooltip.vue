<template>
  <span ref="anchor" class="ui-tooltip__anchor">
    <slot />
  </span>
</template>

<script>
import { useId } from 'vue';
import { getTopPanel, subscribeStackChange } from './overlayStack';

const DESCRIPTION_SEPARATOR = /\s+/;
const VIEWPORT_MARGIN = 8;
const HIDE_DELAY = 100;
const PLACEMENTS = ['top', 'bottom'];

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

export default {
  name: 'UiTooltip',
  props: {
    text: {
      type: String,
      required: true,
    },
    disabled: {
      type: Boolean,
      default: false,
    },
    placement: {
      type: String,
      default: 'bottom',
      validator: (value) => PLACEMENTS.includes(value),
    },
  },
  setup() {
    return {
      tooltipId: `ui-tooltip-${useId()}`,
    };
  },
  data() {
    return {
      tooltipElement: null,
      triggerElement: null,
      triggerHovered: false,
      tooltipHovered: false,
      triggerFocused: false,
      escapeSuppressed: false,
      suppressNextFocusDisplay: false,
      invalidSlotWarningActive: false,
      hideTimerId: null,
      positionFrameId: null,
      visibilityListenersActive: false,
      unsubscribeStackChange: null,
    };
  },
  watch: {
    text(value) {
      if (!this.tooltipElement) return;
      this.tooltipElement.textContent = value;
      if (!this.tooltipElement.hidden) this.schedulePosition();
    },
    disabled(value) {
      if (!this.triggerElement) return;

      if (value) {
        this.hideTooltip();
        this.removeDescription(this.triggerElement);
      } else {
        this.addDescription(this.triggerElement);
      }
    },
    placement() {
      if (this.tooltipElement && !this.tooltipElement.hidden) this.schedulePosition();
    },
  },
  mounted() {
    this.createTooltipElement();
    this.syncTrigger();
    this.$refs.anchor.addEventListener('ui-dialog-restore-focus', this.onDialogRestoreFocus);
    this.unsubscribeStackChange = subscribeStackChange(this.onStackChange);
  },
  updated() {
    this.syncTrigger();
  },
  beforeUnmount() {
    this.hideTooltip();
    this.detachTrigger();
    this.$refs.anchor.removeEventListener('ui-dialog-restore-focus', this.onDialogRestoreFocus);

    if (this.unsubscribeStackChange) {
      this.unsubscribeStackChange();
      this.unsubscribeStackChange = null;
    }

    if (this.tooltipElement) {
      this.tooltipElement.removeEventListener('mouseenter', this.onTooltipMouseenter);
      this.tooltipElement.removeEventListener('mouseleave', this.onTooltipMouseleave);
      this.tooltipElement.remove();
      this.tooltipElement = null;
    }
  },
  methods: {
    warn(message) {
      if (!import.meta.env.PROD) {
        console.warn(`[UiTooltip] ${message}`);
      }
    },
    createTooltipElement() {
      const tooltip = document.createElement('div');
      tooltip.id = this.tooltipId;
      tooltip.className = 'ui-tooltip';
      tooltip.setAttribute('role', 'tooltip');
      tooltip.textContent = this.text;
      tooltip.hidden = true;
      tooltip.addEventListener('mouseenter', this.onTooltipMouseenter);
      tooltip.addEventListener('mouseleave', this.onTooltipMouseleave);
      document.body.appendChild(tooltip);
      this.tooltipElement = tooltip;
    },
    syncTrigger() {
      const children = Array.from(this.$refs.anchor.children);
      if (children.length !== 1) {
        if (!this.invalidSlotWarningActive) {
          this.warn('default slot must contain exactly one direct element.');
          this.invalidSlotWarningActive = true;
        }
        this.detachTrigger();
        this.hideTooltip();
        return;
      }

      this.invalidSlotWarningActive = false;
      const nextTrigger = children[0];
      if (nextTrigger === this.triggerElement) {
        if (this.disabled) {
          this.removeDescription(nextTrigger);
        } else {
          this.addDescription(nextTrigger);
        }
        return;
      }

      this.hideTooltip();
      this.detachTrigger();
      this.triggerElement = nextTrigger;
      this.triggerElement.addEventListener('mouseenter', this.onTriggerMouseenter);
      this.triggerElement.addEventListener('mouseleave', this.onTriggerMouseleave);
      this.triggerElement.addEventListener('focus', this.onTriggerFocus);
      this.triggerElement.addEventListener('blur', this.onTriggerBlur);
      if (!this.disabled) this.addDescription(this.triggerElement);
    },
    detachTrigger() {
      if (!this.triggerElement) return;

      this.triggerElement.removeEventListener('mouseenter', this.onTriggerMouseenter);
      this.triggerElement.removeEventListener('mouseleave', this.onTriggerMouseleave);
      this.triggerElement.removeEventListener('focus', this.onTriggerFocus);
      this.triggerElement.removeEventListener('blur', this.onTriggerBlur);
      this.removeDescription(this.triggerElement);
      this.triggerElement = null;
      this.triggerHovered = false;
      this.tooltipHovered = false;
      this.triggerFocused = false;
      this.escapeSuppressed = false;
      this.suppressNextFocusDisplay = false;
    },
    getDescriptionIds(element) {
      const value = element.getAttribute('aria-describedby');
      return value && value.trim() ? value.trim().split(DESCRIPTION_SEPARATOR) : [];
    },
    addDescription(element) {
      const ids = this.getDescriptionIds(element);
      if (!ids.includes(this.tooltipId)) ids.push(this.tooltipId);
      element.setAttribute('aria-describedby', ids.join(' '));
    },
    removeDescription(element) {
      const ids = this.getDescriptionIds(element).filter((id) => id !== this.tooltipId);
      if (ids.length) {
        element.setAttribute('aria-describedby', ids.join(' '));
      } else {
        element.removeAttribute('aria-describedby');
      }
    },
    hoverIsAvailable() {
      return Boolean(window.matchMedia && window.matchMedia('(hover: hover)').matches);
    },
    interactionIsActive() {
      return this.triggerHovered || this.tooltipHovered || this.triggerFocused;
    },
    resetEscapeSuppressionWhenInactive() {
      if (!this.interactionIsActive()) this.escapeSuppressed = false;
    },
    onTriggerMouseenter() {
      if (!this.hoverIsAvailable()) return;
      this.triggerHovered = true;
      this.cancelHideTimer();
      this.showTooltip();
    },
    onTriggerMouseleave() {
      this.triggerHovered = false;
      this.resetEscapeSuppressionWhenInactive();
      this.scheduleHide();
    },
    onTriggerFocus() {
      this.triggerFocused = true;
      this.cancelHideTimer();

      if (this.suppressNextFocusDisplay) {
        this.suppressNextFocusDisplay = false;
        return;
      }
      this.showTooltip();
    },
    onTriggerBlur() {
      this.triggerFocused = false;
      this.resetEscapeSuppressionWhenInactive();
      this.scheduleHide();
    },
    onDialogRestoreFocus(event) {
      if (event.target !== this.triggerElement) return;
      event.preventDefault();
      this.focusTrigger();
    },
    onTooltipMouseenter() {
      if (!this.hoverIsAvailable()) return;
      this.tooltipHovered = true;
      this.cancelHideTimer();
    },
    onTooltipMouseleave() {
      this.tooltipHovered = false;
      this.resetEscapeSuppressionWhenInactive();
      this.scheduleHide();
    },
    triggerIsAllowedByStack() {
      const topPanel = getTopPanel();
      if (!topPanel) return true;
      return topPanel.contains(this.triggerElement);
    },
    showTooltip() {
      if (
        this.disabled ||
        !this.triggerElement ||
        !this.tooltipElement ||
        this.escapeSuppressed ||
        !this.triggerIsAllowedByStack()
      ) {
        return;
      }

      this.cancelHideTimer();
      const topPanel = getTopPanel();
      if (topPanel && topPanel.contains(this.triggerElement)) {
        topPanel.appendChild(this.tooltipElement);
      } else {
        document.body.appendChild(this.tooltipElement);
      }
      this.tooltipElement.hidden = false;
      this.addVisibilityListeners();
      this.positionTooltip();
    },
    hideTooltip() {
      this.cancelHideTimer();
      this.cancelPositionFrame();
      this.removeVisibilityListeners();
      if (!this.tooltipElement) return;

      this.tooltipElement.hidden = true;
      if (this.tooltipElement.parentElement !== document.body) {
        document.body.appendChild(this.tooltipElement);
      }
    },
    scheduleHide() {
      this.cancelHideTimer();
      if (this.interactionIsActive()) return;

      this.hideTimerId = window.setTimeout(() => {
        this.hideTimerId = null;
        if (!this.interactionIsActive()) this.hideTooltip();
      }, HIDE_DELAY);
    },
    cancelHideTimer() {
      if (this.hideTimerId === null) return;
      window.clearTimeout(this.hideTimerId);
      this.hideTimerId = null;
    },
    onWindowKeydown(event) {
      if (event.key !== 'Escape' || !this.tooltipElement || this.tooltipElement.hidden) {
        return;
      }

      this.escapeSuppressed = true;
      this.tooltipHovered = false;
      this.hideTooltip();
      event.preventDefault();
      event.stopPropagation();
    },
    addVisibilityListeners() {
      if (this.visibilityListenersActive) return;
      window.addEventListener('resize', this.schedulePosition);
      window.addEventListener('scroll', this.schedulePosition, true);
      window.addEventListener('keydown', this.onWindowKeydown, true);
      this.visibilityListenersActive = true;
    },
    removeVisibilityListeners() {
      if (!this.visibilityListenersActive) return;
      window.removeEventListener('resize', this.schedulePosition);
      window.removeEventListener('scroll', this.schedulePosition, true);
      window.removeEventListener('keydown', this.onWindowKeydown, true);
      this.visibilityListenersActive = false;
    },
    schedulePosition() {
      if (!this.tooltipElement || this.tooltipElement.hidden || this.positionFrameId !== null) {
        return;
      }

      this.positionFrameId = window.requestAnimationFrame(() => {
        this.positionFrameId = null;
        if (this.tooltipElement && !this.tooltipElement.hidden) {
          this.positionTooltip();
        }
      });
    },
    cancelPositionFrame() {
      if (this.positionFrameId === null) return;
      window.cancelAnimationFrame(this.positionFrameId);
      this.positionFrameId = null;
    },
    positionTooltip() {
      if (!this.triggerElement || !this.tooltipElement) return;

      const triggerRect = this.triggerElement.getBoundingClientRect();
      const tooltipRect = this.tooltipElement.getBoundingClientRect();
      let left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
      const topPosition = triggerRect.top - tooltipRect.height - VIEWPORT_MARGIN;
      const bottomPosition = triggerRect.bottom + VIEWPORT_MARGIN;
      const topFits = topPosition >= VIEWPORT_MARGIN;
      const bottomFits = bottomPosition + tooltipRect.height <= window.innerHeight - VIEWPORT_MARGIN;
      let top;

      if (this.placement === 'top') {
        top = topFits || !bottomFits ? topPosition : bottomPosition;
      } else {
        top = bottomFits || !topFits ? bottomPosition : topPosition;
      }

      left = clamp(left, VIEWPORT_MARGIN, window.innerWidth - tooltipRect.width - VIEWPORT_MARGIN);
      top = clamp(top, VIEWPORT_MARGIN, window.innerHeight - tooltipRect.height - VIEWPORT_MARGIN);

      this.tooltipElement.style.left = `${left}px`;
      this.tooltipElement.style.top = `${top}px`;
    },
    onStackChange({ topPanel }) {
      if (!this.tooltipElement || this.tooltipElement.hidden) return;

      if (topPanel && !topPanel.contains(this.triggerElement)) {
        this.hideTooltip();
        return;
      }
      if (!topPanel && this.triggerElement && this.triggerElement.closest('.ui-dialog__panel')) {
        this.hideTooltip();
        return;
      }

      if (topPanel) {
        topPanel.appendChild(this.tooltipElement);
      } else {
        document.body.appendChild(this.tooltipElement);
      }
      this.schedulePosition();
    },
    focusTrigger({ showTooltip = false, preventScroll = true } = {}) {
      if (!this.triggerElement || typeof this.triggerElement.focus !== 'function') {
        return;
      }

      this.suppressNextFocusDisplay = !showTooltip;
      try {
        this.triggerElement.focus({ preventScroll });
      } catch {
        this.triggerElement.focus();
      }

      if (this.suppressNextFocusDisplay) {
        this.suppressNextFocusDisplay = false;
      }
      if (showTooltip) this.showTooltip();
    },
  },
};
</script>
