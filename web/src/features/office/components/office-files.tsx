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
  UploadIcon,
} from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
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

import { formatFileSize } from '../lib/office-file-size'
import type { OfficeFile } from '../types'

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

export type OfficeFilesProps = {
  files: OfficeFile[]
  isLoading?: boolean
  isUploading?: boolean
  /** Desktop context sidebar or the compact-screen drawer. */
  variant?: 'panel' | 'sheet'
  onDownload: (path: string) => void
  onUpload: (file: File) => void
}

type OfficeFileItemProps = {
  file: OfficeFile
  onDownload: () => void
}

/** Workspace files of the open session: upload inputs, download results. */
export function OfficeFiles(props: OfficeFilesProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = (list: FileList | null) => {
    const file = list?.[0]
    if (!file) return
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(t('Each file must not exceed 20 MiB'))
      return
    }
    props.onUpload(file)
  }

  const uploadControls = (
    <>
      <input
        className='hidden'
        onChange={(event) => {
          handleFile(event.target.files)
          event.target.value = ''
        }}
        ref={inputRef}
        type='file'
      />
      <Button
        className='w-full'
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
    <ScrollArea className='min-h-0 flex-1'>
      <OfficeFileList
        files={props.files}
        isLoading={props.isLoading}
        onDownload={props.onDownload}
      />
    </ScrollArea>
  )

  if (props.variant === 'panel') {
    return (
      <section
        aria-label={t('Workspace files')}
        className='flex min-h-0 flex-1 flex-col'
      >
        <div className='border-b px-4 py-3'>
          <h2 className='text-xs font-semibold'>{t('Workspace files')}</h2>
          <p className='text-muted-foreground mt-1 text-xs leading-5'>
            {t('Upload files for the task and download what Codex produced.')}
          </p>
        </div>
        <div className='p-3'>{uploadControls}</div>
        {fileList}
      </section>
    )
  }

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button aria-label={t('Workspace files')} size='sm' variant='outline'>
            <FolderOpenIcon data-icon='inline-start' />
            <span className='hidden sm:inline'>{t('Files')}</span>
          </Button>
        }
      />
      <SheetContent className='flex w-80 flex-col gap-0 p-0' side='right'>
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
  isLoading?: boolean
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
          className='min-h-[200px]'
          icon={FolderIcon}
          title={t('No files yet')}
        />
      </div>
    )
  }
  return (
    <ul className='space-y-0.5 px-3 pb-3'>
      {props.files.map((file) => (
        <OfficeFileItem
          file={file}
          key={file.path}
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
        'hover:bg-muted/60 flex items-center gap-2 rounded-md px-2 py-1.5',
        isDir && 'text-muted-foreground'
      )}
    >
      {isDir ? (
        <FolderIcon className='size-4 shrink-0' />
      ) : (
        <FileIcon className='size-4 shrink-0' />
      )}
      <span className='min-w-0 flex-1 truncate font-mono text-xs'>
        {props.file.path}
      </span>
      {!isDir && (
        <>
          <span className='text-muted-foreground shrink-0 text-xs'>
            {formatFileSize(props.file.size)}
          </span>
          <Button
            aria-label={t('Download {{name}}', { name: props.file.path })}
            onClick={props.onDownload}
            size='icon-sm'
            variant='ghost'
          >
            <DownloadIcon />
          </Button>
        </>
      )}
    </li>
  )
}
