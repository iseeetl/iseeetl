# 付加情報の本文検証

`supplementContentLimit.js` は新規・更新とも人・AIに共通の2000 UTF-16単位を検証します。投稿・返信は400単位です。[仕様](../../../../docs/spec/ai-analysis.md#共通の生成量長文表示編集)。

`alternativeText.js` は画像・動画・音の説明のスナップショット検証を共用します。専用更新と通常編集の競合判定、video_descriptionの扱いは[仕様](../../../../docs/spec/frontend/shared-alternative-text.md)を参照してください。

共同編集のルーム設定 `collaborative_text_editing`（既定オフ）と文章専用の権限制御を追加。仕様の正本は ルートから `docs/spec/frontend/shared-alternative-text.md` を参照。フロア単位の編集者・履歴復元は今回未実装。

`guestRules.js` はルームID指定時にルーム絵文字候補でゲスト本文を検証し、省略時は既存5候補を維持。仕様は `docs/spec/frontend/update-notices-emoji.md` を参照。
