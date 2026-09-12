<script setup lang="ts">
const count = $l.value.sfc.count({ n: 1 });
const choice = $l.value.env.choice({ kind: 'yes' });
</script>
<template>
  <p>{{ count }} {{ choice }} {{ $l.sfc.count({ n: 1 }) }} {{ $l.env.choice({ kind: 'yes' }) }}</p>
</template>
<locale locale="en" lang="json">
{ "count": "{n, number}", "plural": "{n, plural, one {One} other {#}}" }
</locale>
