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

### mixed strategyとscoped CSS

server/clientで同じプロジェクトrootを使い、両方の`@vitejs/plugin-vue`を
`vue({ features: { componentIdGenerator: 'filepath' } })`で設定してください。
Vueの本番時の既定値は変換後SFCソースをscope IDへ含めるため、VVIのvirtualとinlineで
異なるIDになり、サーバーHTMLへclient CSSが適用されなくなります。
filepath設定なら両側で一致します。独自ID生成を使う場合も両側で同じ値を返してください。

## SSR用client assetの解決

clientビルドは`.vite/internationalization-manifest.json`を出力します。
サーバーはこのJSONをビルドデータとして読み、NodeのfilesystemやVueに依存しない
`vite-vue-internationalization/ssr`から解決できます。

```ts
import { resolveLocaleAssets, type LocaleAssetManifest } from 'vite-vue-internationalization/ssr';
import clientManifest from '../dist/client/.vite/internationalization-manifest.json';

const context: import('vue/server-renderer').SSRContext = {};
const html = await renderToString(app, context);
const assets = resolveLocaleAssets(clientManifest as LocaleAssetManifest, {
  locale: internationalization.locale,
  entry: 'src/entry-client.ts',
  modules: context.modules,
});
```

`assets.entry.href`をmodule script、`assets.stylesheets`をstylesheet、
`assets.modulepreload`をmodulepreloadとしてHTMLへ出します。各要素には出力ファイル名
`file`、URLの`href`、利用可能な`integrity`が含まれます。integrity付きmodulepreloadには
`crossorigin`も指定し、属性はHTMLレンダラーでエスケープしてください。
SSRで使用した遅延componentのJS/CSSと静的importを含め、未使用の遅延componentは先読みしません。
循環importは重複排除します。未対応locale、未知のentry/module、欠落chunkは例外になります。

追加moduleの対応にはVite SSR manifestを`ssrManifest`へ渡せます。
参照先がVVIのclient graphにない場合は、別localeのassetを黙って採用せず例外にします。
通常のVue SSR contextはVVI自身のmodule mapで解決できます。

`base: './'`／`base: ''`では、`assetBaseUrl`に配信rootの絶対URL
（例：`https://example.com/application/`）を指定します。現在の深いrouteではなく配信rootを
使うため、ページのパスでassetのURLが変わりません。`base`の上書きにはroot相対prefixやCDN URLも使えます。

### 環境別ビルド

`buildStrategy: 'inline-chunks'`はclientの最適化を選びます。
`config.consumer`が`server`の環境は、名前が`ssr`でなくても常に`virtual`を使います。
辞書・hash・manifest・formatter参照は環境ごとに保持し、server側にはclient assetを出しません。

`@vitejs/plugin-vue` 6を同一Nodeプロセスで使う場合、client/serverは**順にビルド**してください。
Vue pluginのdescriptor cacheがモジュール共通で、同じSFCの異なる変換結果を並行保持できないためです。
fixtureは同じVVI instanceで`createBuilder`を使い、`await builder.build(client)`、
`await builder.build(edge)`の順で検証しています。別プロセスでビルドする方法もあります。
これはVue pluginとの統合上の制約です。両環境で前述のfilepathによるscope ID設定も揃えてください。

ブラウザーのlocale selector loaderは、ナビゲーション時にlocaleを選ぶclient-onlyページ向けです。
`data-vvi-locale`があればそれを優先します。SSRではresolverから既知のlocaleのentryへ直接リンクします。
locale別chunkは`data-vvi-locale`との不一致を検出して例外にし、別言語でのhydrationを継続しません。
