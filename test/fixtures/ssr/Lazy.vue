<script setup lang="ts">
import { onMounted, ref } from 'vue';
const ready = ref(false);
onMounted(() => { ready.value = true; });
</script>
<template><p id="lazy" :data-ready="ready">{{ $locale.sfc.title }}</p></template>
<locale locale="ja-JP" lang="json">{"title":"遅延日本語"}</locale>
<locale locale="en-US" lang="json">{"title":"Lazy English"}</locale>
<style scoped>#lazy { color: rgb(60, 40, 20) }</style>
