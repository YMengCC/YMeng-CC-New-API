import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ConfiguredImage } from '../configured-image'

describe('ConfiguredImage', () => {
  it('renders the configured image and shows one fallback after a load error', () => {
    render(
      <ConfiguredImage
        src='data:image/png;base64,AAAA'
        alt='Configured logo'
        fallback={<span>Image unavailable</span>}
      />
    )

    const image = screen.getByRole('img', { name: 'Configured logo' })
    expect(image).toHaveAttribute('src', 'data:image/png;base64,AAAA')

    fireEvent.error(image)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('Image unavailable')).toBeInTheDocument()
  })
})
