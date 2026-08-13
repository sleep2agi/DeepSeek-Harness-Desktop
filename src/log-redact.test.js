import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { LogBuffer, redact } from './log-redact.js'

// Fixtures are assembled at runtime rather than written out literally. They need the real
// shape to be worth testing against, and a real-shaped credential sitting in a source file
// is exactly what tools/scan-leaks.js is built to reject — including in this repository.
const FAKE = {
  providerKey: `sk-${'a1'.repeat(16)}`,
  classicToken: `ghp_${'A'.repeat(36)}`,
  fineGrainedToken: `github_pat_${'B'.repeat(22)}_${'c'.repeat(20)}`,
}

describe('redact', () => {
  it('removes provider API keys', () => {
    const out = redact(`using key ${FAKE.providerKey} for the request`)
    assert.equal(out.includes(FAKE.providerKey), false)
    assert.ok(out.includes('sk-[redacted]'))
  })

  it('removes GitHub tokens in both formats', () => {
    const classic = redact(`remote: ${FAKE.classicToken}`)
    assert.equal(classic.includes(FAKE.classicToken), false)

    const fineGrained = redact(`token ${FAKE.fineGrainedToken}`)
    assert.equal(fineGrained.includes(FAKE.fineGrainedToken), false)
    assert.ok(fineGrained.includes('github_pat_[redacted]'))
  })

  it('removes bearer tokens while keeping the surrounding line readable', () => {
    const out = redact('authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')
    assert.equal(out.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), false)
    assert.ok(out.toLowerCase().includes('authorization'))
  })

  it('removes values assigned to secret-named variables', () => {
    assert.equal(redact('DEEPSEEK_API_KEY=hunter2hunter2hunter2').includes('hunter2hunter2'), false)
    assert.equal(redact('"apiToken": "abcdefgh12345678"').includes('abcdefgh12345678'), false)
    assert.ok(redact('DEEPSEEK_API_KEY=hunter2hunter2hunter2').startsWith('DEEPSEEK_API_KEY='))
  })

  it('leaves ordinary log lines untouched', () => {
    const line = 'kernel listening on http://127.0.0.1:41235'
    assert.equal(redact(line), line)
  })
})

describe('LogBuffer', () => {
  it('redacts on the way in, so the raw secret is never stored', () => {
    const buffer = new LogBuffer(10)
    buffer.push('DEEPSEEK_API_KEY=supersecretvalue123')

    // Assert against the internal state via the accessor rather than the formatted text:
    // the point is that nothing anywhere in the buffer holds the plaintext.
    assert.equal(buffer.lines().join('\n').includes('supersecretvalue123'), false)
  })

  it('splits chunks into lines and drops blank ones', () => {
    const buffer = new LogBuffer(10)
    buffer.push('first\r\nsecond\n\nthird')
    assert.deepEqual(buffer.lines(), ['first', 'second', 'third'])
  })

  it('keeps only the most recent lines once full', () => {
    const buffer = new LogBuffer(3)
    for (const n of [1, 2, 3, 4, 5]) buffer.push(`line ${n}`)
    assert.deepEqual(buffer.lines(), ['line 3', 'line 4', 'line 5'])
  })

  it('reports how many lines it discarded', () => {
    const buffer = new LogBuffer(2)
    for (const n of [1, 2, 3, 4, 5]) buffer.push(`line ${n}`)

    // Without this, an empty-looking log is indistinguishable from a truncated one.
    assert.equal(buffer.dropped(), 3)
    assert.ok(buffer.text().includes('3 earlier line(s) dropped'))
  })

  it('says nothing about drops when nothing was dropped', () => {
    const buffer = new LogBuffer(10)
    buffer.push('only line')
    assert.equal(buffer.dropped(), 0)
    assert.equal(buffer.text(), 'only line')
  })
})
