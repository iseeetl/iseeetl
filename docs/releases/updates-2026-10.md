# 2026年10月の更新記録

公開commitを基準にした機能差分の案内です。機能の実装・画面の変更と、利用者への改善効果を実証したことは区別します。

表は記載したcommitの日付順です。日付はUTCのcommit日時であり、本番への配置日時や実験日時ではありません。表示するcommit IDは先頭12桁、リンク先は40桁です。各行は主な変更の要約であり、差分全体を網羅しません。正確な変更範囲は比較リンクを参照してください。特定の実験がどの版を使用したかは、その実験の記録で対応付けます。モデルの実選択など、コードと別に変わる設定は設定版として記録します。

| commit日付（UTC） | PR | 公開commit | 主な変更 | コード差分 |
|---|---|---|---|---|
| 2026-10-17 | [#19](https://github.com/iseeetl/iseeetl/pull/19) | [1652fa8bfdd6](https://github.com/iseeetl/iseeetl/commit/1652fa8bfdd61ea2cbfc6d9ae4a8a3a1a599c3e3) | タイムライン内のリンクの視認性を調整。 | [差分](https://github.com/iseeetl/iseeetl/compare/019c72d600ac2f38f0de4be27d04dd9fbc4c6c6c...1652fa8bfdd61ea2cbfc6d9ae4a8a3a1a599c3e3) |
| 2026-10-17 | [#20](https://github.com/iseeetl/iseeetl/pull/20) | [6905caebb1bf](https://github.com/iseeetl/iseeetl/commit/6905caebb1bf229424538737c04fa2039f386374) | スマホの既存投稿操作を下部のブラウザUIと重なりにくい位置へ調整。 | [差分](https://github.com/iseeetl/iseeetl/compare/1652fa8bfdd61ea2cbfc6d9ae4a8a3a1a599c3e3...6905caebb1bf229424538737c04fa2039f386374) |
| 2026-10-17 | [#21](https://github.com/iseeetl/iseeetl/pull/21) | [3de946d8c4dd](https://github.com/iseeetl/iseeetl/commit/3de946d8c4dd0fc3dce6b475c4c76f79cb60f9ed) | 表示領域の変化に追従する処理を調整。 | [差分](https://github.com/iseeetl/iseeetl/compare/6905caebb1bf229424538737c04fa2039f386374...3de946d8c4dd0fc3dce6b475c4c76f79cb60f9ed) |
| 2026-10-23 | [#23](https://github.com/iseeetl/iseeetl/pull/23) | [fce8860e3618](https://github.com/iseeetl/iseeetl/commit/fce8860e3618d6183428693d4cafbedf11a55c1d) | URLによる初期タブの指定と、投稿タグの選択操作を追加・整理。新規投稿・編集・返信のボタン順序と選択表示を統一。 | [差分](https://github.com/iseeetl/iseeetl/compare/3de946d8c4dd0fc3dce6b475c4c76f79cb60f9ed...fce8860e3618d6183428693d4cafbedf11a55c1d) |
| 2026-10-23 | [#25](https://github.com/iseeetl/iseeetl/pull/25) | [5d60226fba02](https://github.com/iseeetl/iseeetl/commit/5d60226fba02fac584fc4c461d4a9c00d013d763) | 文字起こしで発話を検出できなかった場合の日英表示と、不正なAPI応答との区別を追加。 | [差分](https://github.com/iseeetl/iseeetl/compare/fce8860e3618d6183428693d4cafbedf11a55c1d...5d60226fba02fac584fc4c461d4a9c00d013d763) |
| 2026-10-24 | [#26](https://github.com/iseeetl/iseeetl/pull/26)・[#27](https://github.com/iseeetl/iseeetl/pull/27) | [bb991d89e408](https://github.com/iseeetl/iseeetl/commit/bb991d89e40897f179c2424c334c65bdedf6c58f) | 音解析のGemini対応、無音や一定音などの波形条件に基づく処理、解析の不一致や失敗時の説明を追加。音の解析と発話の文字起こしは別機能として扱う。 | [差分](https://github.com/iseeetl/iseeetl/compare/5d60226fba02fac584fc4c461d4a9c00d013d763...bb991d89e40897f179c2424c334c65bdedf6c58f) |
| 2026-10-24 | [#28](https://github.com/iseeetl/iseeetl/pull/28) | [867fab727661](https://github.com/iseeetl/iseeetl/commit/867fab727661e0e9fe795862898237d71779d4d6) | AI対応タグを識別しやすくし、ルーム別・タグ別にAI付加情報を非表示にする閲覧設定を追加。人の付加情報と区別。 | [差分](https://github.com/iseeetl/iseeetl/compare/bb991d89e40897f179c2424c334c65bdedf6c58f...867fab727661e0e9fe795862898237d71779d4d6) |
| 2026-10-24 | [#29](https://github.com/iseeetl/iseeetl/pull/29) | [1137c3b41dd4](https://github.com/iseeetl/iseeetl/commit/1137c3b41dd46727610774aa78b8d17008b1f8bb) | 投稿・返信の本文400文字を維持し、人・AIの付加情報の本文上限を2000文字へ統一。長文の展開・折りたたみに対応。 | [差分](https://github.com/iseeetl/iseeetl/compare/867fab727661e0e9fe795862898237d71779d4d6...1137c3b41dd46727610774aa78b8d17008b1f8bb) |
| 2026-10-24 | [#30](https://github.com/iseeetl/iseeetl/pull/30) | [e79806ab5769](https://github.com/iseeetl/iseeetl/commit/e79806ab5769671296685e1be135b8605376560b) | スマホ下部に投稿操作を追加し、既存の上部操作も維持。上下の操作位置を区別するGA計測を追加。 | [差分](https://github.com/iseeetl/iseeetl/compare/1137c3b41dd46727610774aa78b8d17008b1f8bb...e79806ab5769671296685e1be135b8605376560b) |
| 2026-10-25 | [#31](https://github.com/iseeetl/iseeetl/pull/31) | [1522d2d16fdf](https://github.com/iseeetl/iseeetl/commit/1522d2d16fdf40369a59aedc24a9b1a0f474a695) | Googleログインボタンの表示を復旧。 | [差分](https://github.com/iseeetl/iseeetl/compare/e79806ab5769671296685e1be135b8605376560b...1522d2d16fdf40369a59aedc24a9b1a0f474a695) |

PR #26・#27の行は両PRの変更を含む到達点を示し、比較リンクは両PRをまとめた差分です。

GAの送信項目・除外条件・上下ボタンの比較方法は、[既存の計測仕様](../spec/frontend/cookies-and-external-transmissions.md#編集画面の送信操作計測)と[検証方法](../testing/google-analytics.md)を参照してください。イベント定義と集計方法は公開仕様ですが、実環境の測定ID・収集データ・利用者識別子はこの更新記録に含めません。操作位置別の計測値を集計しても、それだけでは位置による改善効果を示す比較実験の結果にはなりません。

## 変更履歴に含める検証情報

各PRは、問題が起きる条件、変更後の動作、対象画面、実施したテスト、実機/画面幅での確認、未確認事項を記録します。実際の本番配置日時や実環境との対応は内部の運用記録に保存し、この公開履歴には含めません。公開する差分はcommitを基準にし、公開用画面にも撮影対象のcommitと公開可能な再現条件を付けます。[版と再現条件](../research/version-reproducibility.md)と[UI記録方法](../testing/ui-recording.md)を参照してください。

## 共同編集と投稿・閲覧操作の整理

学会発表のデモに向け、添付方法と情報の役割が混同されやすい箇所、スマートフォンの操作量、説明の共同編集を整理しました。多様な情報を参加者が持ち寄り、各自が必要な情報を選んで読む、という考え方は変えません。AIの説明も付加情報の一つです。実装した変更が、参加や理解の改善を実証したことを意味するものではありません。

| 対象 | 変更後の動作 |
|---|---|
| 添付 | 写真ライブラリ・カメラ・ファイル・録音から選択。添付方法とAIの解析タグを分離。録音だけではコメント本文へ文字起こしを挿入しない。 |
| 投稿操作 | コメント欄右下の操作を維持し、スマホ下部にも同じ機能のショートカット。投稿・連続投稿は同じ幅、実行できない状態を淡色で示す。 |
| 代替テキスト | 画像・動画・音の説明を最大2,000文字に統一。独立したタイトル入力を設けず、既存の音のタイトルは保持。表示／非表示と長文の展開に対応。 |
| 共同編集 | ルーム管理者が許可した場合だけ、一般ログインユーザーも他人の代替テキスト、人・AIの付加情報の本文を編集可能。ゲストは編集不可。競合時は上書きを拒否し、入力を残す。 |
| リアクション | 元投稿と代替テキストへの反応を分ける。既存のアイコン・開閉方法を保ち、候補は列幅に追従して、収まらない分だけ横スクロール。 |
| 絵文字 | フロア／ルームの単語グループで絵文字候補を管理し、本文への挿入とリアクションに共用。未設定ルームは既存5候補を維持。 |
| 更新のお知らせ | このルーム・自分の閲覧だけの任意設定。代替テキスト・付加情報・リアクションの更新を知らせる。既定オフ。返信の並び順や接続線は維持。 |

新しい表示文は日本語・英語・中国語を用意し、その他の言語の新規項目は英語で表示します。キーボード操作、名前・状態・関連付けを確認します。VoiceOverの実発話や全端末のカメラ・録音の確認とは区別し、WCAG全体への適合を断定しません。

詳細は[投稿操作](../spec/frontend/compact-composer.md)、[共同編集](../spec/frontend/shared-alternative-text.md)、[更新通知・絵文字](../spec/frontend/update-notices-emoji.md)を参照してください。ソース公開と本番配置は別の作業であり、実環境との対応は内部の配置記録で確認します。
