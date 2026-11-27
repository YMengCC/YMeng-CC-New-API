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
import {
  DownloadIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

import { useFileDropZone } from '../hooks/use-file-drop-zone'
import { formatFileSize } from '../lib/office-file-size'
import type { OfficeFile } from '../types'

export type OfficeFilesProps = {
  files: OfficeFile[]
  /** Deletion waits while a task is working in the workspace. */
  isDeleteDisabled?: boolean
  isDeleting?: boolean
  isLoading?: boolean
  isUploading?: boolean
  /** Desktop context sidebar or the compact-screen drawer. */
  variant?: 'panel' | 'sheet'
  onDownload: (path: string) => void
  /** Removes a file or folder of the workspace for good. */
  onRemove: (path: string) => void
  /** Picked or dropped files are uploaded into the workspace. */
  onUpload: (files: File[]) => void
}

type OfficeFileItemProps = {
  file: OfficeFile
  isDeleteDisabled?: boolean
  onDelete: () => void
  onDownload: () => void
}

/** Workspace files of the open session: upload, download and remove. */
export function OfficeFiles(props: OfficeFilesProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const dropZone = useFileDropZone(props.onUpload)
  const [pendingDelete, setPendingDelete] = useState<OfficeFile | null>(null)

  const confirmDelete = () => {
    if (pendingDelete) props.onRemove(pendingDelete.path)
    setPendingDelete(null)
  }

  const uploadControls = (
    <>
      <input
        className='hidden'
        multiple
        onChange={(event) => {
          const files = [...(event.target.files ?? [])]
          if (files.length > 0) props.onUpload(files)
          event.target.value = ''
        }}
        ref={inputRef}
        type='file'
      />
      <Button
        className='border-border/80 bg-background/80 hover:border-primary/40 hover:bg-background h-9 w-full gap-2 rounded-xl border-dashed shadow-2xs transition-colors'
        disabled={props.isUploading}
        onClick={() => inputRef.current?.click()}
        size='sm'
        variant='outline'
      >
        {props.isUploading ? (
          <Spinner data-icon='inline-start' />
        ) : (
          <UploadIcon data-icon='inline-start' />
        )}
        {props.isUploading ? t('Uploading…') : t('Upload file')}
      </Button>
    </>
  )
  const fileList = (
    <>
      <ScrollArea className='min-h-0 flex-1'>
        <OfficeFileList
          files={props.files}
          isDeleteDisabled={props.isDeleteDisabled}
          isLoading={props.isLoading}
          onDelete={setPendingDelete}
          onDownload={props.onDownload}
        />
      </ScrollArea>
      <ConfirmDialog
        destructive
        confirmText={t('Delete')}
        desc={t('It will be removed from the workspace for good.')}
        disabled={props.isDeleteDisabled}
        handleConfirm={confirmDelete}
        isLoading={props.isDeleting}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        open={pendingDelete !== null}
        title={t('Delete "{{name}}"?', {
          name: pendingDelete?.path ?? '',
          interpolation: { escapeValue: false },
        })}
      />
    </>
  )

  if (props.variant === 'panel') {
    return (
      <section
        aria-label={t('Workspace files')}
        className={cn(
          'flex min-h-0 flex-1 flex-col transition-colors',
          dropZone.isDragActive &&
            'bg-primary/5 ring-primary/40 ring-2 ring-inset'
        )}
        {...dropZone.handlers}
      >
        <div className='border-border/80 border-b px-3.5 py-2.5'>
          <div className='flex items-center justify-between gap-2'>
            <h2 className='text-xs font-semibold tracking-wide'>
              {t('Workspace files')}
            </h2>
            <Badge
              className='h-5 px-1.5 text-[11px] tabular-nums'
              variant='secondary'
            >
              {props.files.length}
            </Badge>
          </div>
          <p className='text-muted-foreground mt-1 text-xs leading-4'>
            {dropZone.isDragActive
              ? t('Drop files to upload them to the workspace')
              : t(
                  'Upload files for the task and download what Codex produced.'
                )}
          </p>
        </div>
        <div className='px-3 pt-3 pb-2'>{uploadControls}</div>
        {fileList}
      </section>
    )
  }

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            aria-label={t('Workspace files')}
            className='gap-1.5'
            size='sm'
            variant='outline'
          >
            <FolderOpenIcon data-icon='inline-start' />
            <span className='hidden sm:inline'>{t('Files')}</span>
            {props.files.length > 0 && (
              <Badge
                className='h-4 px-1 text-[10px] tabular-nums'
                variant='secondary'
              >
                {props.files.length}
              </Badge>
            )}
          </Button>
        }
      />
      <SheetContent
        className={cn(
          'flex w-80 flex-col gap-0 p-0',
          dropZone.isDragActive && 'bg-primary/5'
        )}
        side='right'
        {...dropZone.handlers}
      >
        <SheetHeader className='border-b'>
          <SheetTitle>{t('Workspace files')}</SheetTitle>
          <SheetDescription>
            {t('Upload files for the task and download what Codex produced.')}
          </SheetDescription>
        </SheetHeader>
        <div className='p-3'>{uploadControls}</div>
        {fileList}
      </SheetContent>
    </Sheet>
  )
}

type OfficeFileListProps = {
  files: OfficeFile[]
  isDeleteDisabled?: boolean
  isLoading?: boolean
  onDelete: (file: OfficeFile) => void
  onDownload: (path: string) => void
}

/** The workspace tree, or why nothing is listed right now. */
function OfficeFileList(props: OfficeFileListProps) {
  const { t } = useTranslation()

  if (props.isLoading) {
    return <LoadingState message={t('Loading files…')} />
  }
  if (props.files.length === 0) {
    return (
      <div className='px-3 pb-3'>
        <EmptyState
          className='min-h-[160px] py-6'
          icon={FolderIcon}
          title={t('No files yet')}
        />
      </div>
    )
  }
  return (
    <ul className='space-y-1 px-3 pb-3'>
      {props.files.map((file) => (
        <OfficeFileItem
          file={file}
          isDeleteDisabled={props.isDeleteDisabled}
          key={file.path}
          onDelete={() => props.onDelete(file)}
          onDownload={() => props.onDownload(file.path)}
        />
      ))}
    </ul>
  )
}

function OfficeFileItem(props: OfficeFileItemProps) {
  const { t } = useTranslation()
  const isDir = props.file.isDir

  return (
    <li
      className={cn(
        'group hover:border-border/60 hover:bg-background/80 flex items-center gap-2 rounded-lg border border-transparent px-2.5 py-1.5 transition-colors',
        isDir && 'text-muted-foreground'
      )}
    >
      {isDir ? (
        <FolderIcon className='text-primary/80 size-4 shrink-0' />
      ) : (
        <FileIcon className='text-muted-foreground size-4 shrink-0' />
      )}
      <span
        className='min-w-0 flex-1 truncate font-mono text-xs'
        title={props.file.path}
      >
        {props.file.path}
      </span>
      <span className='text-muted-foreground shrink-0 text-[11px] tabular-nums'>
        {isDir ? '' : formatFileSize(props.file.size)}
      </span>
      <div className='flex shrink-0 items-center gap-0.5'>
        {/* A label is read as is: the path must not come out HTML-escaped. */}
        {!isDir && (
          <Button
            aria-label={t('Download {{name}}', {
              name: props.file.path,
              interpolation: { escapeValue: false },
            })}
            className='text-muted-foreground hover:text-foreground size-7'
            onClick={props.onDownload}
            size='icon-sm'
            variant='ghost'
          >
            <DownloadIcon />
          </Button>
        )}
        <Button
          aria-label={t('Delete {{name}}', {
            name: props.file.path,
            interpolation: { escapeValue: false },
          })}
          className='text-muted-foreground hover:text-destructive size-7'
          disabled={props.isDeleteDisabled}
          onClick={props.onDelete}
          size='icon-sm'
          variant='ghost'
        >
          <Trash2Icon />
        </Button>
      </div>
    </li>
  )
}
