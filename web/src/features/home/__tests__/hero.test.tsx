/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { useSystemConfigStore } from '@/stores/system-config-store'

import { Hero } from '../components/sections/hero'

// Keys are interpolated with `{{name}}`, so the instance needs matching
// resources instead of falling back to the key itself.
const i18n = createInstance()
await i18n.init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        'Join the {{name}} community group':
          'Join the {{name}} community group',
        'How do I connect this model?': 'How do I connect this model?',
        'How do I report an error?': 'How do I report an error?',
        'Grab a key in the console and paste it into your client':
          'Grab a key in the console and paste it into your client',
        'Post the logs in the group and we will take a look':
          'Post the logs in the group and we will take a look',
      },
    },
  },
  initAsync: false,
})

const initialSystemConfig = useSystemConfigStore.getState().config

beforeEach(() => {
  useSystemConfigStore.setState({
    config: { ...initialSystemConfig, systemName: 'Test Site' },
  })
})

afterEach(() => {
  useSystemConfigStore.setState({ config: initialSystemConfig })
  cleanup()
})

async function renderHero(options: {
  isAuthenticated: boolean
  docsLink?: string
  qqGroupLink?: string
  telegramLink?: string
  baocodeLink?: unknown
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(['status'], {
    docs_link: options.docsLink ?? '',
    baocode_link: options.baocodeLink,
    community_qq_group_link: options.qqGroupLink ?? '',
    community_telegram_link: options.telegramLink ?? '',
  })
  const root = createRootRoute({
    component: () => <Hero isAuthenticated={options.isAuthenticated} />,
  })
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nextProvider>
  )
  await screen.findByRole('heading', { level: 1 })
}

it.each([
  [undefined, 'https://baocode.dev/?ymengcc'],
  ['', 'https://baocode.dev/?ymengcc'],
  ['javascript:alert(1)', 'https://baocode.dev/?ymengcc'],
  ['/relative', 'https://baocode.dev/?ymengcc'],
  [42, 'https://baocode.dev/?ymengcc'],
  [
    '  https://example.com/install?ref=site#download  ',
    'https://example.com/install?ref=site#download',
  ],
])(
  'uses a safe configured destination for the BaoCode app link with %s',
  async (baocodeLink, expected) => {
    await renderHero({ isAuthenticated: false, baocodeLink })

    const link = screen.getByRole('link', { name: 'BaoCode' })
    expect(link).toHaveAttribute('href', expected)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.getAttribute('rel')).toContain('noreferrer')
  }
)

it('renders YMeng CC as the sole H1 in a seamless centered layout without diagonal seams', async () => {
  await renderHero({
    isAuthenticated: false,
    qqGroupLink: 'https://qm.qq.com/q/example',
  })

  const headings = screen.getAllByRole('heading', { level: 1 })
  expect(headings).toHaveLength(1)
  expect(headings[0]).toHaveAccessibleName('YMeng CC')
  expect(headings[0].textContent?.replaceAll('\u00A0', ' ')).toBe('YMeng CC')
  expect(document.querySelector('[data-home-typewriter]')).not.toBeNull()

  for (const selector of [
    '.home-split',
    '.home-seam-lg',
    '.home-seam-sm',
    '.home-seam-badge',
    '.home-community-wedge',
    '.home-community-seam',
    '.home-paper-clip-lg',
    '.home-paper-clip-sm',
  ]) {
    expect(document.querySelector(selector)).toBeNull()
  }
})

it('mounts the decorative particle backdrop behind hero content without blocking pointer interaction', async () => {
  await renderHero({ isAuthenticated: false })

  const particles = document.querySelector('canvas[data-home-particles]')
  expect(particles).not.toBeNull()
  expect(particles).toHaveAttribute('aria-hidden', 'true')
  expect(particles).toHaveClass('pointer-events-none')
})

it('renders the wide API terminal demo with a two-column desktop body', async () => {
  await renderHero({ isAuthenticated: false })

  const requestLabel = screen.getByText('Request')
  const responseLabel = screen.getByText('Response')
  const body = requestLabel.closest('[data-relief="inset"]')
  expect(body).not.toBeNull()
  expect(body).toHaveClass('grid-cols-1', 'md:grid-cols-2')
  expect(body?.contains(responseLabel)).toBe(true)
})

it('links the QQ group entry to the configured link in a new tab', async () => {
  await renderHero({
    isAuthenticated: false,
    qqGroupLink: 'https://qm.qq.com/q/example',
  })

  const link = screen.getByRole('button', { name: /Join QQ group/ })

  expect(link).toHaveAttribute('href', 'https://qm.qq.com/q/example')
  expect(link).toHaveAttribute('target', '_blank')
  expect(link.getAttribute('rel')).toContain('noopener')
  expect(
    screen.queryByRole('button', { name: /Join Telegram group/ })
  ).toBeNull()
})

it('links the Telegram group entry to the configured link in a new tab', async () => {
  await renderHero({
    isAuthenticated: false,
    telegramLink: 'https://t.me/example',
  })

  const link = screen.getByRole('button', { name: /Join Telegram group/ })

  expect(link).toHaveAttribute('href', 'https://t.me/example')
  expect(link).toHaveAttribute('target', '_blank')
  expect(link.getAttribute('rel')).toContain('noopener')
  expect(screen.queryByRole('button', { name: /Join QQ group/ })).toBeNull()
})

it('shows both group entries and both platform labels when both links are configured', async () => {
  await renderHero({
    isAuthenticated: false,
    qqGroupLink: 'https://qm.qq.com/q/example',
    telegramLink: 'https://t.me/example',
  })

  expect(screen.getByRole('button', { name: /Join QQ group/ })).toHaveAttribute(
    'href',
    'https://qm.qq.com/q/example'
  )
  expect(
    screen.getByRole('button', { name: /Join Telegram group/ })
  ).toHaveAttribute('href', 'https://t.me/example')

  const community = document.querySelector('[data-community-card]')
  expect(community).not.toBeNull()
  expect(
    within(community as HTMLElement).getByText('QQ', { exact: true })
  ).toBeInTheDocument()
  expect(
    within(community as HTMLElement).getByText('Telegram', { exact: true })
  ).toBeInTheDocument()
})

it('titles the community card with the configured system name', async () => {
  await renderHero({
    isAuthenticated: false,
    qqGroupLink: 'https://qm.qq.com/q/example',
  })

  const community = document.querySelector('[data-community-card]')
  expect(community).not.toBeNull()
  expect(
    within(community as HTMLElement).getByText(
      'Join the Test Site community group'
    )
  ).toBeInTheDocument()
  expect(within(community as HTMLElement).queryByText(/YMeng CC/)).toBeNull()
})

it('omits the entire community strip when no group links are configured', async () => {
  await renderHero({ isAuthenticated: false })

  expect(document.querySelector('[data-community-strip]')).toBeNull()
  expect(document.querySelector('[data-community-emblem]')).toBeNull()
  expect(screen.queryByText('Q&A, feedback and new model updates')).toBeNull()
  expect(screen.queryByRole('button', { name: /Join QQ group/ })).toBeNull()
  expect(
    screen.queryByRole('button', { name: /Join Telegram group/ })
  ).toBeNull()
  expect(screen.queryByText('How do I connect this model?')).toBeNull()
})

it('places the lightweight community strip between the brand showcase and the API terminal demo', async () => {
  await renderHero({
    isAuthenticated: false,
    qqGroupLink: 'https://qm.qq.com/q/example',
    telegramLink: 'https://t.me/example',
  })

  const heading = screen.getByRole('heading', { level: 1, name: 'YMeng CC' })
  const requestLabel = screen.getByText('Request')
  const strip = document.querySelector('[data-community-strip]')
  const content = document.querySelector('.home-community-content')
  if (!strip || !content) throw new Error('Expected community strip')

  expect(
    heading.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
  expect(
    strip.compareDocumentPosition(requestLabel) &
      Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy()
  expect(strip.firstElementChild).toHaveAttribute('data-community-emblem')
  expect(strip.contains(content)).toBe(true)
})

it('keeps long community names wrapping cleanly beside the example chat preview', async () => {
  useSystemConfigStore.setState({
    config: { ...initialSystemConfig, systemName: 'LongSiteName'.repeat(30) },
  })
  await renderHero({
    isAuthenticated: false,
    qqGroupLink: 'https://qm.qq.com/q/example',
  })

  const title = screen.getByText(/Join the LongSiteName/)
  expect(title).toHaveClass('break-words')
  expect(title).not.toHaveClass('truncate')

  const content = title.closest('.home-community-content')
  if (!content) throw new Error('Expected community content')
  expect(content).toHaveClass('flex-col', 'lg:flex-row')
  expect(content).not.toHaveClass('absolute')

  const preview = content.querySelector('[aria-hidden="true"].rounded-xl')
  expect(preview).toHaveClass('w-full', 'lg:w-72', 'lg:shrink-0')
  expect(preview).not.toHaveClass('hidden')
  const card = title.closest('[data-community-card]')
  if (!card || !preview) throw new Error('Expected community card and preview')
  expect(preview.previousElementSibling).toBe(card)
})

it.each([
  ['https://qm.qq.com/q/example', '', 1],
  ['', 'https://t.me/example', 1],
  ['https://qm.qq.com/q/example', 'https://t.me/example', 2],
])(
  'reserves a single unclipped conversation slot for QQ=%s Telegram=%s',
  async (qqGroupLink, telegramLink, count) => {
    await renderHero({ isAuthenticated: false, qqGroupLink, telegramLink })

    const slot = document.querySelector('.home-chat-rounds')
    expect(slot).not.toBeNull()
    if (!slot) throw new Error('Expected a conversation slot')
    expect(slot).toHaveClass(
      'grid',
      'w-full',
      'min-w-0',
      count === 2 ? 'home-chat-rotating' : 'home-chat-static'
    )
    expect(slot.children).toHaveLength(count)
    for (const round of slot.children) {
      expect(round).toHaveClass('col-start-1', 'row-start-1', 'w-full')
      expect(round.querySelectorAll('.home-qq-bubble')).toHaveLength(3)
      expect(round.querySelectorAll('.home-chat-answer')).toHaveLength(1)
      for (const message of round.querySelectorAll(
        '.home-qq-bubble > span:last-child'
      )) {
        expect(message).not.toHaveClass('truncate')
      }
    }
    expect(slot.querySelectorAll('.home-qq-round-late')).toHaveLength(count - 1)
    if (qqGroupLink) {
      expect(
        within(slot as HTMLElement).getByText('How do I connect this model?')
      ).toBeInTheDocument()
      expect(
        within(slot as HTMLElement).getByText(
          'Grab a key in the console and paste it into your client'
        )
      ).toBeInTheDocument()
    }
    if (telegramLink) {
      expect(
        within(slot as HTMLElement).getByText('How do I report an error?')
      ).toBeInTheDocument()
      expect(
        within(slot as HTMLElement).getByText(
          'Post the logs in the group and we will take a look'
        )
      ).toBeInTheDocument()
    }
  }
)

it.each([
  ['https://qm.qq.com/q/example', '', 1],
  ['', 'https://t.me/example', 1],
  ['https://qm.qq.com/q/example', 'https://t.me/example', 2],
])(
  'shows a background emblem for each configured group with QQ=%s Telegram=%s',
  async (qqGroupLink, telegramLink, count) => {
    await renderHero({ isAuthenticated: false, qqGroupLink, telegramLink })

    const emblem = document.querySelector('[data-community-emblem]')
    expect(emblem).not.toBeNull()
    if (!emblem) throw new Error('Expected a background emblem')
    expect(emblem.querySelectorAll('svg')).toHaveLength(count)
  }
)

it('keeps the example chat out of the accessibility tree', async () => {
  await renderHero({
    isAuthenticated: false,
    qqGroupLink: 'https://qm.qq.com/q/example',
  })

  const example = screen.getByText('How do I connect this model?')
  expect(example.closest('[aria-hidden="true"]')).not.toBeNull()
})

it('shows sign-up and pricing entries to signed-out visitors', async () => {
  await renderHero({ isAuthenticated: false })

  expect(screen.getByRole('button', { name: /Get Started/ })).toHaveAttribute(
    'href',
    '/sign-up'
  )
  expect(screen.getByRole('button', { name: 'View Pricing' })).toHaveAttribute(
    'href',
    '/pricing'
  )
  expect(screen.queryByRole('button', { name: /Sign in/ })).toBeNull()
})

it('shows the sign-in entry to the dashboard instead of sign-up to signed-in users', async () => {
  await renderHero({ isAuthenticated: true })

  expect(screen.getByRole('button', { name: /Sign in/ })).toHaveAttribute(
    'href',
    '/dashboard'
  )
  expect(screen.queryByRole('button', { name: /Get Started/ })).toBeNull()
})

it('labels the API guide button and links it to the in-app docs route', async () => {
  await renderHero({ isAuthenticated: false })

  const apiGuide = screen.getByRole('button', { name: 'API Guide' })

  expect(apiGuide).toHaveAttribute('href', '/docs')
  expect(apiGuide).not.toHaveAttribute('target')
  expect(screen.queryByRole('button', { name: 'Docs' })).toBeNull()
})

it.each([['https://docs.example.com/guide'], ['/about']])(
  'ignores a configured docs link (%s) and opens the in-app API guide',
  async (docsLink) => {
    await renderHero({ isAuthenticated: false, docsLink })

    const apiGuide = screen.getByRole('button', { name: 'API Guide' })

    expect(apiGuide).toHaveAttribute('href', '/docs')
    expect(apiGuide).not.toHaveAttribute('href', docsLink)
    expect(apiGuide).not.toHaveAttribute('target')
  }
)
