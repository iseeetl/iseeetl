import { expect } from 'vitest';
import { shallowMount } from '../../helpers/testUtils';
import TagListDialog from '@/components/tag/TagListDialog.vue';

import flushPromises from '../../helpers/flushPromises';

const UiDialogStub = {
  name: 'UiDialog',
  props: [
    'open',
    'titleId',
    'descriptionIds',
    'initialFocus',
    'closeOnEscape',
    'closeOnBackdrop',
  ],
  template:
    '<section><header><slot name="title" /></header><main><slot /></main><footer><slot name="actions" /></footer><aside><slot name="status" /></aside></section>',
};

const UiButtonStub = {
  name: 'UiButton',
  inheritAttrs: false,
  props: {
    disabled: Boolean,
  },
  template: '<button v-bind="$attrs" :disabled="disabled"><slot /></button>',
};

const UiProgressStub = {
  name: 'UiProgress',
  inheritAttrs: false,
  props: ['mode', 'value'],
  template: '<div class="progress" v-bind="$attrs" />',
};

const translate = (key, params = {}) =>
  Object.entries(params).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
    key,
  );

const createApi = (overrides = {}) => ({
  list: () => Promise.resolve({ data: [] }),
  importCsv: () => Promise.resolve({ data: [] }),
  exportCsv: () => Promise.resolve({ data: [{ order: 1, name: 'Tag' }] }),
  reset: () => Promise.resolve({ data: [] }),
  ...overrides,
});

const createConfig = (apiOverrides = {}, overrides = {}) => ({
  scope: 'floor',
  api: createApi(apiOverrides),
  titleId: 'unit_tag_dialog_title',
  titleKey: 'タグ一覧',
  targetLabelKey: '対象フロア',
  resourceLabelKey: 'フロアタグ',
  csvInputId: 'unit_tag_csvupload',
  csvExportDescriptionId: 'unit_tag_csv_export_description',
  csvFilename: 'unit-tags.csv',
  resetDescriptionId: 'unit_tag_reset',
  resetLabelKey: '親タグに戻す',
  resetSuccessKey: '親タグへ戻しました',
  resetFailureKey: '親タグへ戻すのに失敗しました',
  fetchFailureKey: 'タグの取得に失敗しました',
  ...overrides,
});

const createWrapper = (overrides = {}) => {
  const router = (overrides.mocks && overrides.mocks.$router) || { push: () => {} };
  const wrapper = shallowMount(TagListDialog, {
    stubs: {
      UiButton: UiButtonStub,
      UiDialog: UiDialogStub,
      UiIcon: true,
      UiProgress: UiProgressStub,
      DialogTargetContext: false,
      ...(overrides.stubs || {}),
    },
    props: {
      config: overrides.config || createConfig(),
      dialogVisible: true,
      scopeId: 'scope-1',
      scopeName: 'テストフロア',
      ...(overrides.props || {}),
    },
    slots: overrides.slots || {},
    mocks: {
      $store: { dispatch: () => {} },
      $router: router,
      $t: translate,
      $n: (value) => String(value),
      ...(overrides.mocks || {}),
    },
  });
  Object.defineProperty(wrapper.vm, '$router', { value: router, configurable: true });
  return wrapper;
};

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

const makeCsvInputWritable = (wrapper) => {
  Object.defineProperty(wrapper.vm.$refs.csvupload, 'value', {
    configurable: true,
    writable: true,
    value: 'selected.csv',
  });
};

const apiError = (code = 'INVALID_PARAMS', status = 400) => ({
  response: {
    status,
    data: {
      error: { code },
    },
  },
});

describe('タグ一覧ダイアログ', () => {
  let originalGlobals;

  beforeEach(() => {
    originalGlobals = {
      createElement: document.createElement,
      fileReader: global.FileReader,
      hasUrl: Object.prototype.hasOwnProperty.call(global, 'URL'),
      url: global.URL,
      urlCreate: global.URL && global.URL.createObjectURL,
      urlRevoke: global.URL && global.URL.revokeObjectURL,
    };
  });

  afterEach(() => {
    if (originalGlobals.fileReader) {
      global.FileReader = originalGlobals.fileReader;
    } else {
      delete global.FileReader;
    }
    document.createElement = originalGlobals.createElement;
    if (originalGlobals.hasUrl) {
      global.URL = originalGlobals.url;
      if (global.URL) {
        global.URL.createObjectURL = originalGlobals.urlCreate;
        global.URL.revokeObjectURL = originalGlobals.urlRevoke;
      }
    } else {
      delete global.URL;
    }
  });

  it('設定のDOM・ARIA IDを反映しdialogVisibleをopenへ同期する', async () => {
    const config = createConfig();
    const wrapper = createWrapper({ config, props: { dialogVisible: false } });
    const dialog = wrapper.findComponent(UiDialogStub);
    const csvInput = wrapper.find(`#${config.csvInputId}`);
    const importButton = wrapper.find('[data-testid="tag-csv-import-button"]');
    const exportButton = wrapper.find('[data-testid="tag-csv-export-button"]');
    const resetButton = wrapper.find(`button[aria-describedby="${config.resetDescriptionId}"]`);
    const progress = wrapper.findComponent(UiProgressStub);

    expect(dialog.props()).to.include({
      open: false,
      titleId: config.titleId,
      initialFocus: `#${config.titleId}`,
      closeOnEscape: true,
      closeOnBackdrop: true,
    });
    expect(wrapper.find(`#${config.titleId}`).attributes('tabindex')).to.equal('-1');
    expect(wrapper.find(`#${config.titleId}`).text()).to.equal(config.titleKey);
    expect(importButton.exists()).to.equal(true);
    expect(csvInput.attributes('accept')).to.equal('.csv');
    expect(csvInput.classes()).to.include('display-none-input');
    expect(importButton.attributes('aria-describedby')).to.equal(config.csvExportDescriptionId);
    expect(wrapper.findComponent({ name: 'AnalyticsResourceNotice' }).exists()).to.equal(false);
    expect(wrapper.find(`#${config.csvExportDescriptionId}`).exists()).to.equal(true);
    expect(exportButton.exists()).to.equal(true);
    expect(wrapper.find(`#${config.resetDescriptionId}`).text()).to.equal(config.resetLabelKey);
    expect(resetButton.exists()).to.equal(true);
    expect(wrapper.find('.dialog-target-context').text()).to.contain('対象フロア');
    expect(wrapper.find('.dialog-target-context').text()).to.contain('テストフロア');
    expect(dialog.props('descriptionIds')).to.equal(`${config.titleId}_context`);
    expect(wrapper.find('.tag-list-summary').text()).to.contain('全0件');

    const toggles = wrapper.findAll('.tag-tool-toggle');
    expect(toggles).to.have.lengthOf(2);
    expect(toggles.map((toggle) => toggle.text())).to.deep.equal(['CSV入出力', '親タグから再同期']);
    expect(toggles.map((toggle) => toggle.attributes('aria-expanded'))).to.deep.equal(['false', 'false']);
    expect(toggles[0].attributes('aria-controls')).to.equal(`${config.csvInputId}_panel`);
    expect(toggles[1].attributes('aria-controls')).to.equal(`${config.resetDescriptionId}_panel`);

    await toggles[0].trigger('click');
    expect(toggles[0].attributes('aria-expanded')).to.equal('true');
    expect(wrapper.find(`#${config.csvInputId}_panel`).classes()).to.include('is-expanded');

    let inputClickCount = 0;
    wrapper.vm.$refs.csvupload.click = () => {
      inputClickCount += 1;
    };
    await importButton.trigger('click');
    expect(inputClickCount).to.equal(1);
    expect(progress.props()).to.include({ mode: 'indeterminate', value: 0 });
    expect(progress.attributes('aria-labelledby')).to.equal(config.titleId);

    await wrapper.setProps({ dialogVisible: true });
    expect(dialog.props('open')).to.equal(true);
  });

  it('openedで一覧を取得し、GET中もcloseを許可して表示順と翻訳を描画する', async () => {
    const request = createDeferred();
    const calls = [];
    const config = createConfig({
      list: (payload) => {
        calls.push(payload);
        return request.promise;
      },
    });
    const wrapper = createWrapper({ config });
    const dialog = wrapper.findComponent(UiDialogStub);

    dialog.vm.$emit('opened');
    await wrapper.vm.$nextTick();

    expect(calls).to.have.lengthOf(1);
    expect(calls[0]).to.deep.equal({ floor_id: 'scope-1' });
    expect(wrapper.vm.loading).to.equal(true);
    expect(wrapper.vm.sending).to.equal(false);
    expect(dialog.props('closeOnEscape')).to.equal(true);
    expect(dialog.props('closeOnBackdrop')).to.equal(true);
    expect(wrapper.find('.tag-list-state').text()).to.equal('読み込み中です');
    expect(wrapper.find('.tag-list-summary').exists()).to.equal(false);

    request.resolve({
      data: [
        { _id: 't2', order: 2, lang: 'xx', name: 'Second' },
        {
          _id: 't1',
          order: 1,
          lang: 'ja',
          name: 'First',
          translations: [{ lang: 'en', name: 'First translation' }],
        },
      ],
    });
    await flushPromises();

    expect(wrapper.vm.tags.map((tag) => tag._id)).to.deep.equal(['t1', 't2']);
    const desktop = wrapper.find('[data-testid="tag-list-desktop"]');
    const mobile = wrapper.find('[data-testid="tag-list-mobile"]');
    expect(desktop.findAll('thead th').map((header) => header.text())).to.deep.equal([
      '表示順',
      'タグ名・翻訳',
      '操作',
    ]);
    expect(desktop.findAll('tbody > tr')).to.have.lengthOf(2);
    expect(desktop.findAll('tbody > tr')[0].findAll('td')).to.have.lengthOf(3);
    expect(mobile.findAll('.tag-card')).to.have.lengthOf(2);
    expect(desktop.text()).to.contain('日本語:');
    expect(desktop.text()).to.contain('英語:');
    expect(desktop.text()).to.contain('xx:');
    expect(desktop.findAll('[dir="auto"]')).to.have.lengthOf(3);
    expect(mobile.findAll('[dir="auto"]')).to.have.lengthOf(3);

    const desktopActions = desktop.findAll('tbody > tr')[0].findAll('.tag-row-actions button');
    expect(desktopActions.map((button) => button.text())).to.deep.equal(['編集', '削除']);
    expect(desktopActions.map((button) => button.attributes('aria-label'))).to.deep.equal([
      'フロアタグ「First」を編集',
      '「First」を削除します',
    ]);
    const mobileActions = mobile.findAll('.tag-card')[0].findAll('.tag-card__actions button');
    expect(mobileActions.map((button) => button.text())).to.deep.equal(['編集', '削除']);
    expect(desktopActions.map((button) => button.attributes('id'))).to.deep.equal([
      'unit_tag_dialog_title_edit_desktop_t1',
      'unit_tag_dialog_title_delete_desktop_t1',
    ]);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.loading).to.equal(false);
    expect(wrapper.vm.progressAmount).to.equal(0);
  });

  it('一覧取得失敗は設定の文言でalertを表示し認証エラー判定へ渡す', async () => {
    const error = apiError();
    const config = createConfig({ list: () => Promise.reject(error) });
    const wrapper = createWrapper({ config });
    const snackbar = [];
    const authErrors = [];
    wrapper.vm.setSnackbar = (message, role) => snackbar.push({ message, role });
    wrapper.vm.handleAuthError = (receivedError) => authErrors.push(receivedError);

    await wrapper.vm.fetchTags();

    expect(snackbar).to.deep.equal([
      {
        message: 'タグの取得に失敗しました 入力内容が正しくありません。',
        role: 'alert',
      },
    ]);
    expect(authErrors).to.deep.equal([error]);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.progressAmount).to.equal(0);
    expect(wrapper.vm.loadFailed).to.equal(true);
    expect(wrapper.find('.tag-list-state--error').text()).to.contain('再試行');
    expect(wrapper.find('.tag-list-summary').exists()).to.equal(false);
  });

  it('GET中に閉じた後の遅延応答を一覧へ反映しない', async () => {
    const request = createDeferred();
    const wrapper = createWrapper({
      config: createConfig({ list: () => request.promise }),
    });

    const pending = wrapper.vm.fetchTags();
    expect(wrapper.vm.loading).to.equal(true);
    wrapper.vm.onPressCancelButton();
    expect(wrapper.vm.visible).to.equal(false);

    request.resolve({ data: [{ _id: 'stale-tag', order: 1 }] });
    await pending;

    expect(wrapper.vm.tags).to.deep.equal([]);
  });

  it('401の一覧取得失敗はログアウトしてログイン画面へ遷移する', async () => {
    const dispatchCalls = [];
    const pushCalls = [];
    const config = createConfig({ list: () => Promise.reject(apiError('UNAUTHORIZED', 401)) });
    const wrapper = createWrapper({
      config,
      mocks: {
        $store: { dispatch: (type) => dispatchCalls.push(type) },
        $router: { push: (location) => pushCalls.push(location) },
        $t: (key) => key,
      },
    });
    const snackbar = [];
    wrapper.vm.setSnackbar = (message, role) => snackbar.push({ message, role });

    await wrapper.vm.fetchTags();

    expect(snackbar[0]).to.deep.equal({
      message: 'タグの取得に失敗しました ログインが必要です',
      role: 'alert',
    });
    expect(dispatchCalls).to.deep.equal(['doLogout']);
    expect(pushCalls).to.deep.equal([{ name: 'Login' }]);
  });

  it('create・update・deleteは一覧を保持したまま共通イベントへ変換し、close後だけ解放する', async () => {
    const wrapper = createWrapper();
    const tag = { _id: 'tag-1' };
    const event = { type: 'click' };

    wrapper.vm.tags = [tag];
    wrapper.vm.onPressCreateButton(event);
    expect(wrapper.emitted().create[0]).to.deep.equal([event]);
    expect(wrapper.vm.tags).to.deep.equal([tag]);

    wrapper.vm.tags = [tag];
    wrapper.vm.onPressUpdateButton(event, tag);
    expect(wrapper.emitted().update[0]).to.deep.equal([event, tag]);
    expect(wrapper.vm.tags).to.deep.equal([tag]);

    wrapper.vm.tags = [tag];
    wrapper.vm.onPressDeleteButton(event, tag);
    expect(wrapper.emitted().delete[0]).to.deep.equal([tag, event]);
    expect(wrapper.vm.tags).to.deep.equal([tag]);

    wrapper.vm.tags = [tag];
    wrapper.findComponent(UiDialogStub).vm.$emit('request-close', { reason: 'backdrop' });
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.visible).to.equal(false);
    wrapper.findComponent(UiDialogStub).vm.$emit('closed');
    expect(wrapper.emitted().close).to.have.lengthOf(1);
    expect(wrapper.vm.tags).to.deep.equal([]);
  });

  it('編集画面では同じダイアログ内でタイトル・戻る・確定イベントを切り替える', async () => {
    const wrapper = createWrapper({
      props: {
        screen: 'editor',
        editorTitle: 'タグを編集',
        editorSubmitLabel: '保存',
      },
      slots: {
        editor: '<input data-testid="editor-field" />',
      },
    });

    expect(wrapper.get('#unit_tag_dialog_title').text()).to.equal('タグを編集');
    expect(wrapper.find('[data-testid="tag-list-screen"]').isVisible()).to.equal(false);
    expect(wrapper.get('[data-testid="tag-editor-screen"]').isVisible()).to.equal(true);
    expect(wrapper.get('[data-testid="editor-field"]').exists()).to.equal(true);
    expect(wrapper.get('#unit_tag_dialog_title_submit_desktop').text()).to.equal('保存');

    wrapper.vm.onRequestClose();
    wrapper.vm.onPressSubmitButton();
    expect(wrapper.emitted().back).to.deep.equal([[]]);
    expect(wrapper.emitted().submit).to.deep.equal([[]]);
    expect(wrapper.vm.visible).to.equal(true);
  });

  it('一覧の閉じるボタンは既定で左寄せにし、指定時だけ右寄せにする', async () => {
    const wrapper = createWrapper();

    expect(wrapper.get('footer .common-dialog-actions').classes()).to.include(
      'common-dialog-actions__start',
    );

    await wrapper.setProps({ listCloseEndAligned: true });

    expect(wrapper.get('footer .common-dialog-actions').classes()).not.to.include(
      'common-dialog-actions__start',
    );
  });

  it('sending中はclose・CRUD イベント・API操作を拒否し操作部品を無効にする', async () => {
    const apiCalls = [];
    const config = createConfig({
      list: () => apiCalls.push('list'),
      importCsv: () => apiCalls.push('importCsv'),
      exportCsv: () => apiCalls.push('exportCsv'),
      reset: () => apiCalls.push('reset'),
    });
    const wrapper = createWrapper({ config });
    const tag = { _id: 'tag-1' };
    const event = { type: 'click' };
    let inputClickCount = 0;
    wrapper.vm.$refs.csvupload.click = () => {
      inputClickCount += 1;
    };
    await wrapper.setData({ sending: true, tags: [tag], visible: true });

    wrapper.vm.onPressCancelButton();
    wrapper.vm.onPressCreateButton(event);
    wrapper.vm.onPressUpdateButton(event, tag);
    wrapper.vm.onPressDeleteButton(tag);
    await wrapper.vm.fetchTags();
    await wrapper.vm.onPressOutputButton();
    await wrapper.vm.onPressInitialButton();
    wrapper.vm.onPressCsvSelectButton();
    await wrapper.vm.handleCsvFileLoaded({ target: { result: '1,Tag\n' } });
    wrapper.vm.closedDialog();

    expect(wrapper.vm.visible).to.equal(true);
    expect(wrapper.emitted().create).to.equal(undefined);
    expect(wrapper.emitted().update).to.equal(undefined);
    expect(wrapper.emitted().delete).to.equal(undefined);
    expect(wrapper.emitted().close).to.equal(undefined);
    expect(apiCalls).to.deep.equal([]);
    expect(inputClickCount).to.equal(0);
    expect(wrapper.findComponent(UiDialogStub).props()).to.include({
      closeOnEscape: false,
      closeOnBackdrop: false,
    });
    expect(wrapper.findAllComponents(UiButtonStub).every((button) => button.props('disabled'))).to.equal(true);
    expect(wrapper.findAll('.tag-tool-toggle').every((button) => button.attributes('disabled') !== undefined)).to.equal(true);
    expect(wrapper.find(`#${config.csvInputId}`).attributes('disabled')).to.be.a('string');
  });

  it('不正なCSVはAPIへ送らず入力をクリアしてalertを表示する', async () => {
    class InvalidCsvReader {
      readAsText() {
        setTimeout(() => this.onload && this.onload({ target: { result: 'invalid,csv,row\n' } }), 0);
      }
    }
    global.FileReader = InvalidCsvReader;
    const importCalls = [];
    const config = createConfig({ importCsv: (...args) => importCalls.push(args) });
    const wrapper = createWrapper({ config });
    const snackbar = [];
    makeCsvInputWritable(wrapper);
    wrapper.vm.setSnackbar = (message, role) => snackbar.push({ message, role });

    wrapper.vm.onFileChange({ target: { files: [new Blob(['invalid'])] } });
    await flushPromises();

    expect(importCalls).to.deep.equal([]);
    expect(wrapper.vm.$refs.csvupload.value).to.equal('');
    expect(snackbar).to.deep.equal([
      { message: 'CSVファイルのインポートに失敗しました', role: 'alert' },
    ]);
  });

  it('CSV FileReader失敗は入力をクリアしてalertを表示する', async () => {
    class FailedCsvReader {
      readAsText() {
        setTimeout(() => this.onerror && this.onerror(), 0);
      }
    }
    global.FileReader = FailedCsvReader;
    const wrapper = createWrapper();
    const snackbar = [];
    makeCsvInputWritable(wrapper);
    wrapper.vm.setSnackbar = (message, role) => snackbar.push({ message, role });

    wrapper.vm.onFileChange({ target: { files: [new Blob(['csv'])] } });
    await flushPromises();

    expect(wrapper.vm.$refs.csvupload.value).to.equal('');
    expect(snackbar).to.deep.equal([
      { message: 'CSVファイルの読み込みに失敗しました', role: 'alert' },
    ]);
  });

  it('CSV取込では対象範囲と行データを送り、一覧・進捗・入力を更新する', async () => {
    class ValidCsvReader {
      readAsText() {
        setTimeout(() => this.onload && this.onload({ target: { result: '2,Second\n1,First\n' } }), 0);
      }
    }
    global.FileReader = ValidCsvReader;
    const calls = [];
    const config = createConfig({
      importCsv: (payload, options) => {
        calls.push({ options, payload });
        return Promise.resolve({
          data: [
            { _id: 't2', order: 2 },
            { _id: 't1', order: 1 },
          ],
        });
      },
    });
    const wrapper = createWrapper({ config });
    const snackbar = [];
    makeCsvInputWritable(wrapper);
    wrapper.vm.setSnackbar = (message, role) => snackbar.push({ message, role });

    wrapper.vm.onFileChange({ target: { files: [new Blob(['csv'])] } });
    await flushPromises();
    await flushPromises();

    expect(calls).to.have.lengthOf(1);
    expect(calls[0].payload).to.deep.equal({
      floor_id: 'scope-1',
      csv: [
        [2, 'Second'],
        [1, 'First'],
      ],
    });
    expect(calls[0].options.onUploadProgress).to.be.a('function');
    expect(wrapper.vm.tags.map((tag) => tag._id)).to.deep.equal(['t1', 't2']);
    expect(wrapper.vm.$refs.csvupload.value).to.equal('');
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.progressAmount).to.equal(0);
    expect(snackbar).to.deep.equal([
      { message: 'CSVファイルをインポートしました', role: 'status' },
    ]);
  });

  it('CSVインポートAPI失敗は共通文言でalertを表示し入力を必ずクリアする', async () => {
    const error = apiError();
    const config = createConfig({ importCsv: () => Promise.reject(error) });
    const wrapper = createWrapper({ config });
    const snackbar = [];
    const authErrors = [];
    makeCsvInputWritable(wrapper);
    wrapper.vm.setSnackbar = (message, role) => snackbar.push({ message, role });
    wrapper.vm.handleAuthError = (receivedError) => authErrors.push(receivedError);

    await wrapper.vm.handleCsvFileLoaded({ target: { result: '1,Tag\n' } });

    expect(snackbar).to.deep.equal([
      {
        message: 'CSVファイルのインポートに失敗しました 入力内容が正しくありません。',
        role: 'alert',
      },
    ]);
    expect(authErrors).to.deep.equal([error]);
    expect(wrapper.vm.$refs.csvupload.value).to.equal('');
    expect(wrapper.vm.sending).to.equal(false);
  });

  it('CSV出力では対象範囲を送り、設定されたファイル名でダウンロードする', async () => {
    const calls = [];
    const config = createConfig({
      exportCsv: (payload, options) => {
        calls.push({ options, payload });
        return Promise.resolve({
          data: [
            { order: 2, name: 'Second' },
            { order: 1, name: 'First' },
          ],
        });
      },
    });
    const wrapper = createWrapper({ config });
    if (!global.URL) global.URL = {};
    const objectUrls = [];
    const revokedUrls = [];
    global.URL.createObjectURL = () => {
      const url = 'blob:tag-list-unit';
      objectUrls.push(url);
      return url;
    };
    global.URL.revokeObjectURL = (url) => revokedUrls.push(url);

    let link;
    document.createElement = (tagName, options) => {
      if (tagName === 'a') {
        link = {
          clickCount: 0,
          download: '',
          href: '',
          click() {
            this.clickCount += 1;
          },
        };
        return link;
      }
      return originalGlobals.createElement.call(document, tagName, options);
    };

    await wrapper.vm.onPressOutputButton();

    expect(calls).to.have.lengthOf(1);
    expect(calls[0].payload).to.deep.equal({ floor_id: 'scope-1' });
    expect(calls[0].options.onUploadProgress).to.be.a('function');
    expect(link.download).to.equal(config.csvFilename);
    expect(link.href).to.equal('blob:tag-list-unit');
    expect(link.clickCount).to.equal(1);
    expect(objectUrls).to.deep.equal(['blob:tag-list-unit']);
    expect(revokedUrls).to.deep.equal(['blob:tag-list-unit']);
    expect(wrapper.vm.sending).to.equal(false);
  });

  it('CSVエクスポート結果が空ならダウンロードせずalertを表示する', async () => {
    const config = createConfig({ exportCsv: () => Promise.resolve({ data: [] }) });
    const wrapper = createWrapper({ config });
    const snackbar = [];
    const authErrors = [];
    wrapper.vm.setSnackbar = (message, role) => snackbar.push({ message, role });
    wrapper.vm.handleAuthError = (error) => authErrors.push(error);

    await wrapper.vm.onPressOutputButton();

    expect(snackbar).to.deep.equal([
      {
        message: 'CSVファイルのエクスポートに失敗しました 処理に失敗しました',
        role: 'alert',
      },
    ]);
    expect(authErrors).to.have.lengthOf(1);
    expect(authErrors[0].message).to.equal('data not found');
    expect(wrapper.vm.sending).to.equal(false);
  });

  it('リセット成功時は対象範囲を送信して一覧と成功メッセージを更新する', async () => {
    const calls = [];
    const config = createConfig({
      reset: (payload, options) => {
        calls.push({ options, payload });
        return Promise.resolve({
          data: [
            { _id: 't2', order: 2 },
            { _id: 't1', order: 1 },
          ],
        });
      },
    });
    const wrapper = createWrapper({ config });
    const snackbar = [];
    wrapper.vm.setSnackbar = (message, role) => snackbar.push({ message, role });

    await wrapper.vm.onPressInitialButton();

    expect(calls).to.have.lengthOf(1);
    expect(calls[0].payload).to.deep.equal({ floor_id: 'scope-1' });
    expect(calls[0].options.onUploadProgress).to.be.a('function');
    expect(wrapper.vm.tags.map((tag) => tag._id)).to.deep.equal(['t1', 't2']);
    expect(snackbar).to.deep.equal([{ message: '親タグへ戻しました', role: 'status' }]);
    expect(wrapper.vm.sending).to.equal(false);
  });

  it('reset失敗は設定の失敗文言でalertを表示し認証エラー判定へ渡す', async () => {
    const error = apiError();
    const config = createConfig({ reset: () => Promise.reject(error) });
    const wrapper = createWrapper({ config });
    const snackbar = [];
    const authErrors = [];
    wrapper.vm.setSnackbar = (message, role) => snackbar.push({ message, role });
    wrapper.vm.handleAuthError = (receivedError) => authErrors.push(receivedError);

    await wrapper.vm.onPressInitialButton();

    expect(snackbar).to.deep.equal([
      {
        message: '親タグへ戻すのに失敗しました 入力内容が正しくありません。',
        role: 'alert',
      },
    ]);
    expect(authErrors).to.deep.equal([error]);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.vm.progressAmount).to.equal(0);
  });
});
