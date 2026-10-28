# GARAGE EVE.RYN 車検誘発ボード

ジョーカー（JOCAR）に登録されている保有車両のうち、車検満了日が近いお客様を一覧にして、
スタッフ全員で「誰に・いつ・どう案内したか」を共有するアプリです。

- **Next.js 15**（App Router）＋ **Supabase**（会員システムのプロジェクトに相乗り。テーブルは `yuhatsu_` で始まる）
- ブラウザは Supabase にも JOCAR にも直接つながらず、すべて Next.js のサーバー経由
- ログインは会員システムのスタッフアカウント（メールアドレス＋パスワード）。`staff_users.is_active` が true の人だけ
- JOCAR のキーが未設定のあいだは**架空のサンプルデータ**で動く

## 画面

| 画面 | 内容 |
| --- | --- |
| 一覧 | 満了日が過去60日〜90日先の車両。要対応／期限切れ／30日以内／31〜60日／61〜90日で絞り込み、検索、ステータス・担当者で絞り込み |
| 詳細 | 連絡先（コピー）、希望連絡手段・曜日・時間帯、ステータス変更、次回連絡予定日、連絡記録、見積もりリンク付き案内文のコピー |
| 自動更新 | 毎朝6:00（日本時間）に JOCAR から取り込み。画面の「今すぐ更新」でも可 |

- 「要対応」＝未連絡、または次回連絡予定日が今日以前
- ジョーカーで案内送付区分が「拒否」の顧客は一覧に出さない
- 抹消済み・管理停止日を過ぎた車両は取り込まない
- 状況は「車両 × 満了日」ごとに記録。車検を受けて満了日が変わると、次の周期は「未連絡」から始まる
- 2人が同時に同じ顧客を更新した場合は、あとの人に知らせて上書きしない

## JOCAR 連携

車輌取得API（`https://api.jocar.jp/JocarApi/Search/SharyoList`）を、
車検日の範囲（`ShknDayRngS`〜`ShknDayRngE`、今日-60日〜+120日）と `getkokyinfo=y`（保有者の顧客情報付き）で呼び出します。
1回100件ずつ、`MaxKey` の番号＋1 を `CarNoRngS` に入れて最後まで取得します。画像・免許証ファイルは取りません。
JOCAR は毎日 3:00〜3:30 にメンテナンスで止まるため、その時間は同期しません。

API キーが届いたら、Vercel の Environment Variables に次の3つを登録して再デプロイするだけで本番データに切り替わります
（サンプルデータとサンプルで試した記録は最初の同期で自動的に消えます）。

| 変数 | 内容 |
| --- | --- |
| `JOCAR_API_KEY` | API キー |
| `JOCAR_HAN_CD` | 販売店コード（6桁） |
| `JOCAR_SEC_KEY` | 認証キー |

## 環境変数

`.env.example` を参照。どれも `NEXT_PUBLIC_` を付けないこと。

| 変数 | 内容 |
| --- | --- |
| `SUPABASE_URL` | 会員システムの Supabase の URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 会員システムの Supabase の service_role キー（**絶対に公開しない**） |
| `CRON_SECRET` | 毎朝の同期を Vercel から呼ぶときの合言葉（32文字以上） |
| `JOCAR_*` | 上記 |

## データベース

`supabase/migrations/0001_yuhatsu.sql`（会員システムの Supabase に適用済み）。

| テーブル | 内容 |
| --- | --- |
| `yuhatsu_vehicles` | JOCAR から取り込んだ車両と保有者の写し（同期のたびに入れ替え） |
| `yuhatsu_followups` | 車両×満了日ごとのステータス・次回連絡予定日 |
| `yuhatsu_logs` | 連絡記録 |
| `yuhatsu_sessions` | ログインセッション（トークンのハッシュのみ） |
| `yuhatsu_sync_runs` | 同期の実行記録 |

すべて RLS 有効・ポリシーなし（service_role を持つサーバーからしか読み書きできない）。

## フォルダ構成

```
app/                 画面（page.jsx）と API（app/api/**/route.js）
components/          画面の部品（一覧・詳細・ログイン）
lib/shared/          画面とサーバー共通（定数・日付・表示ルール・案内文）
lib/server/          サーバー専用（認証・DB・JOCAR・同期・サンプルデータ）
supabase/migrations/ データベース定義
tests/               ロジックのテスト（npm test）
```

案内文は `lib/shared/view.js` の `guidanceMessage`、一覧の範囲は `lib/shared/constants.js` で変えられます。
