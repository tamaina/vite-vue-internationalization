<script setup lang="ts">
// const $locale = commentOnly; const $l = commentOnly;
import { defineAsyncComponent, ref } from 'vue';
const Lazy = defineAsyncComponent(() => import('./Lazy.vue'));
const count = ref(1);
const missingKey = ref('missing');
const localizers = $l;
</script>
<template>
  <code id="literal-text">$locale.sfc.title</code>
  <code id="literal-expression">{{ '$locale.sfc.title' }}</code>
  <span id="computed-key">{{ $locale.sfc.items['a' /* ] */].title }}</span>
  <code id="missing-raw">{{ $locale.sfc[missingKey] }}</code>
  <code id="missing-localizer">{{ localizers.sfc.items.a[missingKey]() }}</code>
  <code id="scalar-localizer">{{ localizers.sfc.scalar() }}</code>
  <span id="linked-repeat">{{ $l.sfc.linked() }}</span>
  <code id="raw-null">{{ JSON.stringify([$locale.sfc.nullable]) }}</code>
  <code id="raw-shape">{{ JSON.stringify($locale.sfc.shape) }}</code>
  <p id="global">{{ $locale.env.appName }}</p>
  <span id="fallback">{{ $locale.sfc.fallback }}</span>
  <button @click="count++">{{ $locale.sfc.title }}: {{ $l.sfc.count({ n: count }) }}</button>
  <Lazy />
</template>
<locale locale="ja-JP" lang="json">
{"fallback": "共通fallback", "title": "日本語", "count": "{n} 件", "scalar": 4, "linked": "@:twice", "twice": "@:word @:word", "word": "Nested", "items": {"a": {"title": "computed"}}, "nullable": null, "shape": {"nested": "Primary"}}
</locale>
<locale locale="en-US" lang="json">
{"title": "English", "count": "{n} items", "items": {"a": {"title": "computed"}}, "shape": 4}
</locale>
<style scoped>
button { color: rgb(20, 40, 60); }
</style>
