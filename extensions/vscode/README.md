# Vite Vue Internationalization Tools

Shows errors on the YAML and JSON files configured by the
`vite-vue-internationalization/volar` plugin's `global` option in `tsconfig.json`
(or `tsconfig.*.json` / `jsconfig.json`). Install alongside Vue - Official for
SFC types and completion. This extension owns external dictionary diagnostics;
it does not register YAML or JSON as virtual Vue files.

```json
{
  "vueCompilerOptions": {
    "plugins": [{
      "name": "vite-vue-internationalization/volar",
      "primaryLocale": "en",
      "global": { "en": "./locales/en/*.yaml" }
    }]
  }
}
```

Syntax errors, invalid dictionary shapes, unsafe keys and unsupported global
sources appear in Problems with source `VVI`, on their own files. Edits update
before saving. Changes, additions and deletions (including glob matches outside
the workspace), inherited JSONC configs and config edits trigger recalculation.
Paths resolve from the consuming config directory, matching the Volar plugin.
No project plugin code is executed to read its configuration.

Use **VVI: Refresh Dictionary Diagnostics** to request a fresh calculation.
Unexpected refresh failures are recorded in the **VVI Dictionary Diagnostics**
output channel. A trusted local or remote filesystem workspace is required;
virtual web workspaces are not supported. Configurations solely in Vite config
JavaScript are not discovered: configure the Volar plugin in tsconfig as well.

## Message highlighting

Inside `<locale>` blocks, YAML/yml/JSON message values highlight named and list
interpolation (`{name}`, `{0}`), literals (`{'@'}`), plural separators (`|`) and
linked messages (`@:target`, `@.lower:target`, `@.upper:target`,
`@.capitalize:target`). Quoted, plain and block scalars are supported. Keys,
comments and other Vue blocks retain their usual highlighting.

Set `vvi.messageHighlighting` to `false` to disable this feature. It is disabled
under configurations declaring VVI `messageSyntax: "icu"`; if projects in the same
directory disagree about syntax, ICU disables it conservatively. For a Vite-only
ICU configuration, set the Volar option too or disable highlighting explicitly.
Colors follow the theme and can be overridden via `workbench.colorCustomizations`
using `vvi.message.named`, `.list`, `.literal`, `.linked` and `.plural`.

Decorations add these colors without replacing Vue - Official's semantic token
provider. Editing or removing a block immediately replaces the visible ranges.

## Build and install

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm package:editor
code --install-extension extensions/vscode/dist/vvi-tools.vsix
```

The VSIX is a separate deliverable from the npm package. Packaging does not
publish to Marketplace or install into your profile. VS Code 1.95 or later is
required; the automated extension-host fixture uses VS Code 1.95.3.

```sh
pnpm test:editor
# Headless Linux CI:
xvfb-run -a pnpm test:editor
```

The fixture uses an isolated VS Code profile and extension directory. It verifies
unsaved correction, external changes, glob add/delete and config removal without
editing an SFC or restarting the language server. Core dictionary validation and
Volar type injection have separate Vitest and real vue-tsc regression tests.
