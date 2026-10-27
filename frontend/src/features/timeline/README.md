# Timeline features

`supplementLength.js` はすべての付加情報に共通の作成・編集上限と表示用抜粋を提供します。仕様は [AI解析仕様](../../../../docs/spec/ai-analysis.md#会話の長さ制限と失敗表示) を参照してください。検証: frontendで `npm run test:unit -- tests/unit/components/timeline/items/SupplementItem.spec.js tests/unit/components/timeline/dialogs/EditSupplementDialog.spec.js`。

`alternativeText.js` は3種類の代替テキストと編集開始時のスナップショットを共用します。`displayAlternativeText` と共同編集の仕様は[こちら](../../../../docs/spec/frontend/shared-alternative-text.md)を参照してください。

共同編集のルーム設定 `collaborative_text_editing`（既定オフ）と文章専用の権限制御を追加。仕様の正本は ルートから `docs/spec/frontend/shared-alternative-text.md` を参照。フロア単位の編集者・履歴復元は今回未実装。

`updateNotices.js` は読込済み投稿の差分と既存閲覧フィルターを用いた任意通知、`roomEmoji.js` は既存単語グループからの共通絵文字候補を担当。リアクション候補の開閉とアイコンは既存方式を維持し、代替テキストの操作欄もリアクション→編集の横並びに揃える。代替テキストは本文と同じ文字サイズとし、共通の「付加情報」見出しを省く。リアクション候補はカラムの利用可能幅まで広げ、収まらない場合だけ横スクロールする。開いたまま列幅を変えても自動で追従する。候補が隠れる側にだけスクロール矢印を表示し、不要な矢印の幅は残さない。仕様・使い方・検証は [更新通知と絵文字](../../../../docs/spec/frontend/update-notices-emoji.md)を参照。

`mediaPicker.js`は添付入口、`pdfFirstPage.js`は選択したPDFページの画像化、`imageAttachment.js`は画像を長辺3,000px・送信3MiB以内へ変換する共通処理を提供する。`prepareImageAttachment(file)`を投稿・返信・付加情報で共用し、PDFは`encodeImageAttachment(canvas)`で事前変換する。使い方・上限・取消し・検証は[メディア選択の仕様](../../../../docs/spec/frontend/native-media-picker.md)を参照。

`timelineUtil.constructImagePath`は400pxサムネイルを優先し、`constructImagePreviewPath`は認可付き800px版を返します。共通`TimelineImage`が表示サイズ・画素密度・画面内状態を監視し、必要時のみ800pxへ切り替えます。拡大時は保存画像を取得し、説明欄は画像下へ配置します。[仕様と検証](../../../../docs/spec/frontend/native-media-picker.md)を参照してください。
