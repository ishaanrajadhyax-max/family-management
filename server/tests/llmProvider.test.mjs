// Unit tests for the provider-selection logic itself (jarvis/llmProvider.js
// and the two adapters' isConfigured()). These don't call any real LLM —
// no key exists for either provider yet — they verify the configuration
// detection and provider-switching logic, which is what's actually
// testable without live credentials. Run directly with node, no server
// required (unlike jarvis.test.mjs, which is an HTTP integration suite).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isJarvisConfigured } from '../jarvis/llmProvider.js'

const ENV_KEYS = ['LLM_PROVIDER', 'ANTHROPIC_API_KEY', 'GROQ_API_KEY']

function withEnv(overrides, fn) {
  const original = {}
  for (const key of ENV_KEYS) original[key] = process.env[key]
  for (const key of ENV_KEYS) delete process.env[key]
  Object.assign(process.env, overrides)
  try {
    return fn()
  } finally {
    for (const key of ENV_KEYS) delete process.env[key]
    for (const key of ENV_KEYS) {
      if (original[key] !== undefined) process.env[key] = original[key]
    }
  }
}

test('defaults to groq when LLM_PROVIDER is unset', () => {
  withEnv({ GROQ_API_KEY: 'test-key' }, () => {
    assert.equal(isJarvisConfigured(), true)
  })
})

test('groq is reported unconfigured without GROQ_API_KEY, even with LLM_PROVIDER=groq explicit', () => {
  withEnv({ LLM_PROVIDER: 'groq' }, () => {
    assert.equal(isJarvisConfigured(), false)
  })
})

test('anthropic works when explicitly selected, independent of Groq', () => {
  withEnv({ LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'test-key' }, () => {
    assert.equal(isJarvisConfigured(), true)
  })
})

test('anthropic is reported unconfigured without ANTHROPIC_API_KEY', () => {
  withEnv({ LLM_PROVIDER: 'anthropic' }, () => {
    assert.equal(isJarvisConfigured(), false)
  })
})

test('a GROQ_API_KEY being set does not make anthropic mode configured', () => {
  withEnv({ LLM_PROVIDER: 'anthropic', GROQ_API_KEY: 'test-key' }, () => {
    assert.equal(isJarvisConfigured(), false)
  })
})

test('an unknown LLM_PROVIDER value throws a clear error rather than silently picking one', () => {
  withEnv({ LLM_PROVIDER: 'not-a-real-provider', GROQ_API_KEY: 'test-key' }, () => {
    assert.throws(() => isJarvisConfigured(), /Invalid LLM_PROVIDER/)
  })
})
