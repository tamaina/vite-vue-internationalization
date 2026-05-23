# vue-internationalization

## モチベーション1
### 1: Vueのファイル内でカスタムブロックを使ってinternationalizationを定義

`locale`カスタムブロックの中でyamlやjsonで定義します。  
プライマリ言語をViteなどで情報提供し、プライマリ言語からtemplate/script内で型推測が効くようにします。

もちろんパーツはグローバルでも定義できるようにします。

```vue
<script lang="ts" setup>
// nothing to do
</script>

<template>
  <div :class="$style.hoge">{{ $locale.sfc.hoge }}</div>
  <span>{{ $locale.env.fuga }}</span>
</template>

<style lang="scss" module>
.hoge {
  color: #f00;
}
</style>

<locale locale="ja-JP" lang="yaml">
hoge: ほげ
</locale>

<locale locale="en-US" lang="yaml">
hoge: foo
nApples: {n} apples
</locale>
```

## モチベーション2
Viteにおいて、Vueファイルの各言語版に言語部分を置き換え分離し、チャンクを発生させ、クライアントで言語を選択することでチャンクを読み替えられるようにする

## 現在の実装

- Vite plugin: `vueInternationalization({ primaryLocale, global })`
- Runtime: `virtual:vue-internationalization` から `createInternationalization()` / `useLocale()` を提供
- Vue SFC の `<locale locale="..." lang="yaml|json">` を収集
- 同じ SFC に同一 locale の `<locale>` ブロックが複数ある場合は再帰的にマージし、後のブロックの値で上書きする
- `<locale>` ブロックを Vue plugin に渡す前に除去し、`script setup` に `$locale` binding を自動注入
- locale ごとの仮想モジュールを `import()` するため、Vite build で locale chunk が分離される
- `buildStrategy: 'inline-chunks'` を指定すると、build 時に Vue chunk を locale ごとに複製し、`$locale` の中身を直接 JSON に置換する
- グローバル辞書は plugin option の `global` で locale ごとに YAML/JSON ファイルまたは object を指定可能

## 使い方

```ts
// vite.config.ts
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { vueInternationalization } from 'vue-internationalization';

export default defineConfig({
  plugins: [
    vueInternationalization(),
    vue()
  ]
});
```

```json
// tsconfig.json
{
  "vueCompilerOptions": {
    "plugins": [
      {
        "name": "vue-internationalization/volar",
        "primaryLocale": "ja-JP",
        "buildStrategy": "inline-chunks",
        "scan": {
          "include": "src/**/*.vue",
          "exclude": ["src/legacy/**"]
        },
        "localizerDocumentation": false,
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

`vueInternationalization()` に options を渡さない場合、Vite plugin は `tsconfig.json` の `vueCompilerOptions.plugins` から `vue-internationalization/volar` 設定を読みます。VS Code / Vue Language Tools も同じ設定を使うため、`primaryLocale` や `global` を二重管理する必要はありません。
`global` の各 locale には object、ファイルパス、glob、またはパス配列を指定できます。複数ファイルに同じ key path がある場合は warning を出し、後から読み込まれたファイルの値で上書きします。
`scan.include` / `scan.exclude` は Vite plugin が起動時に収集する Vue ファイルを絞り込むための glob です。大きいリポジトリでは `src/**/*.vue` のように対象を限定してください。
`localizerDocumentation: false` を指定すると、Volar が `$l` の hover 用 JSDoc を生成しません。巨大な辞書でエディターの応答が重い場合に有効です。

```ts
// main.ts
import { createApp } from 'vue';
import { createInternationalization } from 'virtual:vue-internationalization';
import App from './App.vue';

const app = createApp(App);
const internationalization = createInternationalization();

app.use(internationalization);
await internationalization.ready;
app.mount('#app');
```

初期 locale は `?locale=en-US` のような URL query から決まります。locale を切り替える場合は Vue runtime state を差し替えず、URL を変更して対応する locale entry で起動し直します。

`$locale` は翻訳値をそのまま返し、`$l` は同じ `global` / `module` scope の localizer 関数を返します。
`$l` の文字列メッセージは vue-i18n の message format syntax に寄せた構文を解釈します。

```vue
<script setup lang="ts">
const n = 3;
</script>

<template>
  <p>{{ $locale.sfc.title }}</p>
  <p>{{ $l.sfc.nApples({ n: 3 }) }}</p>
  <p>{{ $l.sfc.named({ 'user-name': 'Vue' }) }}</p>
  <p>{{ $l.sfc.list(['SFC', 'local']) }}</p>
  <p>{{ $l.sfc.literal() }}</p>
  <p>{{ $l.sfc.plural({ count: n }, n) }}</p>
  <p>{{ $l.sfc.linked() }}</p>
</template>

<locale locale="ja-JP" lang="yaml">
title: りんご
nApples: "{n} 個のりんご"
named: "こんにちは {user-name}"
list: "{0} と {1} の翻訳"
literal: "{'@'} は linked message ではありません"
plural: "りんごなし | りんご 1 個 | りんご {count} 個"
target: "リンク先メッセージ"
linked: "@.upper:target"
</locale>
```

対応している message syntax:

- named interpolation: `{name}` / `{user-name}`
- list interpolation: `{0}` / `{1}`
- literal interpolation: `{'@'}` / `{"@"}`
- pluralization: `no apples | one apple | {count} apples`
- linked messages: `@:target` / `@.lower:target` / `@.upper:target` / `@.capitalize:target`

pluralization は `$l.sfc.key(plural)` または `$l.sfc.key(values, plural)` で選択します。2 variants の場合は `1` が先頭、それ以外が後続です。3 variants 以上の場合は `0` / `1` / other の順に選択します。
linked message は同じ scope の root から key path を解決します。未解決の linked message や循環参照は `@:key` の表示で停止します。

現時点では `<i18n-t>` 相当の component interpolation は未実装です。文字列 localizer と inline build 置換が対象です。

`virtual:vue-internationalization` の型を使う場合は、アプリ側の `env.d.ts` に追加します。

```ts
/// <reference types="vue-internationalization/virtual" />
```

## サンプル

```sh
pnpm install
pnpm build
pnpm --dir examples/motivation-1 dev
```

production build では `ja-JP` / `en-US` が別 chunk として出力されます。
`buildStrategy: 'inline-chunks'` の場合、primary locale は通常の chunk に埋め込まれ、その他の locale は `*.en-US.js` のような別ファイルとして出力されます。
このモードでは HTML loader が `locale` query を見て locale chunk を選択します。
`inline-chunks` は localizable chunk を locale ごとに複製するため、locale 数に比例して出力ファイル数と合計配信サイズが増えます。多数の locale を扱う場合は、通常の `virtual` strategy の chunk splitting を優先してください。

```sh
pnpm --dir examples/motivation-1 build
```

## テスト

```sh
pnpm test
pnpm typecheck
```
