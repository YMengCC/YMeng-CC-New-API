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
import i18next from 'i18next'
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'

import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

import {
  getUserProfile,
  removeUserAvatar,
  updateUserProfile,
  updateUserSettings,
  uploadUserAvatar,
} from '../api'
import type {
  UserProfile,
  UpdateUserRequest,
  UpdateUserSettingsRequest,
} from '../types'

// ============================================================================
// Profile Hook
// ============================================================================

export function useProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [avatarUpdating, setAvatarUpdating] = useState(false)

  // Fetch user profile (with optional silent mode)
  const fetchProfile = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true)
      }
      const response = await getUserProfile()

      if (response.success && response.data) {
        setProfile(response.data)
      } else if (!silent) {
        handleServerError(response, i18next.t('Failed to load profile'))
      }
    } catch (error) {
      if (!silent) {
        handleServerError(error, i18next.t('Failed to load profile'))
      }
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [])

  // Refresh profile silently (without loading state)
  const refreshProfile = useCallback(async () => {
    await fetchProfile(true)
  }, [fetchProfile])

  // Update user profile
  const updateProfile = useCallback(
    async (data: UpdateUserRequest): Promise<boolean> => {
      const userId = useAuthStore.getState().auth.user?.id
      try {
        setUpdating(true)
        const response = await updateUserProfile(data)

        if (response.success) {
          const auth = useAuthStore.getState().auth
          if (
            auth.user &&
            auth.user.id === userId &&
            data.display_name !== undefined
          ) {
            auth.setUser({
              ...auth.user,
              display_name: data.display_name.trim(),
            })
          }
          toast.success(i18next.t('Profile updated successfully'))
          await refreshProfile() // Refresh profile silently
          return true
        }

        handleServerError(response, i18next.t('Failed to update profile'))
        return false
      } catch (error) {
        handleServerError(error, i18next.t('Failed to update profile'))
        return false
      } finally {
        setUpdating(false)
      }
    },
    [refreshProfile]
  )

  // Update user settings
  const updateSettings = useCallback(
    async (data: UpdateUserSettingsRequest): Promise<boolean> => {
      try {
        setUpdating(true)
        const response = await updateUserSettings(data)

        if (response.success) {
          toast.success(i18next.t('Settings updated successfully'))
          await refreshProfile() // Refresh profile silently
          return true
        }

        handleServerError(response, i18next.t('Failed to update settings'))
        return false
      } catch (error) {
        handleServerError(error, i18next.t('Failed to update settings'))
        return false
      } finally {
        setUpdating(false)
      }
    },
    [refreshProfile]
  )

  // Replace the avatar; returns the new version so callers can update the
  // signed-in user's cache key immediately.
  const uploadAvatar = useCallback(
    async (image: Blob): Promise<number | null> => {
      const userId = useAuthStore.getState().auth.user?.id
      try {
        setAvatarUpdating(true)
        const response = await uploadUserAvatar(image)
        if (!response.success || response.data?.avatar_version === undefined) {
          handleServerError(response, i18next.t('Failed to update avatar'))
          return null
        }
        const auth = useAuthStore.getState().auth
        if (auth.user && auth.user.id === userId) {
          auth.setUser({
            ...auth.user,
            avatar_version: response.data.avatar_version,
          })
        }
        await refreshProfile()
        toast.success(i18next.t('Avatar updated successfully'))
        return response.data?.avatar_version ?? null
      } catch (error) {
        handleServerError(error, i18next.t('Failed to update avatar'))
        return null
      } finally {
        setAvatarUpdating(false)
      }
    },
    [refreshProfile]
  )

  // Remove the avatar; the generated initials block takes over again.
  const deleteAvatar = useCallback(async (): Promise<number | null> => {
    const userId = useAuthStore.getState().auth.user?.id
    try {
      setAvatarUpdating(true)
      const response = await removeUserAvatar()
      if (!response.success || response.data?.avatar_version === undefined) {
        handleServerError(response, i18next.t('Failed to remove avatar'))
        return null
      }
      const auth = useAuthStore.getState().auth
      if (auth.user && auth.user.id === userId) {
        auth.setUser({
          ...auth.user,
          avatar_version: response.data.avatar_version,
        })
      }
      await refreshProfile()
      toast.success(i18next.t('Avatar removed successfully'))
      return response.data?.avatar_version ?? null
    } catch (error) {
      handleServerError(error, i18next.t('Failed to remove avatar'))
      return null
    } finally {
      setAvatarUpdating(false)
    }
  }, [refreshProfile])

  // Initial fetch
  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  return {
    profile,
    loading,
    updating,
    avatarUpdating,
    fetchProfile,
    refreshProfile,
    updateProfile,
    uploadAvatar,
    deleteAvatar,
    updateSettings,
  }
}
