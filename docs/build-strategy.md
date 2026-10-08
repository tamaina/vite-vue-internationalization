# ビルド戦略

[`buildStrategy`](./configuration.md) は、ロケールをどのようにバンドルへ反映するかを選びます。Vite プラグインの導入は [はじめる](./getting-started.md) を参照してください。

## 仮想モジュール（`virtual`）

仮想モジュール（`virtual`）は通常の戦略です。ロケールごとの仮想モジュールを `import()` し、Viteビルドでロケールチャンクを分離します。

## インライン化チャンク（`inline-chunks`）

インライン化チャンク（`inline-chunks`）は、ビルド時に翻訳対象チャンクをロケールごとに複製し、`$locale` / `$l` の参照をそのロケール向けの文字列リテラル、参照された部分木、またはメッセージ展開式に置換します。

主要ロケールを含む各ロケールは `*.ja-JP.js` や `*.en-US.js` のようなロケール別チャンクとして出力されます。HTML の entry script は `*.i18n-loader.js` に差し替えられ、このローダーが `locale` クエリを見て対応するロケールチャンクを読み込みます。`locale` が未指定、または未対応の場合は主要ロケールのチャンクを読み込みます。

差し替え後の `<script>` では `nonce`、`crossorigin`、`referrerpolicy` などの既存属性を保持します。元の entry script に `integrity` がある場合は、生成された loader 用の integrity に差し替えます。loader は選択したロケールチャンクを `modulepreload` とロケールチャンクごとの integrity で検証してから `import()` します。

### import した Vue の辞書

翻訳定義のある Vue を静的に import した場合も、`Messages.$locale.title` や `Messages.$l.count({ n })` をインライン化します。翻訳専用 Vue に加え、`<template>` / `<script>` を持つ通常のコンポーネントや `defineInternationalization()` で定義した辞書も対象です。

利用側は Vue の script / template と通常の TS / JS に対応します。利用側自身に翻訳定義がなくても、`sfcTransform: 'locale-sources'` のまま変換されます。import しただけで利用側に暗黙の `$locale` / `$l` が追加されることはありません。

```ts
import Messages from '@/messages.vue';

const title = Messages.$locale.title;
const texts = Messages.$locale;
const read = (key: keyof typeof texts) => texts[key];
const format = Messages.$l.greeting;
```

静的参照は値や部分辞書へ展開し、動的キー、辞書の別名、分割代入、localizer の別名では実行時に必要な辞書や関数を保持します。コンポーネント自体を別名に代入した場合も、コンポーネントに付与された辞書を利用できます。元の import は保持し、通常コンポーネントの副作用・描画・スタイルを維持します。

パスは Vite の resolver で解決するため、相対・絶対パスと `resolve.alias` に対応します。TypeScript の `paths` は Vite 側でも解決できる設定が必要です。直接 import した Vue の辞書は初期スキャン範囲外でも収集します。type-only import、`?raw` / `?url`、external や仮想モジュールは対象外です。barrel 経由の再 export や動的 `import()` を追跡する最適化は行いません。

### インライン化できない参照

静的な `$locale.sfc.title`、`$locale.env.title`、`$l.sfc.count({ n })` はロケール別の文字列リテラルまたはメッセージ展開式へ置換されます。`$locale.env.labels[key]` のように途中から動的キーになる参照は、解決できる静的な部分木だけをロケール別オブジェクトとして埋め込み、実行時の lookup 式を残します。`unref` や関数への引数など、静的置換後にも参照が残る locale helper オブジェクトには、そのロケールの辞書を保持します。参照が残らないオブジェクトの辞書は削減できます。

最適化できない参照は、そのロケールのオブジェクト lookup や呼び出し可能な localizer を残します。翻訳が欠けている場合は主要ロケールの値にフォールバックし、それもなければ `$locale.sfc.missingKey` のようなキー文字列を返します。置換できない JavaScript はそのまま黙って残さず、ビルド時エラーになります。

この戦略はロケール数に比例して出力ファイル数と合計配信サイズが増えます。

関連 API:

- [`VueInternationalizationOptions`](./api.md#vueinternationalizationoptions)
- [`vueInternationalization()`](./api.md#vueinternationalization)
- [`createInternationalization()`](./api.md#createinternationalization)

次に読む:

- プラグインオプションは [設定](./configuration.md)
- 実行時のセットアップは [はじめる](./getting-started.md)
