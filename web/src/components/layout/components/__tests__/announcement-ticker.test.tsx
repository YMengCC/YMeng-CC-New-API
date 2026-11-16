import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AnnouncementTicker } from '../announcement-ticker'

const statusMock = vi.hoisted(() => ({
  value: null as Record<string, unknown> | null,
}))

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({ status: statusMock.value, loading: false, error: null }),
}))

function setStatus(status: Record<string, unknown> | null) {
  statusMock.value = status
}

function getCopies() {
  const region = screen.getByRole('region', { name: 'Announcements' })
  return {
    region,
    copies: region.querySelectorAll('ul'),
  }
}

afterEach(() => {
  setStatus(null)
})

describe('AnnouncementTicker', () => {
  it('renders every announcement in order with its publish date', () => {
    setStatus({
      announcements_enabled: true,
      announcements: [
        { id: 1, content: '维护通知', publishDate: '2026-08-24T12:00:00Z' },
        { id: 2, content: '充值活动', publishDate: '2026-08-20T12:00:00Z' },
      ],
    })

    render(<AnnouncementTicker />)

    const { copies } = getCopies()
    const items = within(copies[0] as HTMLElement).getAllByRole('listitem')

    expect(items).toHaveLength(2)
    expect(items[0].textContent).toContain('维护通知')
    expect(items[1].textContent).toContain('充值活动')

    const publishedAt = items[0].querySelector('time')
    expect(publishedAt).toHaveAttribute('dateTime', '2026-08-24T12:00:00Z')
    expect(publishedAt?.textContent).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('duplicates the announcements and hides the duplicate from assistive tech', () => {
    setStatus({
      announcements_enabled: true,
      announcements: [{ id: 1, content: '维护通知' }],
    })

    render(<AnnouncementTicker />)

    const { copies } = getCopies()
    expect(copies).toHaveLength(2)
    expect(copies[1]).toHaveAttribute('aria-hidden', 'true')
    expect(copies[0]).not.toHaveAttribute('aria-hidden')
  })

  it('strips HTML and Markdown markup from the announcement text', () => {
    setStatus({
      announcements_enabled: true,
      announcements: [{ id: 1, content: '<b>维护</b> #通知#' }],
    })

    render(<AnnouncementTicker />)

    const { region, copies } = getCopies()
    expect(
      within(copies[0] as HTMLElement).getByText('维护 通知')
    ).toBeInTheDocument()
    expect(region.querySelector('b')).toBeNull()
  })

  it('renders the text without a date when the publish date is invalid', () => {
    setStatus({
      announcements_enabled: true,
      announcements: [
        { id: 1, content: '维护通知', publishDate: 'not-a-date' },
      ],
    })

    render(<AnnouncementTicker />)

    const { copies } = getCopies()
    const list = copies[0] as HTMLElement
    expect(within(list).getByText('维护通知')).toBeInTheDocument()
    expect(list.querySelector('time')).toBeNull()
  })

  it('renders nothing when announcements are disabled', () => {
    setStatus({
      announcements_enabled: false,
      announcements: [{ id: 1, content: '维护通知' }],
    })

    render(<AnnouncementTicker />)

    expect(
      screen.queryByRole('region', { name: 'Announcements' })
    ).not.toBeInTheDocument()
  })

  it('renders nothing when no announcement has content', () => {
    setStatus({
      announcements_enabled: true,
      announcements: [
        { id: 1, content: '' },
        { id: 2, content: '   ' },
      ],
    })

    render(<AnnouncementTicker />)

    expect(
      screen.queryByRole('region', { name: 'Announcements' })
    ).not.toBeInTheDocument()
  })
})
