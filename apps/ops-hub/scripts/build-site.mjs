import { mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const [html, app, calendar, css, workspace, workspaceCss, editorModel, editor, editorCss, theme, stitchCss, worker, workspaceWorker, editorWorker] = await Promise.all(
  ['index.html', 'app.js', 'calendar.js', 'calendar.css', 'workspace.js', 'workspace.css', 'editor-model.js', 'editor.js', 'editor.css', 'theme.js', 'stitch.css', 'worker.mjs', 'workspace-worker.mjs', 'editor-worker.mjs'].map(read),
);
const assets = {
  '/': { type: 'text/html; charset=utf-8', body: html },
  '/app.js': { type: 'text/javascript; charset=utf-8', body: app },
  '/calendar.js': { type: 'text/javascript; charset=utf-8', body: calendar },
  '/calendar.css': { type: 'text/css; charset=utf-8', body: css },
  '/workspace.js': { type: 'text/javascript; charset=utf-8', body: workspace },
  '/workspace.css': { type: 'text/css; charset=utf-8', body: workspaceCss },
  '/editor-model.js': { type: 'text/javascript; charset=utf-8', body: editorModel },
  '/editor.js': { type: 'text/javascript; charset=utf-8', body: editor },
  '/editor.css': { type: 'text/css; charset=utf-8', body: editorCss },
  '/stitch.css': { type: 'text/css; charset=utf-8', body: stitchCss },
  '/theme.js': { type: 'text/javascript; charset=utf-8', body: theme },
};
await mkdir(new URL('dist/server/', root), { recursive: true });
await writeFile(new URL('dist/server/index.js', root), 'const assets = ' + JSON.stringify(assets) + ';\n' + [worker, workspaceWorker, editorModel, editorWorker].join('\n'));
if (!process.argv.includes('--vercel')) {
  await mkdir(new URL('dist/.openai/', root), { recursive: true });
  await writeFile(new URL('dist/.openai/hosting.json', root), await read('.openai/hosting.json'));
}
