<script setup lang="ts">
// const $locale = commentOnly; const $l = commentOnly;
import { defineAsyncComponent, ref } from 'vue';
const Lazy = defineAsyncComponent(() => import('./Lazy.vue'));
const count = ref(1);
const values = { a: 1, b: 2, n: 1234.5, date: 0 };
const results = [
  $l.value.sfc.adjacent(values),
  $l.value.sfc.number(values),
  $l.value.sfc.currency(values),
  $l.value.sfc.date(values),
  $l.value.sfc.ordinal({ n: 22 }),
  $l.value.sfc.offset({ n: 4 }),
  $l.value.sfc.select({ kind: 'yes', n: 1234 }),
];
</script>
<template>
  <code id="literal-text">$locale.sfc.title</code>
  <code id="literal-expression">{{ '$locale.sfc.title' }}</code>
  <p id="global">{{ $locale.env.appName }}</p>
  <span id="fallback">{{ $locale.sfc.fallback }}</span>
  <button @click="count++">{{ $locale.sfc.title }}: {{ $l.sfc.count({ n: count }) }}</button>
  <pre id="parity">{{ JSON.stringify(results) }}</pre>
  <span id="adjacent">{{ $l.sfc.adjacent(values) }}</span>
  <Lazy />
</template>
<locale locale="ja-JP" lang="json">
{
  "fallback": "共通fallback", "title": "日本語", "count": "{n} 件",
  "adjacent": "{a}{b}", "number": "{n, number}", "currency": "{n, number, ::currency/USD}",
  "date": "{date, date, ::yyyyMMdd}",
  "ordinal": "{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}",
  "offset": "{n, plural, offset:1 one {one} other {#}}",
  "select": "{kind, select, yes {{n, number}} other {No}}"
}
</locale>
<locale locale="en-US" lang="json">
{ "title": "English", "count": "{n} items" }
</locale>
<style scoped>
button { color: rgb(20, 40, 60); }
</style>
