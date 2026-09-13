const { getBaseUrl, navigateToApp } = require('../../helpers/login');
const { prepareTimelineRoom, submitPost } = require('../../helpers/timeline-helpers');

const INITIAL_FETCH_LIMIT = 10;
const FIXTURE_POST_COUNT = 12;

const readColumnState = (browser, callback) => {
  browser.execute(
    function () {
      const column = document.querySelector('.timeline-content[data-column-index="0"]');
      if (!column) {
        return { present: false };
      }
      const posts = Array.from(column.querySelectorAll('article[id]')).filter((article) => {
        return Array.from(article.children).some((child) => child.classList && child.classList.contains('post'));
      });
      const ids = posts.map((post) => post.id).filter(Boolean);
      const sentinel = column.querySelector('.scroll-sentinel');
      const manualButton = column.querySelector('.get-next-posts-button');
      return {
        present: true,
        postCount: ids.length,
        postIds: ids,
        uniquePostCount: new Set(ids).size,
        sending: column.getAttribute('aria-busy') === 'true',
        noMore: !manualButton,
        scrollTop: column.scrollTop,
        scrollHeight: column.scrollHeight,
        clientHeight: column.clientHeight,
        hasSentinel: !!sentinel,
        hasManualButton: !!manualButton,
      };
    },
    [],
    (result) => {
      callback(result && result.value ? result.value : {});
    }
  );
};
const waitForColumnState = (browser, predicate, failureMessage, attempt = 0, onReady) => {
  const maxAttempts = 30;
  readColumnState(browser, (state) => {
    if (predicate(state)) {
      if (onReady) onReady(state);
      return;
    }
    if (attempt >= maxAttempts) {
      browser.assert.ok(false, `${failureMessage}: ${JSON.stringify(state)}`);
      if (onReady) onReady(state);
      return;
    }
    browser.pause(500, () => waitForColumnState(browser, predicate, failureMessage, attempt + 1, onReady));
  });
};

const scrollColumnToBottom = (browser, callback) => {
  browser.execute(
    function () {
      const column = document.querySelector('.timeline-content[data-column-index="0"]');
      if (!column) return false;
      column.scrollTop = column.scrollHeight;
      column.dispatchEvent(new Event('scroll'));
      return true;
    },
    [],
    () => callback()
  );
};

module.exports = {
  'タイムラインを末尾までスクロールすると続きを読み込む': (browser) => {
    const editorMail = process.env.E2E_FLOOR_EDITOR_MAIL || '';
    const editorPassword = process.env.E2E_FLOOR_EDITOR_PASSWORD || '';
    const userMail = process.env.E2E_USER_MAIL || '';
    const userPassword = process.env.E2E_USER_PASSWORD || '';

    if (!editorMail || !editorPassword || !userMail || !userPassword) {
      browser.assert.ok(false, 'タイムラインの自動読み込みのテストをスキップします。認証情報が未設定です。');
      browser.end();
      return;
    }

    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Timeline Autoload Floor ${stamp}`;
    const roomTitle = `E2E Timeline Autoload Room ${stamp}`;
    const postTexts = Array.from(
      { length: FIXTURE_POST_COUNT },
      (_, index) =>
        `E2E Timeline Autoload ${stamp} #${String(index + 1).padStart(2, '0')} ${'scroll-content '.repeat(20)}`
    );
    const state = prepareTimelineRoom(browser, {
      editorMail,
      editorPassword,
      userMail,
      userPassword,
      floorTitle,
      roomTitle,
    });

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      browser.end();
    };

    browser.perform(() => {
      postTexts.forEach((text) => submitPost(browser, text));
      waitForColumnState(
        browser,
        (value) =>
          value.postCount === FIXTURE_POST_COUNT &&
          value.uniquePostCount === FIXTURE_POST_COUNT &&
          !value.sending,
        '再表示前に自動読み込み用の投稿が保存されていません',
        0,
        (savedState) => {
          if (!savedState.present || !state.floorId || !state.roomId) {
            browser.assert.ok(
              false,
              `自動読み込みの再表示に必要な準備が整いませんでした: ${JSON.stringify({
                savedState,
                floorId: state.floorId,
                roomId: state.roomId,
              })}`
            );
            finish();
            return;
          }
          browser.assert.equal(
            savedState.uniquePostCount,
            FIXTURE_POST_COUNT,
            '再表示前に、すべての専用投稿がIDの重複なく保存されています。'
          );

          const base = getBaseUrl(browser).replace(/\/$/, '');
          const timelineUrl = `${base}/floor/${encodeURIComponent(state.floorId)}/room/${encodeURIComponent(
            state.roomId
          )}`;
          navigateToApp(browser, base)
            .waitForElementVisible('#search_floor_input', 20000)
            .perform(() => {
              navigateToApp(browser, timelineUrl)
                .waitForElementVisible('.timeline-page', 20000)
                .waitForElementPresent('[data-testid="timeline-connected"]', 20000);

              waitForColumnState(
                browser,
                (value) => value.postCount === INITIAL_FETCH_LIMIT && !value.sending,
                '初回取得の件数制限を確認できませんでした',
                0,
                (initialState) => {
                  if (!initialState.present) {
                    browser.assert.ok(false, '自動読み込みに失敗しました。タイムラインの列が見つかりません。');
                    finish();
                    return;
                  }
                  if (!initialState.hasSentinel) {
                    browser.assert.ok(false, '自動読み込みに失敗しました。スクロールの監視要素が見つかりません。');
                    finish();
                    return;
                  }
                  if (initialState.scrollHeight <= initialState.clientHeight) {
                    browser.assert.ok(false, `自動読み込みのテストデータをスクロールできません: ${JSON.stringify(initialState)}`);
                    finish();
                    return;
                  }
                  browser.assert.equal(
                    initialState.postCount,
                    INITIAL_FETCH_LIMIT,
                    'タイムラインの初回取得は10件に制限されています。'
                  );
                  browser.assert.equal(
                    initialState.uniquePostCount,
                    initialState.postCount,
                    'タイムラインの初回取得の投稿IDが重複していません。'
                  );

                  scrollColumnToBottom(browser, () => {
                    waitForColumnState(
                      browser,
                      (value) => value.postCount === FIXTURE_POST_COUNT && !value.sending,
                      '自動読み込みで残りの投稿を取得できませんでした',
                      0,
                      (loadedState) => {
                        browser.assert.equal(
                          loadedState.postCount,
                          FIXTURE_POST_COUNT,
                          '自動読み込みですべての専用投稿を取得しました。'
                        );
                        browser.assert.equal(
                          loadedState.uniquePostCount,
                          loadedState.postCount,
                          '自動読み込みで投稿IDが重複して追加されていません。'
                        );

                        scrollColumnToBottom(browser, () => {
                          waitForColumnState(
                            browser,
                            (value) => value.noMore && !value.sending,
                            '自動読み込みが末尾に到達しませんでした',
                            0,
                            (terminalState) => {
                              browser.assert.equal(
                                terminalState.postCount,
                                FIXTURE_POST_COUNT,
                                '最後の取得後も、すべての投稿を維持しています。'
                              );
                              browser.assert.equal(
                                terminalState.uniquePostCount,
                                terminalState.postCount,
                                '最後の投稿一覧に重複がありません。'
                              );
                              browser.assert.ok(
                                terminalState.noMore,
                                'タイムラインの列が、古い投稿が残っていないことを記録しています。'
                              );
                              finish();
                            }
                          );
                        });
                      }
                    );
                  });
                }
              );
            });
        }
      );
    });
  },
};
