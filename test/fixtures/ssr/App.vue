<script setup lang="ts">
import { ref } from 'vue';
const count = ref(1);
</script>
<template>
  <button @click="count++">{{ $locale.sfc.title }}: {{ $l.sfc.count({ n: count }) }}</button>
</template>
<locale locale="ja-JP" lang="json">
{ "title": "日本語", "count": "{n} 件" }
</locale>
<locale locale="en-US" lang="json">
{ "title": "English", "count": "{n} items" }
</locale>
<style scoped>
button { color: rgb(20, 40, 60); }
</style>
