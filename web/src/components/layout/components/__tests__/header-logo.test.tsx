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
import { describe, expect, it } from 'vitest'

import { HeaderLogo } from '@/components/layout/components/header-logo'

describe('HeaderLogo', () => {
  it('renders the site logo with rounded-square corners by default', () => {
    render(<HeaderLogo src='/site-logo.png' loading={false} logoLoaded />)

    const logo = screen.getByRole('img', { name: 'logo' })

    expect(logo).toHaveClass('rounded-lg')
    expect(logo).not.toHaveClass('rounded-full')
  })

  it('lets the caller override the corner radius', () => {
    render(
      <HeaderLogo
        src='/site-logo.png'
        loading={false}
        logoLoaded
        className='rounded-md'
      />
    )

    const logo = screen.getByRole('img', { name: 'logo' })

    expect(logo).toHaveClass('rounded-md')
    expect(logo).not.toHaveClass('rounded-lg')
  })
})
