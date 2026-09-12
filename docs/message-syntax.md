# メッセージ構文

[`messageSyntax`](./configuration.md) はプロジェクト全体で `vue` または `icu` を選びます。辞書ごとの混在はサポートしません。型生成に使うヘルパーの詳細は [API リファレンス](./api.md) にあります。

## Vue I18n 互換構文（`vue`）

Vue I18n 互換構文（`vue`）は [vue-i18n のメッセージ形式](https://vue-i18n.intlify.dev/guide/essentials/syntax) に寄せた軽量構文です。

```yaml
named: "こんにちは {user-name}"
list: "{0} と {1} の翻訳"
literal: "{'@'} は linked message ではありません"
plural: "りんごなし | りんごひとつ | りんご {count} 個"
target: "リンク先メッセージ"
linked: "@.upper:target"
```

対応している構文:

- 名前付き埋め込み（`named interpolation`）: `{name}` / `{user-name}`
- リスト埋め込み（`list interpolation`）: `{0}` / `{1}`
- リテラル埋め込み（`literal interpolation`）: `{'@'}` / `{"@"}`
- 複数形選択（`pluralization`）: `no apples | one apple | {count} apples`
- リンクメッセージ（`linked messages`）: `@:target` / `@.lower:target` / `@.upper:target` / `@.capitalize:target`

## ICU メッセージ構文（`icu`）

ICU メッセージ構文（`icu`）は [FormatJS ICU Message syntax](https://formatjs.github.io/docs/core-concepts/icu-syntax/) のパーサーと実行時処理で扱います。

```yaml
hello: "Hello {name}"
apples: "{count, plural, =0 {No apples} one {One apple} other {# apples}}"
invite: "{gender, select, female {She invited {count, plural, one {one guest} other {# guests}}} other {They invited {count, plural, one {one guest} other {# guests}}}}"
```

ICU メッセージ構文（`icu`）では、リンクメッセージ構文やパイプ区切りの複数形選択（`pipe plural`）は使いません。

関連 API:

- [`formatLocaleMessage()`](./api.md#formatlocalemessage)
- [`getLocaleMessageNamedKeys()`](./api.md#getlocalemessagenamedkeys)
- [`getLocaleMessageListIndexes()`](./api.md#getlocalemessagelistindexes)
- [`hasLocaleMessagePlural()`](./api.md#haslocalemessageplural)
- [`LocaleMessageSyntax`](./api.md#localemessagesyntax)

次に読む:

- `messageSyntax` の設定場所は [設定](./configuration.md)
- 実行時に `$l` を使う流れは [はじめる](./getting-started.md)

## ビルド戦略間の意味の一致

Vue形式のlocalizerでは、第1引数が数値なら`count`と`n`へその値を渡し、
plural選択にも使います。この場合は第2引数より優先します。
第1引数がobject/listの場合は第2引数だけでpluralを選択し、`values.n`や
`values.count`から暗黙には選びません。選択値がない場合は1です。
inlineもこのruntimeの規則へ統一しました。objectのフィールドからの暗黙選択に
依存していたinline呼び出しは、第2引数を指定してください。

両戦略とも隣接する数値を含め補間結果は文字列になり、values/pluralの評価順序を保ちます。
関数翻訳にも正規化済みの数値引数を渡します。未指定のVue placeholderは`{name}`／`{0}`、
存在しないlocalizer keyは`$locale.sfc.key`／`$locale.env.key`を返します。
ICUは両戦略で同じIntlMessageFormatを使い、number・date/time・style・skeletonを扱います。
不正なICUメッセージや必須引数欠落は例外です。inline ICUには共有formatter chunkが含まれます。
静的なVue文字列のインライン化は維持します。

## VS Code の構文ハイライト

別拡張 **Vite Vue Internationalization Tools** は `<locale>` 内の YAML / JSON の値に
補間・リテラル・複数形の区切り・リンクメッセージの色を付けます。キー、コメント、
他の Vue ブロックは対象外です。`vvi.messageHighlighting: false` で無効にできます。
Volar 設定が `messageSyntax: "icu"` のプロジェクトでは無効になります。
導入方法は [外部辞書のエディター診断](./getting-started.md#外部辞書のエディター診断) を参照してください。
