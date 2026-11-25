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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { saveBlob } from '@/lib/dom-utils'
import { handleServerError } from '@/lib/handle-server-error'

import { downloadOfficeFile, listOfficeFiles, uploadOfficeFile } from '../api'

/** Files of a workspace; the agent's results are downloaded from here. */
export function useOfficeFiles(sessionId: string) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const filesQueryKey = ['office', 'files', sessionId] as const

  const filesQuery = useQuery({
    queryKey: filesQueryKey,
    queryFn: () => listOfficeFiles(sessionId),
    enabled: sessionId !== '',
  })
  const upload = useMutation({
    mutationFn: (variables: { file: File; path?: string }) =>
      uploadOfficeFile(sessionId, variables.file, variables.path),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: filesQueryKey }),
  })
  const download = useCallback(
    async (path: string) => {
      try {
        const blob = await downloadOfficeFile(sessionId, path)
        saveBlob(blob, path.split('/').pop() || path)
      } catch (error) {
        handleServerError(error, t('The file could not be downloaded'))
      }
    },
    [sessionId, t]
  )

  return {
    files: filesQuery.data ?? [],
    isLoading: filesQuery.isLoading,
    upload,
    download,
  }
}
