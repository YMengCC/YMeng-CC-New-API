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
/** The gateway rejects a workspace upload above this size. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

export type DroppedFiles = {
  files: File[]
  /** A folder was among the dropped items; its contents are not readable. */
  hasFolder: boolean
}

/**
 * The files of a drop. A dropped folder is listed as a file of its own name,
 * so it is told apart through the drag items and left out.
 */
export function droppedFiles(transfer: DataTransfer): DroppedFiles {
  const entries = [...(transfer.items ?? [])]
    .filter((item) => item.kind === 'file')
    .map((item) => item.webkitGetAsEntry?.())
  const files = [...transfer.files]
  const dropped: DroppedFiles = { files: [], hasFolder: false }
  files.forEach((file, index) => {
    if (entries[index]?.isDirectory) {
      dropped.hasFolder = true
      return
    }
    dropped.files.push(file)
  })
  return dropped
}

/** Splits the dropped or picked files by the upload size limit. */
export function splitBySizeLimit(files: File[]): {
  accepted: File[]
  hasOversized: boolean
} {
  return {
    accepted: files.filter((file) => file.size <= MAX_UPLOAD_BYTES),
    hasOversized: files.some((file) => file.size > MAX_UPLOAD_BYTES),
  }
}
