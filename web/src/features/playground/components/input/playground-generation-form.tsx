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
import { ImageIcon, SparklesIcon, VideoIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  PromptInput,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputFooter,
  PromptInputTextarea,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input'
import { ModelGroupSelector } from '@/components/model-group-selector'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

import {
  IMAGE_ACCEPT,
  MAX_ATTACHED_IMAGE_BYTES,
  MAX_ATTACHED_IMAGES,
  MAX_IMAGE_N,
  MAX_VIDEO_DURATION_SECONDS,
} from '../../constants'
import { getSubmittableImageUrls } from '../../lib'
import type {
  GroupOption,
  ImageGenerationOptions,
  ModelOption,
  PlaygroundConfig,
  PlaygroundModelMode,
  VideoGenerationOptions,
} from '../../types'

const IMAGE_SIZES = ['1024x1024', '1024x1536', '1536x1024', 'auto']
const VIDEO_RESOLUTIONS = ['480p', '720p', '1080p']

type PlaygroundGenerationFormProps = {
  mode: Exclude<PlaygroundModelMode, 'chat'>
  config: PlaygroundConfig
  groups: GroupOption[]
  models: ModelOption[]
  disabled?: boolean
  isGenerating?: boolean
  isModelLoading?: boolean
  onGroupChange: (value: string) => void
  onModelChange: (value: string) => void
  onSubmitImage?: (
    prompt: string,
    options: ImageGenerationOptions,
    image?: string
  ) => void
  onSubmitVideo?: (
    prompt: string,
    options: VideoGenerationOptions,
    image?: string
  ) => void
  onStop?: () => void
}

export function PlaygroundGenerationForm({
  mode,
  config,
  groups,
  models,
  disabled,
  isGenerating = false,
  isModelLoading = false,
  onGroupChange,
  onModelChange,
  onSubmitImage,
  onSubmitVideo,
  onStop,
}: PlaygroundGenerationFormProps) {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState(IMAGE_SIZES[0])
  const [count, setCount] = useState(1)
  const [resolution, setResolution] = useState(VIDEO_RESOLUTIONS[1])
  const [duration, setDuration] = useState(5)
  const [image, setImage] = useState('')
  const [isDragActive, setIsDragActive] = useState(false)

  const canSubmit = !disabled && !isGenerating && prompt.trim().length > 0
  const isVideo = mode === 'video'

  const handleSubmit = (message: PromptInputMessage) => {
    if (!canSubmit) return
    const text = prompt.trim()
    const droppedImages = getSubmittableImageUrls(message)
    const referenceImage = droppedImages[0] ?? (image.trim() || undefined)

    if (isVideo) {
      if (droppedImages[0]) setImage(droppedImages[0])
      onSubmitVideo?.(
        text,
        {
          duration,
          resolution,
          ...(referenceImage ? { image: referenceImage } : {}),
        },
        referenceImage
      )
    } else {
      onSubmitImage?.(text, { size, n: count }, referenceImage)
    }
    setPrompt('')
  }

  const handleError = (error: { code: string; message: string }) => {
    if (error.code === 'accept') {
      toast.error(t('Only image files are supported'))
    } else if (error.code === 'max_file_size') {
      toast.error(t('Image must not exceed 10 MiB'))
    } else {
      toast.error(t('You can attach up to 4 images'))
    }
  }

  return (
    <div
      className='flex shrink-0 flex-col gap-1.5 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:gap-2 md:px-4 md:pb-4'
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes('Files')) setIsDragActive(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setIsDragActive(false)
        }
      }}
      onDrop={() => setIsDragActive(false)}
    >
      <div className='border-border bg-background flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-2xl border p-2 shadow-sm md:gap-3 md:p-3'>
        <div className='flex items-center gap-2'>
          {isVideo ? (
            <VideoIcon
              aria-hidden='true'
              className='text-muted-foreground size-4'
            />
          ) : (
            <ImageIcon
              aria-hidden='true'
              className='text-muted-foreground size-4'
            />
          )}
          <span className='text-sm font-medium'>
            {isVideo ? t('Video generation') : t('Image generation')}
          </span>
        </div>

        <div className='flex min-w-0 flex-1 flex-wrap items-center gap-3'>
          <ModelGroupSelector
            disabled={disabled || isModelLoading || groups.length === 0}
            groups={groups}
            models={models}
            onGroupChange={onGroupChange}
            onModelChange={onModelChange}
            selectedGroup={config.group}
            selectedModel={config.model}
          />

          {!isVideo && (
            <>
              <div className='flex items-center gap-2'>
                <Label htmlFor='playground-image-size'>{t('Image size')}</Label>
                <Select
                  onValueChange={(value) => setSize(value ?? IMAGE_SIZES[0])}
                  value={size}
                >
                  <SelectTrigger
                    className='h-8 w-36'
                    id='playground-image-size'
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {IMAGE_SIZES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className='flex items-center gap-2'>
                <Label htmlFor='playground-image-count'>
                  {t('Number of images')}
                </Label>
                <Input
                  className='h-8 w-20'
                  id='playground-image-count'
                  max={MAX_IMAGE_N}
                  min={1}
                  onChange={(event) =>
                    setCount(Number(event.target.value) || 1)
                  }
                  type='number'
                  value={count}
                />
              </div>
            </>
          )}

          {isVideo && (
            <>
              <div className='flex items-center gap-2'>
                <Label htmlFor='playground-video-resolution'>
                  {t('Resolution')}
                </Label>
                <Select
                  onValueChange={(value) =>
                    setResolution(value ?? VIDEO_RESOLUTIONS[1])
                  }
                  value={resolution}
                >
                  <SelectTrigger
                    className='h-8 w-28'
                    id='playground-video-resolution'
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {VIDEO_RESOLUTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className='flex items-center gap-2'>
                <Label htmlFor='playground-video-duration'>
                  {t('Duration (seconds)')}
                </Label>
                <Input
                  className='h-8 w-20'
                  id='playground-video-duration'
                  max={MAX_VIDEO_DURATION_SECONDS}
                  min={1}
                  onChange={(event) =>
                    setDuration(Number(event.target.value) || 1)
                  }
                  type='number'
                  value={duration}
                />
              </div>

              <div className='flex w-full min-w-0 items-center gap-2 md:w-auto md:flex-1'>
                <Label
                  className='shrink-0 text-xs md:text-sm'
                  htmlFor='playground-video-image'
                >
                  {t('First frame image URL (optional)')}
                </Label>
                <Input
                  className='h-8 min-w-0 flex-1'
                  id='playground-video-image'
                  onChange={(event) => setImage(event.target.value)}
                  placeholder='https://'
                  value={image}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <PromptInput
        accept={IMAGE_ACCEPT}
        className='relative'
        groupClassName={cn(
          'bg-background border-border shadow-sm ring-1 ring-border/40 rounded-2xl overflow-hidden focus-within:border-ring/60 focus-within:ring-ring/20',
          isDragActive && 'border-primary bg-primary/5 ring-primary/30'
        )}
        maxFiles={MAX_ATTACHED_IMAGES}
        maxFileSize={MAX_ATTACHED_IMAGE_BYTES}
        onError={handleError}
        onSubmit={handleSubmit}
      >
        <PromptInputBody>
          <PromptInputAttachments>
            {(file) => <PromptInputAttachment data={file} />}
          </PromptInputAttachments>
        </PromptInputBody>
        <PromptInputTextarea
          className='placeholder:text-muted-foreground/70 max-h-[30vh] min-h-16 overflow-y-auto px-3 pt-3 pb-2 text-sm leading-6 md:max-h-[40vh] md:min-h-20 md:px-5 md:pt-4 md:pb-3 md:text-base md:leading-7'
          disabled={disabled}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={t('Describe what you want to generate')}
          value={prompt}
        />
        <PromptInputFooter className='border-border/60 bg-muted/30 border-t px-2 py-1.5 md:px-3 md:py-2.5'>
          <div className='flex w-full items-center justify-between gap-2'>
            <span className='text-muted-foreground hidden text-xs sm:inline'>
              {t('Drop images here or paste')} ·{' '}
              {t('Reference image (model support varies)')}
            </span>
            {isGenerating ? (
              <Button
                aria-label={t('Stop')}
                className='min-h-10 w-full sm:w-auto'
                onClick={onStop}
                type='button'
                variant='destructive'
              >
                <Spinner aria-hidden='true' data-icon='inline-start' />
                {t('Stop')}
              </Button>
            ) : (
              <Button
                className='min-h-10 w-full sm:w-auto'
                disabled={!canSubmit}
                type='submit'
              >
                <SparklesIcon data-icon='inline-start' />
                {t('Generate')}
              </Button>
            )}
          </div>
        </PromptInputFooter>
      </PromptInput>
    </div>
  )
}
