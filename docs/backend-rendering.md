# バックエンド HTML 描画

VVI は Vite プラグインとして Vue SFC を変換し、`virtual:vite-vue-internationalization` から runtime module を提供します。Cloudflare Workers のように Vite プラグインで Worker をビルドする環境では、同じ仕組みで Vue を HTML 文字列に描画できます。

```ts
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createInternationalization } from 'virtual:vite-vue-internationalization';
import App from './App.vue';

export default {
  async fetch(request: Request) {
    const locale = new URL(request.url).searchParams.get('locale') ?? 'ja-JP';
    const app = createSSRApp(App);
    const internationalization = createInternationalization({ initialLocale: locale });

    app.use(internationalization);
    await internationalization.ready;

    return new Response(await renderToString(app), {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  },
};
```

SSR では `createSSRApp()` で作る Vue app と、その app に `install()` する VVI instance をリクエスト間で共有しないでください。上の例では、選択された locale を `initialLocale` に渡してリクエストごとに instance を作成し、`await internationalization.ready` の後で `renderToString()` を呼びます。辞書データや loader の定義は module scope に置けますが、描画中の app / instance を共有すると並行リクエストの locale が混ざる可能性があります。

`createInternationalization({ initialLocale })` は `initialLocale` の locale bundle だけを読み込みます。全 locale を毎回読み込むわけではありません。Worker の同じ isolate 内では dynamic import された module は通常キャッシュされるため、2 回目以降の同じ locale は module 解決のコストも小さくなります。速度が気になる場合でも、app / instance を共有して最適化するのではなく、locale loader や最終的な HTML など、リクエスト状態を持たない層でキャッシュしてください。

Cloudflare Workers では `@cloudflare/vite-plugin` と `@vitejs/plugin-vue` に加えて VVI を登録します。

```ts
import { cloudflare } from '@cloudflare/vite-plugin';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { vueInternationalization } from 'vite-vue-internationalization';

export default defineConfig({
  plugins: [
    vueInternationalization(),
    vue(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
  ],
});
```

`inline-chunks` はブラウザ配信用のチャンクを locale ごとに分ける最適化です。Worker やメール送信用のバックエンド描画では、まず標準の `virtual` 戦略を使ってください。

軽い動作例は `examples/cloudflare-worker-ssr` にあります。

Nuxt での動作確認用には `examples/nuxt` があります。この例では `nuxt.config.ts` の `vite.plugins` に VVI を登録し、Nuxt plugin で `createInternationalization({ initialLocale })` を Vue app に install します。Nuxt は Vite をビルドツールとして使えますが、サーバー実行は Nitro の仕組みに乗るため、Cloudflare Workers example と同じ構成としては扱いません。他の SSR フレームワークで使う場合も、そのフレームワークが Vite の SFC 変換と `virtual:vite-vue-internationalization` の解決をどの層で扱うかを確認してください。

## リクエストに属するヘルパーとロード失敗

サーバーではinstall時に暗黙のグローバルinstanceを設定しません。
setup内はVueの注入を使い、setup外（await後を含む）では要求のinstanceを明示します。

```ts
const locale = useLocale('/src/App.vue', internationalization);
const localizer = useLocalizer('/src/App.vue', internationalization);
const staticLocale = createComponentLocale('/src/App.vue', internationalization);
const staticLocalizer = createComponentLocalizer('/src/App.vue', internationalization);
const format = useNumberFormat(internationalization);
```

`useInternationalization(instance)`、`useDateTimeFormat(instance)`も対応します。
明示instanceは注入より優先します。どちらもない場合はエラーです。
`setActiveInternationalization()`は互換用の明示的opt-inとして残しますが、
並行SSRでは使わないでください。ブラウザーのinstallによる従来のfallbackは維持します。

`ready`は初期ロード失敗時にrejectするようになります。従来のログ出力と正常解決からの
互換性変更です。renderやmountの前でcatchし、エラー画面などを選択してください。
同じinstance・localeの並行ロードはPromiseを共有します。失敗はキャッシュに残さず、
`loadLocale(locale)`で再試行できます。元の`ready`は置き換わらないため、再試行の
Promiseをawaitしてください。異なるinstanceのロード状態は共有しません。

## hydration時のlocale引継ぎ

server/clientが`virtual`の構成では、サーバーで決定した言語を
`<html lang="en-US" data-vvi-locale="en-US">`として渡します。
生成client runtimeはURLより`data-vvi-locale`を優先し、未対応の指定はエラーにします。
サーバーでは公開`locales`から選び、属性値はHTMLレンダラーでエスケープしてください。
clientは`createSSRApp()`で作成してinstanceをinstallし、`ready`をawaitした後にmountします。
fallbackやformat設定も両側で揃えてください。属性がない場合は従来のURL／primary localeを使います。
`currentLocale`はモジュール単位のブラウザー向け既定値であり、SSR要求の状態ではありません。
サーバーは引き続き`initialLocale`を明示します。

`pnpm test:ssr`は`test/fixtures/ssr`の本番client/serverビルドとChromiumでhydrationを検証します。
上記Workers exampleはHTML生成専用の例です。
