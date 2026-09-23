import assert from 'node:assert/strict'
import test from 'node:test'
import { GET } from '../web/src/app/download/route'
import { findMacDownload, RELEASES_URL } from '../web/src/lib/releases'

const asset = (name: string) => ({
  name,
  state: 'uploaded',
  browser_download_url: `${RELEASES_URL}/download/v0.2.0/${name}`,
})

test('current Clui releases select the correct DMG for each Mac architecture', () => {
  const arm = asset('Clui-0.1.17-arm64.dmg')
  const intel = asset('Clui-0.1.17.dmg')
  const release = {
    assets: [
      asset('Clui-0.1.17-arm64-mac.zip'),
      asset('Clui-0.1.17.dmg.blockmap'),
      arm,
      intel,
    ],
  }
  assert.equal(findMacDownload(release, 'arm64'), arm.browser_download_url)
  assert.equal(findMacDownload(release, 'x64'), intel.browser_download_url)
})

test('GLUI releases prefer explicitly named Intel assets over legacy names', () => {
  const arm = asset('GLUI-0.2.0-arm64.dmg')
  const intel = asset('GLUI-0.2.0-x64.dmg')
  const release = { assets: [asset('Clui-0.1.17.dmg'), arm, intel] }
  assert.equal(findMacDownload(release, 'arm64'), arm.browser_download_url)
  assert.equal(findMacDownload(release, 'x64'), intel.browser_download_url)
})

test('missing, unfinished, and foreign assets never produce the wrong download', () => {
  assert.equal(
    findMacDownload({ assets: [asset('GLUI-0.2.0-arm64.dmg')] }, 'x64'),
    undefined,
  )
  assert.equal(
    findMacDownload({ assets: [asset('GLUI-0.2.0-x64.dmg')] }, 'arm64'),
    undefined,
  )
  assert.equal(
    findMacDownload(
      { assets: [{ ...asset('GLUI-0.2.0-arm64.dmg'), state: 'starter' }] },
      'arm64',
    ),
    undefined,
  )
  assert.equal(
    findMacDownload(
      {
        assets: [
          {
            ...asset('GLUI-0.2.0-arm64.dmg'),
            browser_download_url: 'https://example.com/app.dmg',
          },
        ],
      },
      'arm64',
    ),
    undefined,
  )
  assert.equal(findMacDownload({}, 'arm64'), undefined)
})

test('download requests follow newly published versions without a website deploy', async (t) => {
  let version = '0.2.0'
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ assets: [asset(`GLUI-${version}-arm64.dmg`)] }),
  )
  const first = await GET(new Request('https://glui.example/download'))
  assert.equal(first.status, 307)
  assert.equal(
    first.headers.get('location'),
    asset('GLUI-0.2.0-arm64.dmg').browser_download_url,
  )
  assert.equal(first.headers.get('cache-control'), 'no-store')
  version = '0.3.0'
  const next = await GET(
    new Request('https://glui.example/download?arch=arm64'),
  )
  assert.equal(
    next.headers.get('location'),
    asset('GLUI-0.3.0-arm64.dmg').browser_download_url,
  )
})

test('Intel requests redirect to the Intel DMG', async (t) => {
  const intel = asset('GLUI-0.2.0-x64.dmg')
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ assets: [asset('GLUI-0.2.0-arm64.dmg'), intel] }),
  )
  const response = await GET(
    new Request('https://glui.example/download?arch=x64'),
  )
  assert.equal(response.headers.get('location'), intel.browser_download_url)
})

test('API failures and missing assets fall back to the latest release page', async (t) => {
  const responses = [
    async () => new Response(null, { status: 403 }),
    async () => Response.json({ assets: [] }),
    async () => new Response('not JSON'),
    async () => {
      throw new Error('Network timeout')
    },
  ]
  const fetchMock = t.mock.method(globalThis, 'fetch')
  for (const response of responses) {
    fetchMock.mock.mockImplementation(response)
    const result = await GET(
      new Request('https://glui.example/download?arch=arm64'),
    )
    assert.equal(result.status, 307)
    assert.equal(result.headers.get('location'), `${RELEASES_URL}/latest`)
  }
})

test('unsupported architectures cannot trigger a release lookup', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Unexpected fetch')
  })
  const result = await GET(
    new Request('https://glui.example/download?arch=windows'),
  )
  assert.equal(result.status, 400)
  assert.equal(fetchMock.mock.callCount(), 0)
})
