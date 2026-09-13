const {
  prepareTimelineRoom,
  submitPost,
  buildPostXpath,
  waitForPostVisibleByXpath,
  clickFirstVisible,
  waitForDialogClosed,
} = require('../../helpers/timeline-helpers');
const { assertAccessibilityIntegrity } = require('../../helpers/accessibility');
const { assertMobileActionLayout } = require('../../helpers/mobile-tab-layout');
const { sendKeysToActiveElement, clickSingleVisibleAfterExactControls } = require('../../helpers/dialog-focus');

const sendMobileTabKey = (browser, key, label) => {
  browser.perform((done) => {
    sendKeysToActiveElement(browser, key, (state) => {
      browser.assert.ok(state.ok, `${label}: ${state.reason || 'W3Cのキー操作が完了しました'}`);
      done();
    });
  });
};

const assertFilterDialogRadioGroups = (browser) => {
  browser.execute(
    function () {
      const dialog = document.querySelector('[data-testid="dialog-filter"]');
      const radios = dialog ? Array.from(dialog.querySelectorAll('input[type="radio"]')) : [];
      const names = Array.from(new Set(radios.map((radio) => radio.name).filter(Boolean)));
      const groups = names.map((name) => {
        const members = radios.filter((radio) => radio.name === name);
        const fieldsets = Array.from(new Set(members.map((radio) => radio.closest('fieldset')).filter(Boolean)));
        const legend = fieldsets.length === 1 ? fieldsets[0].querySelector('legend') : null;
        return {
          name,
          memberCount: members.length,
          fieldsetCount: fieldsets.length,
          legend: legend ? legend.textContent.trim() : '',
        };
      });
      return { dialogFound: !!dialog, groups };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { dialogFound: false, groups: [] };
      browser.assert.ok(state.dialogFound, '意味構造の検証用にフィルタダイアログを表示しました。');
      browser.assert.equal(state.groups.length, 4, 'フィルタダイアログに名前付きのラジオボタングループが4件あります。');
      browser.assert.ok(
        state.groups.every((group) => group.memberCount >= 2 && group.fieldsetCount === 1 && !!group.legend),
        `各フィルタのラジオボタングループにfieldsetとlegendが1件ずつあります: ${JSON.stringify(state.groups)}`
      );
    }
  );
};

const assertTimelineHeadingSemantics = (browser) => {
  browser.execute(
    function () {
      const headings = Array.from(document.querySelectorAll('.timeline-inner h2.filter-timeline-title'));
      return {
        count: headings.length,
        invalid: headings
          .filter((heading) => heading.hasAttribute('role') || heading.hasAttribute('tabindex'))
          .map((heading) => ({ id: heading.id, role: heading.getAttribute('role'), tabindex: heading.tabIndex })),
      };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { count: 0, invalid: [] };
      browser.assert.ok(state.count > 0, 'タイムラインの列見出しが表示されています。');
      browser.assert.deepEqual(state.invalid, [], 'タイムラインの列のh2要素は、見出しとしての意味だけを持ちます。');
    }
  );
};

const assertMobileTabs = (browser, expectedActiveIndex, label, expectedFocus = 'tab') => {
  browser.execute(
    function (activeIndex, focusExpectation) {
      const tablist = document.querySelector('#smartphone-tab-menu[role="tablist"]');
      const buttons = tablist ? Array.from(tablist.querySelectorAll('button')) : [];
      const tabs = buttons.filter((button) => button.getAttribute('role') === 'tab');
      const selected = tabs
        .map((tab, index) => (tab.getAttribute('aria-selected') === 'true' ? index : -1))
        .filter((index) => index >= 0);
      const controlStates = tabs.map((tab, index) => {
        const id = tab.getAttribute('aria-controls') || '';
        const panels = id
          ? Array.from(document.querySelectorAll('[id]')).filter((element) => element.id === id)
          : [];
        const panel = panels[0] || null;
        return {
          index,
          id,
          count: panels.length,
          hidden: panel ? panel.hasAttribute('hidden') : null,
        };
      });
      const actionGroup = document.querySelector('.active-tab-actions[role="group"]');
      const actionButtons = actionGroup ? Array.from(actionGroup.querySelectorAll('button')) : [];
      const focusedTabIndex = tabs.indexOf(document.activeElement);
      return {
        tablistFound: !!tablist,
        buttonCount: buttons.length,
        tabCount: tabs.length,
        selected,
        controlStates,
        actionGroupFound: !!actionGroup,
        actionButtonCount: actionButtons.length,
        focusMatches:
          focusExpectation === 'tab'
            ? focusedTabIndex === activeIndex
            : actionButtons.includes(document.activeElement) && focusedTabIndex === -1,
      };
    },
    [expectedActiveIndex, expectedFocus],
    (result) => {
      const state = result && result.value ? result.value : {};
      browser.assert.ok(state.tablistFound, `モバイル用タブリストが表示されています（${label}）。`);
      browser.assert.equal(state.buttonCount, state.tabCount, `タブリストにはタブボタンだけが含まれています（${label}）。`);
      browser.assert.ok(state.tabCount >= 3, `モバイル用タブリストに複数のフィルタがあります（${label}）。`);
      browser.assert.deepEqual(state.selected, [expectedActiveIndex], `タブが1件だけ選択されています（${label}）。`);
      browser.assert.ok(
        state.controlStates.every(
          (entry) =>
            !!entry.id &&
            entry.count === 1 &&
            (entry.index === expectedActiveIndex ? entry.hidden === false : entry.hidden === true)
        ),
        `各タブに対応するパネルが1件ずつあり、非表示状態が正しいです（${label}）: ${JSON.stringify(state.controlStates)}`
      );
      browser.assert.ok(state.actionGroupFound && state.actionButtonCount === 3, `タブの操作ボタンはタブリストの外にあります（${label}）。`);
      browser.assert.ok(state.focusMatches, `モバイル用タブのフォーカスがキー操作に従って移動します（${label}）。`);
    }
  );
};

const verifyMobileTabKeyboard = (browser) => {
  browser.resizeWindow(390, 844).waitForElementVisible('#smartphone-tab-menu', 10000);
  browser.execute(
    function () {
      const selected = document.querySelector('#smartphone-tab-menu [role="tab"][aria-selected="true"]');
      if (selected) selected.focus();
      return { focused: document.activeElement === selected };
    },
    [],
    (result) => {
      browser.assert.ok(!!(result && result.value && result.value.focused), '選択したモバイル用タブへフォーカスが移りました。');
    }
  );
  sendMobileTabKey(browser, browser.Keys.HOME, 'Homeキーでモバイル用の先頭タブを選択');
  assertMobileTabs(browser, 0, 'Homeキーで先頭タブを選択');
  assertMobileActionLayout(browser);
  sendMobileTabKey(browser, browser.Keys.ARROW_RIGHT, '右矢印キーでモバイル用の次のタブを選択');
  assertMobileTabs(browser, 1, '右矢印キー');
  assertMobileActionLayout(browser);
  sendMobileTabKey(browser, browser.Keys.END, 'Endキーでモバイル用の末尾タブを選択');
  assertMobileTabs(browser, 2, 'Endキー');
  assertMobileActionLayout(browser);
  sendMobileTabKey(browser, browser.Keys.HOME, 'Homeキーでモバイル用の先頭タブへ戻る');
  assertMobileTabs(browser, 0, 'Homeキー');
  sendMobileTabKey(browser, browser.Keys.TAB, 'Tabキーでモバイル用タブリストから移動');
  assertMobileTabs(browser, 0, 'Tabキーで選択を変えずにタブリストから移動', 'action');
  assertAccessibilityIntegrity(browser, {
    rootSelector: '.timeline-page',
    label: 'モバイル表示のタイムラインのタブ',
  });
  browser.resizeWindow(1280, 900);
};

const waitForFilterColumnIndex = (browser, keyword, attempt = 0, state = {}) => {
  const maxAttempts = 10;
  browser.execute(
    function (targetKeyword) {
      const titles = Array.from(document.querySelectorAll('.filter-timeline-title'));
      const target = titles.find((node) => node.textContent && node.textContent.includes(targetKeyword));
      if (!target) return { index: null };
      const column = target.closest('.timeline-inner');
      if (!column) return { index: null };
      const content = column.querySelector('.timeline-content');
      return { index: content ? content.getAttribute('data-column-index') : null };
    },
    [keyword],
    (result) => {
      const index = result && result.value ? result.value.index : null;
      if (index !== null && index !== undefined) {
        state.value = index;
        browser.assert.ok(true, `フィルタ列の位置を取得しました: ${index}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `キーワードに対応するフィルタ列の位置が見つかりません: ${keyword}`);
        return;
      }
      browser.pause(500, () => waitForFilterColumnIndex(browser, keyword, attempt + 1, state));
    }
  );
};

const waitForPostInColumn = (browser, columnIndex, text, { shouldBeVisible, label }, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function (idx, targetText) {
      const container = document.querySelector(`.timeline-content[data-column-index="${idx}"]`);
      if (!container) return { present: false, visible: false };
      const xpath = `.//article[.//div[contains(@class,'text') and contains(., "${targetText}")]]`;
      const result = document.evaluate(xpath, container, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      if (result.snapshotLength === 0) return { present: false, visible: false };
      const node = result.snapshotItem(0);
      return { present: true, visible: node && node.offsetParent !== null };
    },
    [columnIndex, text],
    (result) => {
      const state = result && result.value ? result.value : { present: false, visible: false };
      const isVisible = !!(state.present && state.visible);
      if (shouldBeVisible ? isVisible : !isVisible) {
        browser.assert.ok(true, `投稿の状態=${shouldBeVisible ? '表示' : '非表示'}${label ? ` (${label})` : ''}。`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(
          false,
          `投稿の状態=${shouldBeVisible ? '非表示' : '表示のまま'}${label ? ` (${label})` : ''}。`
        );
        return;
      }
      browser.pause(500, () =>
        waitForPostInColumn(browser, columnIndex, text, { shouldBeVisible, label }, attempt + 1)
      );
    }
  );
};

const waitForFilterKeywordCleared = (browser, keyword, attempt = 0) => {
  const maxAttempts = 10;
  browser.execute(
    function (targetKeyword) {
      const titles = Array.from(document.querySelectorAll('.filter-timeline-title'));
      const found = titles.some((node) => node.textContent && node.textContent.includes(targetKeyword));
      return { found };
    },
    [keyword],
    (result) => {
      const found = result && result.value ? result.value.found : true;
      if (!found) {
        browser.assert.ok(true, `フィルタのキーワードをクリアしました: ${keyword}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `フィルタのキーワードが表示されたままです: ${keyword}`);
        return;
      }
      browser.pause(500, () => waitForFilterKeywordCleared(browser, keyword, attempt + 1));
    }
  );
};

const waitForTimelineColumnCount = (browser, expectedCount, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function () {
      return { count: document.querySelectorAll('.timeline-content').length };
    },
    [],
    (result) => {
      const count = result && result.value ? result.value.count : 0;
      if (count === expectedCount) {
        browser.assert.ok(true, `タイムラインの列数: ${count}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `タイムラインの列数の期待値は${expectedCount}ですが、実際は${count}でした。`);
        return;
      }
      browser.pause(500, () => waitForTimelineColumnCount(browser, expectedCount, attempt + 1));
    }
  );
};

const changeTimelineQueryWithoutReload = (browser, query) => {
  browser.execute(
    function (queryString) {
      const nextUrl = window.location.pathname + (queryString ? `?${queryString}` : '');
      window.history.pushState({}, '', nextUrl);
      window.dispatchEvent(new PopStateEvent('popstate'));
      return { url: window.location.href };
    },
    [query],
    (result) => {
      const url = result && result.value ? result.value.url : '';
      browser.assert.ok(!!url, 'ページを再読み込みせずにタイムラインのクエリが変わりました。');
    }
  );
};

const openFilterDialog = (browser) => {
  browser
    .waitForElementVisible('[data-testid="timeline-filter-button"]', 10000)
    .perform((done) => {
      clickFirstVisible(browser, '[data-testid="timeline-filter-button"]', 'フィルタボタン');
      done();
    })
    .waitForElementVisible('[data-testid="dialog-filter"]', 10000);
};

const openFilterDialogInColumn = (browser, columnIndex) => {
  browser.perform((done) => {
    browser.execute(
      function (idx) {
        const target = document.querySelector(`[data-testid="timeline-filter-edit-button-${idx}"]`);
        if (!target) return { clicked: false };
        target.click();
        return { clicked: true };
      },
      [String(columnIndex)],
      (result) => {
        const clicked = result && result.value ? result.value.clicked : false;
        if (!clicked) {
          browser.assert.ok(false, `対象列のフィルタ編集ボタンが見つかりません: ${columnIndex}`);
        }
        done();
      }
    );
  });
  browser.waitForElementVisible('[data-testid="dialog-filter"]', 10000);
};

const setInputValue = (browser, selector, value, label) => {
  browser.execute(
    function (sel, val) {
      const input = document.querySelector(sel);
      if (!input) return { ok: false };
      input.value = val;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true };
    },
    [selector, value],
    (result) => {
      const ok = result && result.value ? result.value.ok : false;
      if (!ok) {
        browser.assert.ok(false, `入力欄が見つかりません: ${label || selector}`);
      }
    }
  );
};

const applyFilter = (browser, keyword, columnIndex = null, verifySemantics = false) => {
  if (columnIndex === null) {
    openFilterDialog(browser);
  } else {
    openFilterDialogInColumn(browser, columnIndex);
  }
  if (verifySemantics) {
    assertFilterDialogRadioGroups(browser);
    assertAccessibilityIntegrity(browser, {
      rootSelector: '[data-testid="dialog-filter"]',
      label: 'フィルタダイアログ',
      checkControlNames: true,
    });
  }
  setInputValue(browser, '#keyword', keyword || '', 'キーワード');
  clickSingleVisibleAfterExactControls(browser, {
    anchorSelector: '#filtering_timeline_dialog_title',
    submitSelector: '[data-testid="dialog-filter-submit"]',
    expectedControls: [{ selector: '#keyword', value: keyword || '' }],
    label: 'フィルタの入力を送信',
  });
  waitForDialogClosed(browser, '[data-testid="dialog-filter"]', 'フィルタ');
};

module.exports = {
  'タイムラインをキーワードで絞り込む': (browser) => {
    const editorMail = process.env.E2E_FLOOR_EDITOR_MAIL || '';
    const editorPassword = process.env.E2E_FLOOR_EDITOR_PASSWORD || '';
    const userMail = process.env.E2E_USER_MAIL || '';
    const userPassword = process.env.E2E_USER_PASSWORD || '';

    if (!editorMail || !editorPassword || !userMail || !userPassword) {
      browser.assert.ok(false, 'タイムラインのフィルタのテストをスキップします。認証情報が未設定です。');
      browser.end();
      return;
    }

    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Timeline Filter Floor ${stamp}`;
    const roomTitle = `E2E Timeline Filter Room ${stamp}`;

    const state = prepareTimelineRoom(browser, {
      editorMail,
      editorPassword,
      userMail,
      userPassword,
      floorTitle,
      roomTitle,
      targetLangs: [],
    });

    const textA = `E2EFilterA-${stamp}`;
    const textB = `E2EFilterB-${stamp}-B`;

    submitPost(browser, textA);
    submitPost(browser, textB);

    const postXpathA = buildPostXpath(textA);
    const postXpathB = buildPostXpath(textB);

    waitForPostVisibleByXpath(browser, postXpathA, 'A');
    waitForPostVisibleByXpath(browser, postXpathB, 'B');

    applyFilter(browser, textA, null, true);
    const filterIndexState = {};
    waitForFilterColumnIndex(browser, textA, 0, filterIndexState);
    browser.perform((done) => {
      const index = filterIndexState.value;
      waitForPostInColumn(browser, index, textA, { shouldBeVisible: true, label: 'Aで絞り込み' });
      waitForPostInColumn(browser, index, textB, { shouldBeVisible: false, label: 'Bで絞り込み' });
      done();
    });

    browser.perform((done) => {
      applyFilter(browser, '', filterIndexState.value);
      done();
    });
    waitForFilterKeywordCleared(browser, textA);
    browser.perform((done) => {
      const index = filterIndexState.value;
      waitForPostInColumn(browser, index, textA, { shouldBeVisible: true, label: 'Aをクリア' });
      done();
    });

    browser.perform((done) => {
      applyFilter(browser, textA, filterIndexState.value);
      done();
    });
    waitForFilterColumnIndex(browser, textA, 0, filterIndexState);

    browser.perform((done) => {
      browser.assert.ok(!!state.floorId && !!state.roomId, 'タイムラインのフロアIDとルームIDを取得しました。');
      const query = [
        'keyword=E2EFilter',
        `col1_keyword=${encodeURIComponent(textA)}`,
        `col2_keyword=${encodeURIComponent(textB)}`,
      ].join('&');
      changeTimelineQueryWithoutReload(browser, query);
      done();
    });

    waitForTimelineColumnCount(browser, 3);
    assertTimelineHeadingSemantics(browser);
    verifyMobileTabKeyboard(browser);
    const queryColumnA = {};
    const queryColumnB = {};
    waitForFilterColumnIndex(browser, textA, 0, queryColumnA);
    waitForFilterColumnIndex(browser, textB, 0, queryColumnB);

    browser.perform((done) => {
      waitForPostInColumn(browser, 0, textA, { shouldBeVisible: true, label: '全体のA' });
      waitForPostInColumn(browser, 0, textB, { shouldBeVisible: true, label: '全体のB' });
      waitForPostInColumn(browser, queryColumnA.value, textA, {
        shouldBeVisible: true,
        label: 'クエリで指定した列A',
      });
      waitForPostInColumn(browser, queryColumnA.value, textB, {
        shouldBeVisible: false,
        label: 'クエリで指定した列AからBを除外',
      });
      waitForPostInColumn(browser, queryColumnB.value, textB, {
        shouldBeVisible: true,
        label: 'クエリで指定した列B',
      });
      waitForPostInColumn(browser, queryColumnB.value, textA, {
        shouldBeVisible: false,
        label: 'クエリで指定した列BからAを除外',
      });
      done();
    });

    changeTimelineQueryWithoutReload(browser, '');
    waitForFilterKeywordCleared(browser, textB);
    waitForFilterColumnIndex(browser, textA);
    browser.resizeWindow(320, 844).waitForElementVisible('#smartphone-tab-menu', 10000);
    browser.click('#tab-button-1');
    assertMobileActionLayout(browser);
    browser.click('.active-tab-actions button[aria-label="読み上げオフ"]')
      .waitForElementVisible('[data-testid="dialog-speech"]', 10000);
    clickSingleVisibleAfterExactControls(browser, {
      anchorSelector: '#speech_dialog_title',
      expectedControls: [{ selector: '#speech_dialog_title', property: 'textContent', value: '投稿読み上げの開始' }],
      submitSelector: '[data-testid="dialog-speech-start"]',
      label: 'モバイル表示で選択中の列の読み上げを開始',
    });
    waitForDialogClosed(browser, '[data-testid="dialog-speech"]', 'モバイル表示での読み上げ');
    browser.waitForElementVisible('.active-tab-actions button[aria-label="読み上げオン"]', 10000)
      .click('#tab-button-0')
      .waitForElementVisible('.active-tab-actions button[aria-label="読み上げオフ"]', 10000)
      .click('#tab-button-1')
      .waitForElementVisible('.active-tab-actions button[aria-label="読み上げオン"]', 10000)
      .click('.active-tab-actions button[aria-label="読み上げオン"]');
    browser.click('.active-tab-actions .mobile-filter-edit-button')
      .waitForElementVisible('[data-testid="dialog-filter"]', 10000)
      .assert.valueEquals('#keyword', textA);
    setInputValue(browser, '#keyword', textB, 'モバイル表示で選択中のフィルタ');
    clickSingleVisibleAfterExactControls(browser, {
      anchorSelector: '#filtering_timeline_dialog_title',
      submitSelector: '[data-testid="dialog-filter-submit"]',
      expectedControls: [{ selector: '#keyword', value: textB }],
      label: 'モバイル表示で選択中のフィルタの入力を送信',
    });
    waitForDialogClosed(browser, '[data-testid="dialog-filter"]', 'モバイル表示のフィルタ');
    browser.assert.textContains('#tab-button-1', textB);
    browser.assert.not.textContains('#tab-button-0', textB);
    assertMobileActionLayout(browser);
    browser.click('.active-tab-actions button[aria-label="絞り込み削除"]');
    waitForTimelineColumnCount(browser, 1);
    assertMobileActionLayout(browser);
    browser.resizeWindow(1280, 900);
    browser.end();
  },
};
