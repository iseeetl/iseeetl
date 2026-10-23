# 解析サービス

音・画像・動画・文字起こし・会話の処理を担当します。仕様の正本は[AI解析仕様](../../../docs/spec/ai-analysis.md)です。

`acousticProfile.js` の `classifyPcm` は解析用MP3をデコードしたモノラル16 kHz・16 bit PCMを受け取り、デジタル無音、単一持続音、その他を区別します。`describeAcousticProfile` は前二者だけを測定に基づく説明へ変換します。声の検出器ではありません。

`prepareAudioFileForAnalysis` と `extractVideoAudioForAnalysis` の `includeAcousticProfile` は既定でfalseです。アプリの `withPreparedAnalysisInput` が `audioScene` のときだけtrueを指定し、`provider.service.js` が結果を利用します。文字起こしは従来のMP3をそのまま渡します。

`validateAudioSceneText` は音解析専用の出力検査です。制御用トークン・単独の処理ラベルを拒否します。JSONの最終回答抽出と例外条件は[出力の長さと表示](../../../docs/spec/ai-analysis.md#出力の長さと表示)を参照してください。

backendディレクトリで関連単体テストを実行:

```sh
npm run test:unit -- --runInBand tests/unit/services/analysis
```

実FFmpegを使うメディア統合テスト:

```sh
npm run test:int -- tests/integration/services/analysisMedia.int.test.js
```

音声モデルの精度は単体テストの成功では判断できません。合成音を用いた外部APIの比較結果を別に評価し、推測による音源・場所・人物の追加や発話の見落としも確認してください。
