# 居酒屋ノブ

週に1回・1時間だけ開く、スマホの中の居酒屋。カウンター7席で文字の会話・料理とお酒・みんなで同じ曲・決まり文句の声。

## ふやす・変えるとき(ほとんど js/config.js だけ)

| 変えたいもの | 書く場所 |
|---|---|
| 店の名前・大将の名前 | `SHOP.NAME` / `SHOP.OWNER_NAME` |
| 席の数 | `SHOP.SEATS`(カウンターも自動で長くなる) |
| 営業日・時間 | `SHOP.SCHEDULE`(いくつでも足せる) |
| メニュー | `SHOP.MENU`(1行で1品。model で 3D の形、知らない形はお皿に絵文字) |
| 曲 | `SHOP.SONGS`(1行で1曲。music/ に置いたら 'music/名前.mp3') |
| 決まり文句の声 | `SHOP.PHRASES`。`voice/irasshai.mp3` などを置けばその声で鳴る。なければ仮の読み上げ |
| 合言葉 | `tools/hash.html` で指紋を作って `PASSCODE_HASH`(お店)/ `OWNER_HASH`(大将) |
| アバターの部品 | `js/avatar-data.js`(形は `js/scene3d.js` の buildAvatar) |

## 開き方
- お客さん: `https://…/izakaya/`
- 大将: `https://…/izakaya/#owner`
- `#local` を付けると、本番の設定があっても「おためしモード」(この端末の中だけ)で動く

## しくみ
- `js/net.js` つなぐ係。おためし(同じ端末のタブどうし)と、本番(Firebase Realtime Database を部品なしで直接)
- `js/scene3d.js` 3D(three.js r186 を vendor/ に同梱。buhin-check 済み)。動かない古い iPhone では 2D の代わり
- `js/app.js` 入口・アバター作り・予約・会話・注文・曲の同期・閉店
- 曲の同期: サーバーに「何の曲を何時から流したか」を置き、全員がその位置に合わせて鳴らす
- まとめ役: お店にいる人のうち1台(大将がいれば大将)が、片づけ・次の曲・閉店を受け持つ

## 本番にする(Firebase)
1. https://console.firebase.google.com で プロジェクトを作る(無料の Spark プラン。カード登録なし)
2. Realtime Database を作る(場所: シンガポール asia-southeast1)
3. ルールを貼る(下)→ 公開
4. データベースのアドレスを `SHOP.FIREBASE.databaseURL` に書く

ルール(第1弾。ログインを足したら厳しくする):
```json
{ "rules": { "rooms": { "$room": { ".read": true, ".write": true } }, ".read": false, ".write": false } }
```
