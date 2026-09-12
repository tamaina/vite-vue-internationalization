<script lang="ts">
import { defineInternationalization } from 'virtual:vite-vue-internationalization';

defineInternationalization({
	'ja-JP': {
		script: {
			greeting: (values?: { name?: string }) => `こんにちは ${values?.name ?? 'Nuxt'}`,
		},
	},
	'en-US': {
		script: {
			greeting: (values?: { name?: string }) => `Hello ${values?.name ?? 'Nuxt'}`,
		},
	},
});
</script>

<script setup lang="ts">
const currentLocale = useState<string>('vvi-locale');
const count = ref(3);
</script>

<template>
  <main>
    <h1>{{ $locale.sfc.title }}</h1>
    <p>{{ $l.sfc.script.greeting({ name: 'VVI' }) }}</p>
    <p>{{ $locale.sfc.description }}</p>
    <p data-testid="count">{{ $l.sfc.count({ count }, count) }}</p>
    <button type="button" @click="count++">+1</button>
    <nav>
      <a href="?locale=ja-JP" :aria-current="currentLocale === 'ja-JP' ? 'page' : undefined">
        日本語
      </a>
      <a href="?locale=en-US" :aria-current="currentLocale === 'en-US' ? 'page' : undefined">
        English
      </a>
    </nav>
  </main>
</template>

<locale locale="ja-JP" lang="yaml">
title: Nuxt で VVI
description: Nuxt の Vite plugin 設定から Vue SFC の翻訳を読み込んでいます。
count: "項目はありません | 項目が 1 件あります | 項目が {count} 件あります"
</locale>

<locale locale="en-US" lang="yaml">
title: VVI with Nuxt
description: Vue SFC translations are loaded through Nuxt's Vite plugin configuration.
count: "No items | One item | {count} items"
</locale>
