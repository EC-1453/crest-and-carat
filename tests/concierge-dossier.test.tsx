// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ContactPage } from '../src/concierge'

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function renderContact(query: string) {
  window.history.replaceState(null, '', `/contact/${query}`)
  await act(async () => root.render(<ContactPage />))
  const form = container.querySelector('form')
  if (!form) throw new Error('The concierge form is missing.')
  return form
}

it('opens a dossier request for a named piece and sends it without requiring notes or marketing consent', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ saved: true, forwarding: 'manual' }))
  vi.stubGlobal('fetch', fetch)
  const form = await renderContact('?piece=the-sovereign&request=dossier')
  expect(container.querySelector('h1')?.textContent).toBe('Request a Private Dossier')
  expect(form.querySelector('select')?.value).toBe('the-sovereign')
  expect(form.querySelector('textarea')?.required).toBe(false)
  const email = form.querySelector<HTMLInputElement>('input[type="email"]')
  if (!email) throw new Error('The concierge form is missing its email field.')

  email.value = 'collector@example.test'
  expect(form.checkValidity()).toBe(true)
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })

  expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/subscribers', expect.objectContaining({ method: 'POST' }))
  const body = fetch.mock.calls[0][1]?.body
  if (typeof body !== 'string') throw new Error('Dossier requests should send a JSON body.')
  expect(JSON.parse(body)).toMatchObject({
    source: 'inquiry',
    sourcePage: '/contact/',
    productSlug: 'the-sovereign',
    interestCategory: 'the-sovereign',
    email: 'collector@example.test',
    marketingConsent: false,
    website: '',
    message: 'Request: Private Concierge Dossier',
  })
  expect(document.activeElement?.textContent).toBe('Thank you for requesting a dossier.')
  const fallback = container.querySelector('.contact-page__response a')?.getAttribute('href')
  expect(decodeURIComponent(fallback ?? '')).toContain('subject=Private Concierge Dossier for The Sovereign')
})

it('preserves general inquiry and collection context when a dossier link names an unknown piece', async () => {
  const form = await renderContact('?piece=unknown-piece&request=dossier&collection=solid-gold')
  expect(container.querySelector('h1')?.textContent).toBe('Contact CREST & CARAT')
  expect(form.querySelector('select')?.value).toBe('')
  expect(form.querySelector('textarea')?.required).toBe(true)
  expect(form.querySelector('textarea')?.value).toBe('I’m interested in the Solid Gold collection.')
})
