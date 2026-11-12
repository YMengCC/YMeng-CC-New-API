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
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { collectDocHeadings } from '@/lib/markdown-source'

import { Markdown } from '../markdown'

describe('enhanced Markdown callouts', () => {
  it.each(['info', 'tip', 'warning', 'danger'] as const)(
    'renders a %s callout with semantic styling and its title',
    (variant) => {
      const source = `:::${variant} 标题文本\n\n内容文字\n:::`

      const view = render(<Markdown enhanced>{source}</Markdown>)

      const callout = view.container.querySelector(
        `[data-callout="${variant}"]`
      )
      expect(callout).not.toBeNull()
      expect(callout).toHaveClass(`markdown-callout-${variant}`)
      expect(callout).toHaveTextContent('标题文本')
      expect(callout).toHaveTextContent('内容文字')
    }
  )

  it('renders a callout without a title as icon plus body', () => {
    const view = render(
      <Markdown enhanced>{':::tip\n\n只有内容\n:::'}</Markdown>
    )

    const callout = view.container.querySelector('[data-callout="tip"]')
    expect(callout).not.toBeNull()
    expect(callout?.querySelector('svg')).not.toBeNull()
    expect(callout).toHaveTextContent('只有内容')
  })

  it('keeps callout source as plain text in default mode', () => {
    const view = render(<Markdown>{':::info\n内容\n:::'}</Markdown>)

    expect(view.container.querySelector('[data-callout]')).toBeNull()
    expect(view.container).toHaveTextContent(':::info')
  })
})

describe('enhanced Markdown frontmatter and headings', () => {
  it('strips YAML frontmatter instead of rendering it', () => {
    const source = '---\ntitle: 页面标题\ndescription: 描述\n---\n\n正文'

    const view = render(<Markdown enhanced>{source}</Markdown>)

    expect(view.container).toHaveTextContent('正文')
    expect(view.container).not.toHaveTextContent('title:')
    expect(view.container.querySelector('hr')).toBeNull()
  })

  it('assigns heading ids that match the search-index allocator', () => {
    const source = '## First Section\n\n### Setup\n\n## Setup\n\n#### Deep'

    const view = render(<Markdown enhanced>{source}</Markdown>)

    const rendered = Array.from(
      view.container.querySelectorAll('h2[id], h3[id]')
    ).map((element) => element.id)
    expect(rendered).toEqual(
      collectDocHeadings(source).map((heading) => heading.id)
    )
    expect(view.container.querySelector('h2#first-section')).not.toBeNull()
    expect(view.container.querySelector('h3#setup')).not.toBeNull()
    expect(view.container.querySelector('h2#setup-1')).not.toBeNull()
  })
})

describe('enhanced Markdown links', () => {
  it('routes internal links through the SPA handler and leaves external links in a new tab', () => {
    const onInternalLink = vi.fn()
    render(
      <Markdown enhanced onInternalLink={onInternalLink}>
        {'[Keys](/keys) [External](https://example.com) [Anchor](#section)'}
      </Markdown>
    )

    const internal = screen.getByRole('link', { name: 'Keys' })
    expect(internal).not.toHaveAttribute('target')
    fireEvent.click(internal)
    expect(onInternalLink).toHaveBeenCalledWith('/keys')

    const anchor = screen.getByRole('link', { name: 'Anchor' })
    fireEvent.click(anchor)
    expect(onInternalLink).toHaveBeenCalledWith('#section')

    const external = screen.getByRole('link', { name: 'External' })
    expect(external).toHaveAttribute('target', '_blank')
    expect(external).toHaveAttribute('rel', 'noopener noreferrer')
    fireEvent.click(external)
    expect(onInternalLink).toHaveBeenCalledTimes(2)
  })

  it('keeps browser modifier-click behavior for internal links', () => {
    const onInternalLink = vi.fn()
    render(
      <Markdown enhanced onInternalLink={onInternalLink}>
        {'[Keys](/keys)'}
      </Markdown>
    )

    fireEvent.click(screen.getByRole('link', { name: 'Keys' }), {
      ctrlKey: true,
    })

    expect(onInternalLink).not.toHaveBeenCalled()
  })

  it('opens every link in a new tab in default mode', () => {
    render(<Markdown>{'[Keys](/keys)'}</Markdown>)

    expect(screen.getByRole('link', { name: 'Keys' })).toHaveAttribute(
      'target',
      '_blank'
    )
  })
})

describe('enhanced Markdown code blocks', () => {
  it('adds a copy button while keeping the original code text', async () => {
    const view = render(
      <Markdown enhanced>
        {'```bash\ncurl https://example.com/v1\n```'}
      </Markdown>
    )

    const copyButton = await screen.findByRole('button', { name: 'Copy code' })
    expect(copyButton).toBeInTheDocument()
    expect(view.container.querySelector('pre code')).toHaveTextContent(
      'curl https://example.com/v1'
    )
  })

  it('does not add copy buttons in default mode', () => {
    render(<Markdown>{'```bash\ncurl example\n```'}</Markdown>)

    expect(
      screen.queryByRole('button', { name: 'Copy code' })
    ).not.toBeInTheDocument()
  })
})
