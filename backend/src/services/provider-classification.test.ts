import { describe, expect, it } from 'vitest'
import { classifyProviderIssue } from './provider-classification.js'

describe('classifyProviderIssue', () => {
  it('classifies quota errors', () => {
    expect(classifyProviderIssue({ status: 429, message: 'Quota exceeded', reachable: true })).toBe('quota_exceeded')
  })

  it('classifies paid-plan errors', () => {
    expect(classifyProviderIssue({ message: 'Pre-paid credits are required', reachable: true })).toBe('paid_plan_required')
  })

  it('classifies invalid key errors', () => {
    expect(classifyProviderIssue({ status: 401, message: 'The API key format is incorrect', reachable: true })).toBe('invalid_key')
  })
})
