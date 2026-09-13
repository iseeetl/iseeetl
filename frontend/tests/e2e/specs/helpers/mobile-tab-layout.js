const assertMobileActionLayout = (browser, attempt = 0) => {
  browser.execute(function () {
    const tab = document.querySelector('.tab-item-active');
    const group = document.querySelector('.active-tab-actions');
    if (!tab || !group) return { ok: false, reason: 'タブまたはグループがありません' };
    const rect = tab.getBoundingClientRect();
    const title = tab.querySelector('button').getBoundingClientRect();
    const buttons = Array.from(group.querySelectorAll('button'));
    const bounds = buttons.map((button) => {
      const r = button.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      const ok = r.width > 0 && r.height > 0 && r.left >= rect.left && r.right <= rect.right + 1 &&
        r.top >= rect.top && r.bottom <= rect.bottom + 1 && title.right <= r.left + 1 &&
        r.left >= 0 && r.right <= window.innerWidth && button.contains(hit);
      return { ok, left: r.left, right: r.right, top: r.top, bottom: r.bottom, hit: button.contains(hit) };
    });
    return { ok: buttons.length === 3 && bounds.every((b) => b.ok), bounds,
      tab: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }, titleRight: title.right };
  }, [], (result) => {
    if (!result.value.ok && attempt < 20) {
      browser.pause(100, () => assertMobileActionLayout(browser, attempt + 1));
      return;
    }
    browser.assert.ok(result.value.ok, `3つの操作が選択中のタブ内に収まり、ポインタでクリックできます: ${JSON.stringify(result.value)}`);
  });
};

module.exports = { assertMobileActionLayout };
