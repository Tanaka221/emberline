// EMBERLINE — entrypoint for the threejs-fps-02 bounty (Node 22, standard library only).
//
// The game itself is the plain static files under game/: the browser loads them as ES modules
// with three.js from the import map in game/index.html. This program is only the packer the
// grader runs: it copies game/ and screenshots/ from beside this file into the output
// directory and writes output/dossier.json, the summary the judge reads, using the vendored
// make.fun library in vendor/.
//
// Run it locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// and serve the game with `node serve.ts`, then open http://localhost:8080.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

// The directory this file lives in, and the output directory: the grader's /output, or
// MAKEFUN_OUTPUT_DIR when running outside the grader's container.
const rootDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

fs.mkdirSync(outputDir, { recursive: true });
fs.cpSync(path.join(rootDir, 'game'), path.join(outputDir, 'game'), { recursive: true });
fs.mkdirSync(path.join(outputDir, 'screenshots'), { recursive: true });
if (fs.existsSync(path.join(rootDir, 'screenshots'))) {
  fs.cpSync(path.join(rootDir, 'screenshots'), path.join(outputDir, 'screenshots'), { recursive: true });
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the
// others refuse an entry the scorer would refuse — more than 4 screenshots or one over
// 256 KiB; more than 993 files in game/ or 48 MiB of game files in all (game/ counts beside
// /output's own 1000-entry cap, its screenshots/ and dossier.json).
fs.writeFileSync(
  path.join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);
