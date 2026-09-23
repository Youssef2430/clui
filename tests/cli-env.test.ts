import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

test('a GUI launch prefers the login-shell agent over npm-injected binaries and clears the nested Claude marker', { skip: !existsSync('/bin/zsh') }, () => {
  const fixture = mkdtempSync(join(tmpdir(), 'glui-cli-env-'))
  try {
    const bin = join(fixture, 'bin')
    const injected = join(fixture, 'node_modules', '.bin')
    mkdirSync(bin)
    mkdirSync(injected, { recursive: true })
    writeFileSync(join(fixture, '.zshrc'), `export PATH='${bin}':"$PATH"\n`)
    const executable = join(bin, 'glui-fixture-agent')
    writeFileSync(executable, '#!/bin/sh\nprintf GLUI_ENV_OK\n')
    chmodSync(executable, 0o755)
    writeFileSync(join(injected, 'glui-fixture-agent'), '#!/bin/sh\nprintf WRONG_AGENT\n')
    chmodSync(join(injected, 'glui-fixture-agent'), 0o755)
    const script = `import { getCliEnv } from './src/main/cli-env.ts'; import { execFileSync } from 'node:child_process'; const env = getCliEnv(); if (env.CLAUDECODE) throw new Error('Nested marker leaked'); console.log(execFileSync('glui-fixture-agent', [], { env, encoding: 'utf8' }));`
    const output = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, PATH: `${injected}:/usr/bin:/bin`, ZDOTDIR: fixture, CLAUDECODE: 'outer-agent' },
      encoding: 'utf8',
      timeout: 15_000,
    })
    assert.equal(output.trim(), 'GLUI_ENV_OK')
  } finally { rmSync(fixture, { recursive: true, force: true }) }
})
