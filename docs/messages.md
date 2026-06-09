# メッセージ定義

このページでは翻訳メッセージの置き場所を扱います。プラグインオプションの指定方法は [設定](./configuration.md)、プレースホルダー（`placeholder`）や複数形選択（`plural`）の書き方は [メッセージ構文](./message-syntax.md) を参照してください。

## SFC の `<locale>` ブロック

Vue SFC にはロケールごとに `<locale>` カスタムブロックを書けます。`lang` は `yaml` または `json` を指定できます。

```vue
<template>
  <h1>{{ $locale.sfc.title }}</h1>
  <p>{{ $l.sfc.count({ n }) }}</p>
</template>

<script setup lang="ts">
const n = 3;
</script>

<locale locale="ja-JP" lang="yaml">
title: りんご
count: "{n} 個のりんご"
</locale>

<locale locale="en-US" lang="yaml">
title: Apples
count: "{n} apples"
</locale>
```

SFC 内のメッセージは `$locale.sfc` と `$l.sfc` から参照します。`$locale` は翻訳値をそのまま返し、`$l` はメッセージ関数を返します。

`<script setup>` 内で使う場合、注入される `$locale` と `$l` は computed ref です。template では `$locale.sfc.title` / `$l.sfc.count({ n })` のまま使い、script では `.value` を経由してください。

```vue
<script setup lang="ts">
const title = $locale.value.sfc.title;
const countText = $l.value.sfc.count({ n: 3 });
</script>
```

コンポーネント固有のメッセージは、同じ SFC の `<locale>` ブロック、またはトップレベルの `defineInternationalization()` に置くのがおすすめです。ローカルメッセージを持たない SFC で `$locale.env` / `$l.env` だけを使いたい場合は、空の辞書を追加して変換対象にするのではなく、`sfcTransform: "all"` を設定してください。通常の `.ts` モジュールに処理を分離する場合は、仮想モジュールの `useLocale()` / `useLocalizer()` を使います。

同じ SFC に同一ロケールの `<locale>` ブロックが複数ある場合は再帰的に統合され、後のブロックの値が優先されます。

## グローバル辞書

アプリ全体で共有する翻訳は `global` オプションに置きます。グローバルメッセージは `$locale.env` と `$l.env` から参照します。

```json
{
  "vueCompilerOptions": {
    "plugins": [
      {
        "name": "vite-vue-internationalization/volar",
        "primaryLocale": "ja-JP",
        "global": {
          "ja-JP": "./src/locales/ja-JP/**/*.yaml",
          "en-US": [
            "./src/locales/en-US/base.yaml",
            "./src/locales/en-US/features/**/*.yaml"
          ]
        }
      }
    ]
  }
}
```

```yaml
# src/locales/ja-JP/base.yaml
appName: サンプル
navigation:
  home: ホーム
```

```vue
<template>
  <p>{{ $locale.env.appName }}</p>
  <p>{{ $locale.env.navigation.home }}</p>
</template>
```

`global` の各ロケールにはオブジェクト、ファイルパス、glob、またはパスの配列を指定できます。複数ファイルに同じキーパスがある場合は警告を出し、後から読み込まれたファイルの値で上書きします。

## 単体メッセージ SFC

`<template>` や `<script>` を持たない単体メッセージ SFC も使えます。コンポーネントから独立した型付きメッセージモジュールとして翻訳を置きたい場合に使います。

```vue
<!-- messages.vue -->
<locale locale="ja-JP" lang="yaml">
title: locale だけの Vue ファイル
body: "{source} から import した翻訳です"
</locale>

<locale locale="en-US" lang="yaml">
title: Locale-only Vue file
body: "This message was imported from {source}"
</locale>
```

```ts
import Messages from './messages.vue';

Messages.$locale.title;
Messages.$l.body({ source: 'messages.vue' });
```

## スクリプト定義メッセージ

通常の `<script lang="ts">` または `<script setup lang="ts">` のトップレベルで `defineInternationalization()` を使うと、TypeScript で辞書を定義できます。メッセージ関数を末端値として置きたい場合に便利です。

この抽出対象は Vue SFC の `<script>` です。通常の `.ts` ファイルに `defineInternationalization()` を書いても、ローカル辞書としては収集されません。コンポーネントから独立したローカル辞書が必要な場合は、`.ts` ではなく [単体メッセージ SFC](#単体メッセージ-sfc) を使ってください。

```vue
<script lang="ts">
import { defineInternationalization } from 'vite-vue-internationalization';

defineInternationalization({
  'ja-JP': {
    greeting: (values?: { name?: string }) => `こんにちは ${values?.name ?? '名無し'}`,
  },
  'en-US': {
    greeting: (values?: { name?: string }) => `Hello ${values?.name ?? 'there'}`,
  },
});
</script>
```

`buildStrategy: 'inline-chunks'` やスクリプト定義ロケールの抽出では、関数をソースとして出力します。外側のクロージャーに依存しない自己完結した関数にしてください。

関連 API:

- [`defineInternationalization()`](./api.md#defineinternationalization)
- [`LocaleDictionary`](./api.md#localedictionary)
- [`LocaleMessages`](./api.md#localemessages)
