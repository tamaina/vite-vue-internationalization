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
