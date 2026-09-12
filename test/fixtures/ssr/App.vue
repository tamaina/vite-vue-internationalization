<script setup lang="ts">
// const $locale = commentOnly; const $l = commentOnly;
import { defineAsyncComponent, ref } from 'vue';
const Lazy = defineAsyncComponent(() => import('./Lazy.vue'));
const count = ref(1);
</script>
<template>
  <code id="literal-text">$locale.sfc.title</code>
  <code id="literal-expression">{{ '$locale.sfc.title' }}</code>
  <p id="global">{{ $locale.env.appName }}</p>
  <span id="fallback">{{ $locale.sfc.fallback }}</span>
  <button @click="count++">{{ $locale.sfc.title }}: {{ $l.sfc.count({ n: count }) }}</button>
  <Lazy />
</template>
<locale locale="ja-JP" lang="json">
{ "fallback": "共通fallback", "title": "日本語", "count": "{n} 件" }
</locale>
<locale locale="en-US" lang="json">
{ "title": "English", "count": "{n} items" }
</locale>
<style scoped>
button { color: rgb(20, 40, 60); }
</style>
