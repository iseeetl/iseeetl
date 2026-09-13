// 投稿・返信のタグ、本文、ユーザ名、アニメーションをPushFilter.conditionsの絞り込み条件と照合する。
function matchConditions(data, cond) {
  // 画面の表示・非表示設定と表示範囲（showRange）は、通知条件の判定に使わない。
  const yes = cond.filterMode !== 'exclude';

  if (cond.keywordArray && cond.keywordArray.length) {
    const hit =
      cond.logicalOperator === 'and'
        ? cond.keywordArray.every((k) => (data.content || '').includes(k))
        : cond.keywordArray.some((k) => (data.content || '').includes(k));
    if (yes !== hit) return false;
  }

  if (cond.userName && cond.userName.trim().length) {
    const hit = data.username === cond.userName.trim();
    if (yes !== hit) return false;
  }

  if (cond.tags && cond.tags.length) {
    const roomTags = Array.isArray(data.room_tags) ? data.room_tags : [];
    const hit =
      cond.tagSearchOperator === 'and'
        ? cond.tags.every((t) => roomTags.includes(t))
        : cond.tags.some((t) => roomTags.includes(t));
    if (yes !== hit) return false;
  }

  if (cond.noTags) {
    const roomTags = Array.isArray(data.room_tags) ? data.room_tags : [];
    const hit = roomTags.length === 0;
    if (yes !== hit) return false;
  }

  if (cond.animation) {
    const hit = !!data.animation;
    if (yes !== hit) return false;
  }

  return true;
}

module.exports = matchConditions;
