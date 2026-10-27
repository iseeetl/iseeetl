# メディアの参照とプレビュー

`imagePreview.getImagePreview(filePath)` は認可後のJPEG/PNGから長辺800px以内の画像を生成します。原本・DBを変更せず、32MiB/128件のLRU、同時2生成、受付中10件の上限を使います。`GET /media/:floorId/:roomId/:fileName?preview=800` から利用し、毎回既存のルーム認可と原本存在確認を行います。ブラウザのキャッシュ方針はprivate/no-storeを維持します。

検証: backendで `npm run test:unit -- --runInBand tests/unit/services/media/imagePreview.test.js` および `npm run test:int -- tests/integration/routes/media.access.int.test.js`。
