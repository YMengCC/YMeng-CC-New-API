import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { UserAvatar } from '@/components/user-avatar'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { EditProfileDialog } from '../components/edit-profile-dialog'
import { ProfileHeader } from '../components/profile-header'
import { useProfile } from '../hooks/use-profile'
import type { UserProfile } from '../types'

const profile: UserProfile = {
  id: 1,
  username: 'alice',
  display_name: 'Alice',
  role: 1,
  group: 'default',
  quota: 0,
  used_quota: 0,
  request_count: 0,
  status: 1,
  aff_count: 0,
  aff_quota: 0,
  aff_history_quota: 0,
  created_time: 0,
  avatar_version: 0,
}

let client: QueryClient
function wrapper(props: { children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
  )
}
function renderEditor(avatarVersion = 0) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    profile: { ...profile, avatar_version: avatarVersion },
    updateProfile: vi.fn(async () => true),
    uploadAvatar: vi.fn(async () => 2),
    deleteAvatar: vi.fn(async () => 3),
  }
  render(<EditProfileDialog {...props} />, { wrapper })
  return props
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  useAuthStore.getState().auth.setUser(profile)
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:avatar')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
})
afterEach(() => {
  client.clear()
  useAuthStore.getState().auth.reset()
  vi.restoreAllMocks()
})

describe('profile editing', () => {
  it('trims the display name and submits the edited value', async () => {
    const props = renderEditor()
    fireEvent.change(screen.getByRole('textbox', { name: 'Display Name' }), {
      target: { value: '  Alice Updated  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() =>
      expect(props.updateProfile).toHaveBeenCalledWith({
        display_name: 'Alice Updated',
      })
    )
    expect(props.onOpenChange).toHaveBeenCalledWith(false)
  })
  it('rejects a name over 20 code points and marks the input invalid', async () => {
    const props = renderEditor()
    const input = screen.getByRole('textbox', { name: 'Display Name' })
    fireEvent.change(input, { target: { value: 'abcdefghijklmnopqrstu' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'))
    expect(props.updateProfile).not.toHaveBeenCalled()
  })
  it('sends an explicit empty name to restore username display', async () => {
    const props = renderEditor()
    fireEvent.change(screen.getByRole('textbox', { name: 'Display Name' }), {
      target: { value: '  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() =>
      expect(props.updateProfile).toHaveBeenCalledWith({ display_name: '' })
    )
  })
  it.each([
    new File(['<svg/>'], 'unsafe.svg', { type: 'image/svg+xml' }),
    new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', {
      type: 'image/png',
    }),
  ])(
    'rejects an invalid avatar selection before sending any request',
    (file) => {
      const props = renderEditor()
      fireEvent.change(screen.getByLabelText('Upload Avatar'), {
        target: { files: [file] },
      })
      expect(screen.getByRole('alert')).toBeVisible()
      expect(
        screen.getByRole('button', { name: 'Save Changes' })
      ).toBeDisabled()
      expect(props.uploadAvatar).not.toHaveBeenCalled()
    }
  )
  it('stages removal until save and retains the dialog after a failed removal', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: new Blob([], { type: 'image/png' }),
    })
    const props = renderEditor(1)
    props.deleteAvatar.mockResolvedValueOnce(null as unknown as number)
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Avatar' }))
    expect(props.deleteAvatar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(props.deleteAvatar).toHaveBeenCalled())
    expect(props.onOpenChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(props.onOpenChange).toHaveBeenCalledWith(false))
  })
  it('exposes the edit command on the profile header', () => {
    const onEdit = vi.fn()
    render(
      <ProfileHeader profile={profile} loading={false} onEdit={onEdit} />,
      { wrapper }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit Profile' }))
    expect(onEdit).toHaveBeenCalled()
  })
})

describe('avatar display and profile synchronization', () => {
  it('shares the image request and releases each object URL on unmount', async () => {
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValue({ data: new Blob(['image'], { type: 'image/png' }) })
    const view = render(
      <>
        <UserAvatar userId={1} avatarVersion={1} name='Alice' />
        <UserAvatar userId={1} avatarVersion={1} name='Alice' />
      </>,
      { wrapper }
    )
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(2))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith(
      '/api/user/avatar/1',
      expect.objectContaining({ params: { v: 1 } })
    )
    view.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
  })
  it('keeps initials when the avatar does not exist', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new Error('missing image'))
    render(<UserAvatar userId={1} avatarVersion={1} name='Alice' />, {
      wrapper,
    })
    expect(screen.getByText('A')).toBeInTheDocument()
    await waitFor(() => expect(client.isFetching()).toBe(0))
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
  it('updates the current auth user without losing the newly saved name after an upload', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: true, data: profile },
    })
    vi.spyOn(api, 'put').mockImplementation(async (url) => ({
      data: {
        success: true,
        data:
          url === '/api/user/avatar/self' ? { avatar_version: 2 } : undefined,
      },
    }))
    const hook = renderHook(() => useProfile(), { wrapper })
    await waitFor(() => expect(hook.result.current.loading).toBe(false))
    await act(async () => {
      await hook.result.current.updateProfile({ display_name: 'Updated' })
    })
    await act(async () => {
      await hook.result.current.uploadAvatar(
        new Blob(['jpeg'], { type: 'image/jpeg' })
      )
    })
    expect(useAuthStore.getState().auth.user).toMatchObject({
      display_name: 'Updated',
      avatar_version: 2,
    })
  })
})
