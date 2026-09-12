import { copyFileSync } from 'node:fs';
import { createVSIX } from '@vscode/vsce';
copyFileSync('LICENSE', 'extensions/vscode/LICENSE');
await createVSIX({ cwd: 'extensions/vscode', dependencies: false, packagePath: 'extensions/vscode/dist/vvi-tools.vsix' });
