# 添付・録音、画像3,000pxとPDFページ選択

添付操作と画像表示の仕様。通知関連は別の変更として扱う。

## 操作

- 投稿・返信・付加情報のコメント右下とスマホ下部は、同じ「添付」「録音」の2ボタン。44px以上の操作領域、Tab・Enter・Space、名前付きボタンを維持する。
- iPhone/iPadは「添付」からOS選択へ。写真ライブラリ・撮影・ファイルの選択肢はOSに従う。写真一覧へ1タップで直行する保証はしない。
- Androidは「添付」内に「写真・動画を選ぶ」「写真を撮る」「動画を撮る」「ファイルを選ぶ」。写真一覧用inputのacceptには音やPDFを入れず、Pixelでライブラリが出なかった条件を分離する。撮影は種類別capture、ファイルは対応する画像・動画・音・PDF。
- PCは「添付」からファイル選択へ。端末の振り分けは画面幅だけでは行わない。
- 全端末で録音は既存アプリ内録音。自動で本文へ文字起こしせず、AIタグは別に選ぶ。WebMの音入力と既存録音形式は保持する。
- ゲストは従来のログイン案内へ。メニューやPDF処理中は別の添付・録音・送信を止める。PDF処理自体にはキャンセルを用意する。

## 画像の解像度と容量

- 新規添付する画像は長辺3,000pxを上限とし、小さい画像を拡大しない。縦横比と写真の向きを維持する。
- アップロード容量は従来の3MiB（3×1024×1024バイト）以内。JPEGは品質0.85、0.75、0.65の順で試し、超えるときだけ長辺を0.8倍ずつ最大6回縮小する。その場合は品質0.75。一定回数で収まらなければエラーを表示し、入力中の文章と元の添付を保持する。
- PNGとPDFのページ画像は文字を保ちやすいPNGを先に試す。容量超過時は白背景JPEGへ変換する。画像の二重変換を避ける。
- 投稿・返信・付加情報の3画面で同じ処理を使う。準備中は送信と別のメディア操作を止め、ダイアログを閉じた後の遅延結果を採用しない。
- 添付プレビューを押すと拡大表示。「さらに拡大／全体を表示」で原寸と画面幅を切り替え、原寸時はスクロールして読む。画像領域はキーボードでもスクロールできる。
- 既存投稿の画像は再生成しない。3MiBは送信ファイルの上限であり、バックエンドの既存再エンコード後の保存容量まで一律に保証する値ではない。

## PDF

- PDF.js 6.4.299を遅延読み込みし、端末内で選んだ1ページを長辺3,000pxで描画する。初期ページは1。原本PDFはアップロードしない。ライブラリ、worker、CMap、標準フォント、WASMは同じアプリ配信元から読み込む。
- 2ページ以上なら「画像にするページ」で選択。200ページ以下は選択欄、それ以上は数値入力。ページ変更時は入力済みの代替テキストを保持する。画像・説明の対応は本人が確認する。
- 「全何ページのうち何ページ目を共有するか」「PDF本体と他のページは共有しない」を日英表示する。
- PDFの入力上限20MB、変換45秒。描画後は上記画像容量処理を共用。パスワード付き、破損、不正なページ番号、容量超過、時間超過は理由を表示する。変換成功前は元の添付と本文・説明を保持し、取り消した変換結果を採用しない。
- 変換後は既存の画像投稿・代替テキスト（2,000文字）を使用。PDF本文の自動抽出や解析タグの自動追加はしない。画像解析を選んだ場合の対象は、選んで添付したページ画像のみ。
- PDF原本の閲覧と全ページ同時共有は今回の範囲外。入力PDFは変更しない。

## 実装・検証

`mediaPicker.js`は端末ごとの選択入口、`pdfFirstPage.js`は選択ページの描画・上限・取消し、`imageAttachment.js`は共有の画像縮小・容量調整を担当。関数名は既存呼び出しとの整合のため維持し、`pageNumber`を省略すると1ページ目を描画する。`scripts/pdf-assets.cjs`をViteから使い、PDF.jsの付属資産を開発サーバーとbuildの両方で配信する。

通常の環境構築はfrontendで `npm ci`。関連試験は `npm run test:unit:ci -- tests/unit/features/timeline/pdfFirstPage.spec.js tests/unit/features/timeline/imageAttachment.spec.js tests/unit/components/timeline/dialogs/ImageAttachmentFlow.spec.js tests/unit/components/timeline/inputs/AttachmentPdf.spec.js tests/unit/components/timeline/inputs/MediaInput.spec.js tests/unit/components/timeline/inputs/MobileComposerTools.spec.js tests/unit/components/timeline/dialogs/EditPostDialog.spec.js tests/unit/components/timeline/dialogs/EditReplyDialog.spec.js tests/unit/components/timeline/dialogs/EditSupplementDialog.spec.js tests/unit/features/timeline/mediaPicker.spec.js tests/unit/constants/mediaConstants.spec.js`。

実機のOSメニュー、撮影、録音、キーボード開閉はiPhone Safari・Pixel Chromeで確認する。PCブラウザのスマホ幅確認を実機確認と呼ばない。

## 通常表示と拡大画面の画質（追加修正）

一覧は既存の長辺400pxサムネイルを遅延読み込みする。表示された画像のCSSサイズ×devicePixelRatioが400pxを超える場合のみ、同じ画像の `?preview=800` を追加取得する。最大800pxで打ち止めにし、保存画像（新規添付は最大3,000px）は拡大時のみ取得する。ResizeObserverで列幅変更、画面密度変更も監視する。一度取得済みの800px画像は狭くしても維持し、同じ画像を取り直さない。800pxの取得失敗は400pxへ戻り、再試行ループにしない。

800px版は既存のルームメディア認可を毎回通す。既存画像からも必要時に生成するため、DB移行や原本書換えは不要。サーバー内キャッシュは32MiB・最大128件、同時生成2件・受付中最大10件で制限し、ブラウザ側は既存のprivate/no-storeを維持する。削除済み原本はキャッシュからも返さない。追加の共有キャッシュや外部サービスへの画像送信は使わない。

ギャラリーは画像・動画を上、代替テキストを下に配置する。説明欄は白背景・濃い文字、最大30%の高さで長文はスクロールでき、空なら欄を出さない。ダウンロードと閉じるの配置、説明の表示設定・読み上げ名は維持する。添付プレビューの黒い余白は透明背景にする。既に小さく保存された画像の細部は復元できない。
