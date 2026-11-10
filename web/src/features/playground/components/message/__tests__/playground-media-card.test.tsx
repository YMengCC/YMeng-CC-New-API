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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { beforeAll, expect, test, vi } from 'vitest'

import type { GeneratedMedia } from '../../../types'
import { PlaygroundMediaCard } from '../playground-media-card'

const image: GeneratedMedia = {
  type: 'image',
  prompt: 'a cat',
  status: 'succeeded',
  url: 'https://example.com/cat.png',
}

const video: GeneratedMedia = {
  type: 'video',
  prompt: 'a wave',
  status: 'succeeded',
  url: 'https://example.com/wave.mp4',
}

beforeAll(() => {
  i18next.addResourceBundle('en', 'translation', {
    Image: 'Image',
    Video: 'Video',
    'Copy media URL': 'Copy media URL',
    'Download image': 'Download image',
    'Download video': 'Download video',
    'Generating...': 'Generating...',
    'Video is being generated, please wait...':
      'Video is being generated, please wait...',
    'Generation failed': 'Generation failed',
    'No media was returned': 'No media was returned',
    'Media preview failed. Please try again.':
      'Media preview failed. Please try again.',
    Retry: 'Retry',
  })
})

test('a successful image renders an img with copy and download actions', () => {
  render(<PlaygroundMediaCard media={image} />)

  const element = screen.getByRole('img', { name: 'a cat' })
  expect(element).toHaveAttribute('src', image.url)
  expect(
    screen.getByRole('button', { name: 'Copy media URL' })
  ).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Download image' })
  ).toBeInTheDocument()
})

test('a successful video renders a video element with controls', () => {
  const { container } = render(<PlaygroundMediaCard media={video} />)

  const element = container.querySelector('video')
  expect(element).toHaveAttribute('src', video.url)
  expect(element).toHaveAttribute('controls')
  expect(
    screen.getByRole('button', { name: 'Download video' })
  ).toBeInTheDocument()
})

test('a pending image shows a loading state and no media element', () => {
  render(
    <PlaygroundMediaCard
      media={{ type: 'image', prompt: 'a cat', status: 'pending' }}
    />
  )

  expect(screen.getByText('Generating...')).toBeInTheDocument()
  expect(screen.queryByRole('img')).toBeNull()
})

test('a pending video shows the video-specific waiting message', () => {
  render(
    <PlaygroundMediaCard
      media={{ type: 'video', prompt: 'a wave', status: 'pending' }}
    />
  )

  expect(
    screen.getByText('Video is being generated, please wait...')
  ).toBeInTheDocument()
})

test('a failed generation shows the failure reason', () => {
  render(
    <PlaygroundMediaCard
      media={{
        type: 'image',
        prompt: 'a cat',
        status: 'failed',
        error: 'Upstream error',
      }}
    />
  )

  expect(screen.getByText('Generation failed')).toBeInTheDocument()
  expect(screen.getByText('Upstream error')).toBeInTheDocument()
})

test('an image load error shows a retry affordance', async () => {
  const user = userEvent.setup()
  render(<PlaygroundMediaCard media={image} />)

  screen
    .getByRole('img', { name: 'a cat' })
    .dispatchEvent(new Event('error', { bubbles: true }))

  expect(
    await screen.findByText('Media preview failed. Please try again.')
  ).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Retry' }))
  expect(screen.getByRole('img', { name: 'a cat' })).toBeInTheDocument()
})

test('the download action opens the media URL with a safe rel', () => {
  const open = vi.spyOn(window, 'open').mockImplementation(() => null)
  render(<PlaygroundMediaCard media={image} />)

  screen.getByRole('button', { name: 'Download image' }).click()
  expect(open).toHaveBeenCalledWith(image.url, '_blank', 'noopener,noreferrer')
  open.mockRestore()
})
