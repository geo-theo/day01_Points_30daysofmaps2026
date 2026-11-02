import {readFile, writeFile} from 'node:fs/promises';
const core = (await readFile(new URL('./jonckheere_terpstra.js', import.meta.url), 'utf8')).replace('export function createJTCore()', 'function createJTCore()');
const template = await readFile(new URL('./cell_template.txt', import.meta.url), 'utf8');
await writeFile(new URL('../observable_cell_code/05_jonckheere_terpstra.js', import.meta.url), template.replace('/* INSERT JT CORE */', core));
console.log('Updated Cell 05.');
