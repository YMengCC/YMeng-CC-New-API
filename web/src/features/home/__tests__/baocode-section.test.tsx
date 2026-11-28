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
import { cleanup, render, screen } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { useSystemConfigStore } from '@/stores/system-config-store'

import { BaoCodeSection } from '../components/sections/baocode-panel'

const i18n = createInstance()
await i18n.init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        'Sign in with your {{name}} account directly':
          'Sign in with your {{name}} account directly',
        'Less setup, more creation. Access multiple AI models through {{name}}, choose your coding companion in BaoCode, and bring your next idea to life.':
          'Less setup, more creation. Access multiple AI models through {{name}}, choose your coding companion in BaoCode, and bring your next idea to life.',
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

function renderBaoCodeSection(options?: { baocodeLink?: unknown }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(['status'], {
    baocode_link: options?.baocodeLink,
  })
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <BaoCodeSection />
      </QueryClientProvider>
    </I18nextProvider>
  )
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
  'uses a safe configured destination for the Get BaoCode button with %s',
  (baocodeLink, expected) => {
    renderBaoCodeSection({ baocodeLink })

    const button = screen.getByRole('button', { name: /Get BaoCode/ })
    expect(button).toHaveAttribute('href', expected)
    expect(button).toHaveAttribute('target', '_blank')
    expect(button.getAttribute('rel')).toContain('noopener')
    expect(button.getAttribute('rel')).toContain('noreferrer')
  }
)

it('renders as a standalone warm-paper card with an H2 title wrapping brand and BaoCode as two blocks', () => {
  renderBaoCodeSection()

  expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  const title = screen.getByRole('heading', { level: 2 })
  expect(title).toHaveClass('flex-wrap')
  expect(title).not.toHaveClass('whitespace-nowrap')

  const blocks = [...title.children]
  expect(blocks).toHaveLength(2)
  expect(blocks[0]).toHaveClass('min-w-0', 'max-w-full')
  expect(blocks[0].querySelector('.break-words')).toHaveTextContent('Test Site')
  expect(blocks[1]).toHaveTextContent('BaoCode')
  expect(blocks[1]).toHaveClass('shrink-0')

  const card = document.querySelector('[data-baocode-card]')
  expect(card).not.toBeNull()
  expect(card).toHaveClass('home-paper', 'rounded-3xl')
})

it('renders benchmarks, rival comparisons, and three interpolated onboarding steps', () => {
  renderBaoCodeSection()

  expect(screen.getByText('0.18 s')).toBeInTheDocument()
  expect(screen.getByText('120 MB')).toBeInTheDocument()
  expect(screen.getByText('vs Claude Code')).toBeInTheDocument()
  expect(screen.getByText('vs Codex')).toBeInTheDocument()
  expect(screen.getByText('vs Cursor')).toBeInTheDocument()
  expect(
    screen.getByText('Sign in with your Test Site account directly')
  ).toBeInTheDocument()
})
