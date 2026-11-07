/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

// Entry of build/cli.js. Started by the `freeter` wrappers (resources/bin) with
// ELECTRON_RUN_AS_NODE=1, or by plain `node build/cli.js` in a repo checkout.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { connectAiClient, runCli } from '@/cli/cli';

function appVersion(): string {
  try {
    // Packaged: package.json sits next to cli.js in app.asar. Repo run: absent.
    return JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8')).version;
  } catch {
    return 'dev';
  }
}

runCli(process.argv.slice(2), { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr, env: process.env }, connectAiClient, appVersion())
  .then(code => {
    process.exitCode = code;
  });
