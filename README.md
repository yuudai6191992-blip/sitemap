# 技術マップ（Technology Map）

復建調査設計株式会社の保有技術を、分野・キーワードから横断的に検索・閲覧できるインタラクティブな Web アプリケーションです。

HTML5 / CSS3 / JavaScript（ES6）のみで実装しており、外部ライブラリやビルドツールは使用していません。技術データは JSON で管理し、画面は JSON を読み込むだけで自動生成されます。

---

## 特長

- **全文検索**：技術名・概要・説明・キーワード・カテゴリを対象にリアルタイム検索（複数語 AND 検索対応）
- **カテゴリフィルタ**：AI / DX / GIS / IoT / 防災 など、複数カテゴリを同時選択して絞り込み
- **カード表示**：技術名・カテゴリ・概要・タグをカードで一覧表示（ホバーエフェクト付き）
- **詳細モーダル**：概要・特徴・適用事例・強み・関連技術・キーワード・保有部署・担当者・URL などを表示
- **タグ検索**：カード／詳細内のキーワードをクリックすると、その語で検索
- **関連技術リンク**：関連技術をクリックすると、その技術の詳細へ移動
- **ソート**：名称順 / カテゴリ順 / 新着順
- **状態表示**：検索件数・現在の検索条件（パンくず）・ローディング・No Data 表示
- **レスポンシブ対応**：PC / タブレット / スマートフォン
- **アクセシビリティ配慮**：キーボード操作、フォーカストラップ、`aria` 属性、`prefers-reduced-motion` 対応

---

## ディレクトリ構成

```
project/
├── index.html            … 画面の骨格（内容はJSONから動的生成）
├── css/
│   └── style.css         … スタイル（デザイントークンで一元管理）
├── js/
│   ├── app.js            … エントリーポイント（TechnologyManager / UIManager / App）
│   ├── search.js         … SearchManager（全文検索）
│   ├── filter.js         … FilterManager（カテゴリ絞り込み・ソート）
│   └── modal.js          … ModalManager（詳細モーダル）
├── data/
│   └── technology.json   … 技術データ（サンプル20件）
├── assets/
│   ├── icons/            … アイコン素材用
│   └── images/           … 画像素材用
└── README.md
```

### JavaScript のクラス設計（責務分離）

| クラス | ファイル | 責務 |
| --- | --- | --- |
| `TechnologyManager` | app.js | 技術データ（JSON）の読み込み・保持・ID参照・件数集計 |
| `SearchManager` | search.js | 全文検索とリアルタイム検索のデバウンス |
| `FilterManager` | filter.js | カテゴリの複数選択と絞り込み・並び替え |
| `ModalManager` | modal.js | 詳細モーダルの開閉・描画・アクセシビリティ |
| `UIManager` | app.js | DOM 描画（カード / チップ / 件数 / パンくず 等） |
| `App` | app.js | 各マネージャーの統括・イベント制御 |

---

## 使い方（ローカルでの起動）

技術データを `fetch` で読み込むため、**簡易 HTTP サーバー経由**で開いてください。
`index.html` をファイル（`file://`）で直接開くと、ブラウザのセキュリティ制限で JSON を読み込めません。

プロジェクトのルートで、いずれかを実行します。

```bash
# Python 3 が入っている場合
python3 -m http.server 8000

# Node.js が入っている場合
npx serve .
```

その後、ブラウザで <http://localhost:8000/> にアクセスします。

---

## データの追加・編集

`data/technology.json` の `technologies` 配列に項目を追加するだけで、画面へ反映されます（HTML の編集は不要）。将来的に 100〜500 件規模の登録を想定しています。

### データ項目

| キー | 型 | 必須 | 説明 |
| --- | --- | :-: | --- |
| `id` | number | ○ | 一意なID（関連技術の参照に使用） |
| `name` | string | ○ | 技術名称 |
| `category` | string[] | ○ | 技術分野（複数指定可） |
| `summary` | string | ○ | 概要（カードに表示） |
| `description` | string | ○ | 説明（詳細に表示） |
| `features` | string[] | | 特徴（箇条書き） |
| `cases` | string[] | | 適用事例（箇条書き） |
| `strength` | string | | 強み |
| `keywords` | string[] | | キーワード（タグ検索対象） |
| `related` | number[] | | 関連技術のID |
| `department` | string | | 保有部署 |
| `owner` | string | | 担当者 |
| `url` | string | | 関連URL |
| `maturity` | string | | 技術成熟度（例：実用 / 実証） |
| `registered` | string | | 登録日（`YYYY-MM-DD`／新着順ソートに使用） |

### 記述例

```json
{
  "id": 1,
  "name": "AI画像解析",
  "category": ["AI", "画像解析"],
  "summary": "画像認識技術",
  "description": "ディープラーニングによる…",
  "keywords": ["AI", "画像", "Deep Learning"],
  "related": [5, 8],
  "department": "技術開発部",
  "owner": "〇〇",
  "url": "https://example.co.jp"
}
```

> カテゴリ一覧は JSON の `categories` 配列で指定します。省略した場合はデータから自動収集されます。

---

## 設計方針・拡張性

責務ごとにクラスを分離しているため、以下のような機能を後から追加しやすい構造になっています。

- CSV 読込 / Excel 出力
- お気に入り登録
- 管理画面
- 技術比較 / ネットワーク図表示
- 組織別 / 年度別 / 技術成熟度表示
- AI 検索

例えば「お気に入り」を追加する場合は `FavoriteManager` を新設し、`App.render()` のパイプラインに絞り込みを差し込むことで、既存コードへの影響を最小限に実装できます。

---

## 動作環境

モダンブラウザ（Chrome / Edge / Firefox / Safari の最新版）を推奨します。ES6（class / async-await / テンプレートリテラル等）を使用しています。

---

## ライセンス / 注意事項

本リポジトリに含まれる技術データはサンプルです。掲載内容は実在の実績を示すものではありません。
