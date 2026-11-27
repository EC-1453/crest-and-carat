// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PrivateList } from '../src/concierge'

let container: HTMLDivElement
let root: Root

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  sessionStorage.clear()
  window.history.replaceState(null, '', '/collections/solid-gold/')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<PrivateList />))
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

function fillForm(address: string): HTMLFormElement {
  const form = container.querySelector('form')
  const email = form?.querySelector<HTMLInputElement>('input[type="email"]')
  const consent = form?.querySelector<HTMLInputElement>('input[name="marketingConsent"]')
  if (!form || !email || !consent) throw new Error('The sign-up form is missing its required controls.')
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (!setValue) throw new Error('The test DOM does not provide email value updates.')
  setValue.call(email, address)
  email.dispatchEvent(new Event('input', { bubbles: true }))
  consent.click()
  return form
}

function submit(form: HTMLFormElement) {
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
}

function payload(fetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>, index = 0): unknown {
  const init = fetch.mock.calls[index][1]
  if (typeof init?.body !== 'string') throw new Error('Sign-up must send a JSON body.')
  return JSON.parse(init.body)
}

it('sends the VIP email and explicit consent to the Worker, then focuses the confirmation', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ saved: true, forwarding: 'manual' }))
  vi.stubGlobal('fetch', fetch)
  let form: HTMLFormElement
  await act(async () => { form = fillForm('vip@example.test') })
  await act(async () => {
    expect(form.checkValidity()).toBe(true)
    submit(form)
    submit(form)
  })

  expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/subscribers', expect.objectContaining({
    method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', credentials: 'omit',
  }))
  expect(payload(fetch)).toEqual({
    source: 'vip', email: 'vip@example.test', marketingConsent: true, website: '',
    sourcePage: '/collections/solid-gold/', interestCategory: 'solid-gold', requestId: expect.any(String),
  })
  expect(container.querySelector('form')).toBeNull()
  expect(container.textContent).toContain('You’re on the Private List.')
  expect(document.activeElement).toBe(container.querySelector('.concierge-result'))
})

it('offers an email fallback and reuses the request ID when the same signup is retried', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockRejectedValueOnce(new Error('Simulated network loss.'))
    .mockResolvedValueOnce(Response.json({ saved: true, forwarding: 'delivered' }))
  vi.stubGlobal('fetch', fetch)
  let form: HTMLFormElement
  await act(async () => { form = fillForm('retry@example.test') })
  await act(async () => submit(form))

  expect(container.querySelector('[aria-live="polite"]')?.textContent).toContain('temporarily unavailable')
  expect(container.querySelector('.concierge-result a')?.getAttribute('href')).toMatch(/^mailto:privateclient@evercrest\.vip\?/u)
  await act(async () => submit(form))
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(payload(fetch, 1)).toEqual(payload(fetch))
  expect(container.textContent).toContain('You’re on the Private List.')
})
