# Message Syntax

[`messageSyntax`](./configuration.md) is selected per project. Mixing `vue` and `icu` syntax per dictionary is not supported.

## Vue syntax

`vue` syntax is a lightweight format close to [vue-i18n message format syntax](https://vue-i18n.intlify.dev/guide/essentials/syntax).

```yaml
named: "Hello {user-name}"
list: "{0} and {1} translations"
plural: "no apples | one apple | {count} apples"
target: "linked message"
linked: "@.capitalize:target"
```

## ICU syntax

`icu` syntax is handled by [FormatJS ICU Message syntax](https://formatjs.github.io/docs/core-concepts/icu-syntax/).

```yaml
hello: "Hello {name}"
apples: "{count, plural, =0 {No apples} one {One apple} other {# apples}}"
```

Related API:

- [`formatLocaleMessage()`](../api.md#formatlocalemessage)
- [`getLocaleMessageNamedKeys()`](../api.md#getlocalemessagenamedkeys)
- [`getLocaleMessageListIndexes()`](../api.md#getlocalemessagelistindexes)
- [`hasLocaleMessagePlural()`](../api.md#haslocalemessageplural)
- [`LocaleMessageSyntax`](../api.md#localemessagesyntax)

## Build-strategy consistency

For Vue-style localizers, a numeric first argument supplies both `count` and `n`
and selects the plural case, taking priority over the second argument. With an
object or list first argument, only the explicit second argument selects plural;
`values.n` and `values.count` do not implicitly select it. Without a selection the
choice is 1. Inline builds now follow this runtime rule (a behavior correction
for inline callers relying on implicit object-field selection).

Both strategies return strings for interpolations, including adjacent numeric
values, and preserve value/plural argument evaluation order. Message functions
receive the same normalized numeric arguments. Missing Vue placeholders remain
`{name}` / `{0}`; missing localizer keys use `$locale.sfc.key` or `$locale.env.key`.
ICU uses the same IntlMessageFormat formatter in both strategies, including number,
date/time styles and skeletons. Invalid ICU messages or missing required ICU
arguments throw; they are not silently treated as raw values. Inline ICU bundles
include a shared formatter chunk. Static Vue text remains inlined.

## VS Code syntax highlighting

The separate **Vite Vue Internationalization Tools** extension colors interpolation,
literals, plural separators and linked messages in YAML / JSON values inside
`<locale>` blocks. Keys, comments and other Vue blocks are excluded. Disable it
with `vvi.messageHighlighting: false`. Projects configured with VVI
`messageSyntax: "icu"` in Volar do not receive these Vue message decorations.
See [editor diagnostics](./getting-started.md#editor-diagnostics-for-external-dictionaries)
for installation.

Missing-key fallback is shared by static access, dynamic lookup and aliases.
`$locale.sfc[key]` returns the corresponding `$locale.sfc.key` string, as does
`$l.sfc[key]()`. Use `$locale` for raw numeric or boolean values; calling those
entries through `$l` returns the key fallback rather than treating them as message
strings. Nested linked messages retain the locale, and repeated references to the
same message are not treated as cycles. These are strategy-consistency fixes;
applications relying on the previous scalar stringification or linked-message
results will see corrected output.

Explicit raw `null` and scalar values override the primary-language value. Only
undefined keys fall back to the primary language. Missing-key names containing
`{}` or `|` are returned literally, without interpolation or plural parsing.
