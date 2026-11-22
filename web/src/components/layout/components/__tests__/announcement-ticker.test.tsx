import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { AnnouncementTicker } from '../announcement-ticker'

const originalGetAnimations = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'getAnimations'
)
beforeAll(() => {
  // jsdom does not implement the Web Animations API used by ScrollArea.
  Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
    configurable: true,
    value: () => [],
  })
})
afterAll(() => {
  if (originalGetAnimations) {
    Object.defineProperty(
      HTMLElement.prototype,
      'getAnimations',
      originalGetAnimations
    )
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'getAnimations')
  }
})

const statusMock = vi.hoisted(() => ({
  value: null as Record<string, unknown> | null,
}))

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({ status: statusMock.value, loading: false, error: null }),
}))

function setStatus(status: Record<string, unknown> | null) {
  statusMock.value = status
}

function getRegion() {
  return screen.getByRole('region', { name: 'Announcements' })
}

function getCopies() {
  return getRegion().querySelectorAll('ul')
}

/**
 * jsdom reports every box as zero. The ticker decides between a static single
 * copy and the scrolling duplicate by comparing the width of one copy with the
 * visible pill, so both are stubbed per element.
 */
function setTickerWidths(oneCopyWidth: number, pillWidth: number) {
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('announcement-ticker-mask')
        ? pillWidth
        : oneCopyWidth
    },
  })
}

afterEach(() => {
  setStatus(null)
  Reflect.deleteProperty(HTMLElement.prototype, 'offsetWidth')
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

    const items = within(getCopies()[0] as HTMLElement).getAllByRole('listitem')

    expect(items).toHaveLength(2)
    expect(items[0].textContent).toContain('维护通知')
    expect(items[1].textContent).toContain('充值活动')

    const publishedAt = items[0].querySelector('time')
    expect(publishedAt).toHaveAttribute('dateTime', '2026-08-24T12:00:00Z')
    expect(publishedAt?.textContent).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('renders a single static copy when the announcements fit the pill', () => {
    setTickerWidths(120, 320)
    setStatus({
      announcements_enabled: true,
      announcements: [{ id: 1, content: '维护通知' }],
    })

    render(<AnnouncementTicker />)

    const copies = getCopies()
    expect(copies).toHaveLength(1)
    expect(copies[0]).not.toHaveAttribute('aria-hidden')
    expect(
      getRegion().querySelector('[data-announcement-copy]')
    ).not.toBeInTheDocument()
    expect(
      getRegion().querySelector('.announcement-ticker-track')
    ).not.toHaveAttribute('data-scrolling')
  })

  it('scrolls a duplicated copy when the announcements overflow the pill', () => {
    setTickerWidths(900, 320)
    setStatus({
      announcements_enabled: true,
      announcements: [{ id: 1, content: '维护通知' }],
    })

    render(<AnnouncementTicker />)

    const copies = getCopies()
    expect(copies).toHaveLength(2)
    expect(copies[1]).toHaveAttribute('aria-hidden', 'true')
    expect(copies[1]).toHaveAttribute('data-announcement-copy', 'duplicate')
    const track = getRegion().querySelector('.announcement-ticker-track')
    expect(track).toHaveAttribute('data-scrolling', 'true')
    // ~40px per second, so a 900px copy loops in about 23 seconds.
    expect(track).toHaveStyle({ animationDuration: '23s' })
  })

  it('caps a long announcement and keeps the duplicate out of tab order', () => {
    setTickerWidths(4000, 320)
    setStatus({
      announcements_enabled: true,
      announcements: [{ id: 1, content: '长'.repeat(300) }],
    })

    render(<AnnouncementTicker />)

    const [first, duplicate] = getCopies() as unknown as HTMLElement[]
    const preview = within(first).getAllByRole('button')[0].textContent ?? ''

    expect(preview).toContain(`${'长'.repeat(120)}...`)
    expect(preview).not.toContain('长'.repeat(121))
    expect(duplicate.querySelectorAll('button')[0]).toHaveAttribute(
      'tabindex',
      '-1'
    )
  })

  it('opens the full announcement when an entry is clicked', async () => {
    setTickerWidths(900, 320)
    const content = `维护通知 ${'详情'.repeat(80)}`
    setStatus({
      announcements_enabled: true,
      announcements: [{ id: 1, content, publishDate: '2026-08-24T12:00:00Z' }],
    })

    render(<AnnouncementTicker />)

    await userEvent.click(
      within(getCopies()[0] as HTMLElement).getAllByRole('button')[0]
    )

    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain(content)
  })

  it('strips HTML and Markdown markup from the announcement text', () => {
    setStatus({
      announcements_enabled: true,
      announcements: [{ id: 1, content: '<b>维护</b> #通知#' }],
    })

    render(<AnnouncementTicker />)

    expect(
      within(getCopies()[0] as HTMLElement).getByText('维护 通知')
    ).toBeInTheDocument()
    expect(getRegion().querySelector('b')).toBeNull()
  })

  it('renders the text without a date when the publish date is invalid', () => {
    setStatus({
      announcements_enabled: true,
      announcements: [
        { id: 1, content: '维护通知', publishDate: 'not-a-date' },
      ],
    })

    render(<AnnouncementTicker />)

    const list = getCopies()[0] as HTMLElement
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
