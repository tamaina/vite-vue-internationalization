<script setup lang="ts">
const count = $l.value.sfc.count({ n: 1 });
const choice = $l.value.env.choice({ kind: 'yes' });
const plural = $l.value.sfc.plural({ n: 1 });
</script>
<template>
  <p>{{ count }} {{ choice }} {{ plural }} {{ $l.sfc.count({ n: 1 }) }} {{ $l.env.choice({ kind: 'yes' }) }} {{ $l.sfc.plural({ n: 1 }) }}</p>
</template>
<locale locale="en" lang="json">
{ "count": "{n, number}", "plural": "{n, plural, one {One} other {#}}" }
</locale>
