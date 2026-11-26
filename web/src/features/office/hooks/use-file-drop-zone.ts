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
import { useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { droppedFiles } from '../lib/office-upload'

const hasFiles = (event: DragEvent<HTMLElement>) =>
  event.dataTransfer.types.includes('Files')

/**
 * Turns an element into the target of a file drop: it is highlighted while
 * files are dragged over it and the dropped files are handed to onFiles.
 */
export function useFileDropZone(onFiles: (files: File[]) => void) {
  const { t } = useTranslation()
  const [isDragActive, setIsDragActive] = useState(false)

  const reset = () => setIsDragActive(false)

  const handlers = {
    onDragEnter: (event: DragEvent<HTMLElement>) => {
      if (hasFiles(event)) setIsDragActive(true)
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      // Without it the browser opens the dropped file instead.
      if (hasFiles(event)) event.preventDefault()
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node)) reset()
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      event.preventDefault()
      reset()
      const dropped = droppedFiles(event.dataTransfer)
      if (dropped.hasFolder) {
        toast.error(t('Folders cannot be uploaded. Drop their files instead.'))
      }
      if (dropped.files.length > 0) onFiles(dropped.files)
    },
  }

  return { handlers, isDragActive, reset }
}
