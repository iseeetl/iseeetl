export const quickTextDialogStubs = {
  BaseEditDialog: {
    name: 'BaseEditDialog',
    inheritAttrs: false,
    emits: ['cancel', 'closed', 'confirm', 'opened', 'update:visible'],
    props: {
      visible: Boolean,
      sending: Boolean,
      titleId: String,
      titleText: String,
      descriptionIds: String,
      cancelLabel: String,
      confirmLabel: String,
      cancelTestId: String,
      confirmTestId: String,
      actionsAdjacent: Boolean,
      initialFocus: String,
      progressMode: String,
    },
    template:
      '<section v-bind="$attrs"><h2 :id="titleId">{{ titleText }}</h2><main><slot/></main></section>',
  },
  DialogTargetContext: {
    name: 'DialogTargetContext',
    props: {
      contextId: String,
      label: String,
      name: String,
    },
    template: '<section :id="contextId"><strong>{{ label }}</strong><span>{{ name }}</span></section>',
  },
  UiDialog: {
    name: 'UiDialog',
    props: {
      open: Boolean,
      titleId: String,
      closeOnEscape: Boolean,
      closeOnBackdrop: Boolean,
      initialFocus: String,
    },
    template:
      '<section><header><slot name="title"/></header><main><slot/></main><footer><slot name="actions"/></footer><slot name="status"/></section>',
  },
  UiField: {
    name: 'UiField',
    props: {
      controlId: String,
      label: String,
      invalid: Boolean,
      error: String,
    },
    computed: {
      controlAttrs() {
        return { id: this.controlId };
      },
    },
    template: '<div><slot :control-attrs="controlAttrs"/></div>',
  },
  UiButton: {
    name: 'UiButton',
    props: {
      appearance: String,
      tone: String,
      iconOnly: Boolean,
    },
    template: '<button v-bind="$attrs"><slot/></button>',
  },
  UiIcon: {
    name: 'UiIcon',
    template: '<span />',
  },
  UiProgress: {
    name: 'UiProgress',
    props: {
      mode: String,
    },
    template: '<div />',
  },
};
