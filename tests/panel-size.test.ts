import test from 'node:test'
import assert from 'node:assert/strict'
import { fitPanelSize } from '../src/renderer/panel-size'

test('resizing reserves space for floating actions and clamps both dimensions', () => {
  assert.deepEqual(fitPanelSize({ width: 1200, height: 900 }, { width: 1040, height: 720 }), { width: 800, height: 516 })
  assert.deepEqual(fitPanelSize({ width: 20, height: 20 }, { width: 1040, height: 720 }), { width: 400, height: 160 })
})

test('zoom and a multiline composer reduce the available panel area', () => {
  assert.deepEqual(fitPanelSize({ width: 700, height: 500 }, { width: 866, height: 600 }, 240), { width: 626, height: 336 })
  assert.deepEqual(fitPanelSize({ width: 400, height: 300 }, { width: 560, height: 400 }, 240), { width: 320, height: 136 })
})
