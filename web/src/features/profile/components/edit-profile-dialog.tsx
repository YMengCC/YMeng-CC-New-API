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
import { zodResolver } from '@hookform/resolvers/zod'
import { ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import AvatarEditor, {
  type AvatarEditorRef,
  type Position,
} from 'react-avatar-editor'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { UserAvatar } from '@/components/user-avatar'
import { handleServerError } from '@/lib/handle-server-error'
import { useUserAvatar } from '@/hooks/use-user-avatar'

import { profileFormSchema, type ProfileFormValues } from '../lib/profile-form'
import type { UserProfile } from '../types'

const AVATAR_OUTPUT_SIZE = 512
const AVATAR_PREVIEW_SIZE = 224
const AVATAR_SOURCE_MAX_BYTES = 5 * 1024 * 1024
const AVATAR_ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

interface EditProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: UserProfile | null
  uploadAvatar: (image: Blob) => Promise<number | null>
  deleteAvatar: () => Promise<number | null>
  updateProfile: (data: { display_name?: string }) => Promise<boolean>
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.9)
  })
}

export function EditProfileDialog(props: EditProfileDialogProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const editorRef = useRef<AvatarEditorRef | null>(null)
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: { display_name: props.profile?.display_name ?? '' },
  })
  const [image, setImage] = useState<File | null>(null)
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState<Position>({ x: 0.5, y: 0.5 })
  const [ready, setReady] = useState(false)
  const [fieldError, setFieldError] = useState('')
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const busy = form.formState.isSubmitting
  const avatarVersion = props.profile?.avatar_version ?? 0
  const currentAvatar = useUserAvatar(props.profile?.id, avatarVersion)

  const handleFileChange = (file: File | undefined) => {
    if (!file) return
    if (!AVATAR_ACCEPTED_TYPES.has(file.type)) {
      setFieldError(t('Please choose a JPEG, PNG, or WebP image'))
      return
    }
    if (file.size === 0 || file.size > AVATAR_SOURCE_MAX_BYTES) {
      setFieldError(t('The selected image must be 5 MB or smaller'))
      return
    }
    setFieldError('')
    setScale(1)
    setPosition({ x: 0.5, y: 0.5 })
    setReady(false)
    setRemoveAvatar(false)
    setImage(file)
  }

  const handleSave = async (values: ProfileFormValues) => {
    if (fieldError || (image && !ready)) return
    try {
      // Encode before any request so an unreadable selection cannot result in
      // only half of the intended edit being saved.
      let blob: Blob | null = null
      if (image) {
        if (!editorRef.current) return
        const cropped = editorRef.current.getImage()
        const canvas = document.createElement('canvas')
        canvas.width = AVATAR_OUTPUT_SIZE
        canvas.height = AVATAR_OUTPUT_SIZE
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Canvas unavailable')
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE)
        context.drawImage(cropped, 0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE)
        blob = await canvasToJpeg(canvas)
        if (!blob || blob.size > 1024 * 1024) {
          setFieldError(t('Failed to update avatar'))
          return
        }
      }
      if (values.display_name !== (props.profile?.display_name ?? '')) {
        if (!(await props.updateProfile(values))) return
      }
      if (blob) {
        const version = await props.uploadAvatar(blob)
        if (version === null) return
        setImage(null)
      } else if (removeAvatar) {
        if ((await props.deleteAvatar()) === null) return
        setRemoveAvatar(false)
      }
      props.onOpenChange(false)
    } catch (error) {
      handleServerError(error, t('Failed to update profile'))
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!busy) props.onOpenChange(open)
      }}
      title={t('Edit Profile')}
      description={t('Change your display name and profile picture')}
      contentHeight='auto'
      bodyClassName='space-y-5'
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            disabled={busy}
            onClick={() => props.onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button
            type='submit'
            form='edit-profile-form'
            disabled={busy || Boolean(fieldError) || Boolean(image && !ready)}
          >
            {busy ? <Loader2 className='size-4 animate-spin' /> : null}
            {t('Save Changes')}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id='edit-profile-form'
          onSubmit={form.handleSubmit(handleSave)}
          className='space-y-5'
          aria-busy={busy}
        >
          <div className='flex flex-col items-center gap-3'>
            {image ? (
              <>
                <div
                  role='group'
                  aria-label={t('Avatar crop')}
                  tabIndex={0}
                  className='max-w-full outline-offset-4'
                  onKeyDown={(event) => {
                    if (
                      busy ||
                      ![
                        'ArrowLeft',
                        'ArrowRight',
                        'ArrowUp',
                        'ArrowDown',
                      ].includes(event.key)
                    ) {
                      return
                    }
                    event.preventDefault()
                    setPosition((previous) => ({
                      x: Math.min(
                        1,
                        Math.max(
                          0,
                          previous.x +
                            (event.key === 'ArrowRight' ? 0.02 : 0) -
                            (event.key === 'ArrowLeft' ? 0.02 : 0)
                        )
                      ),
                      y: Math.min(
                        1,
                        Math.max(
                          0,
                          previous.y +
                            (event.key === 'ArrowDown' ? 0.02 : 0) -
                            (event.key === 'ArrowUp' ? 0.02 : 0)
                        )
                      ),
                    }))
                  }}
                >
                  <AvatarEditor
                    ref={editorRef}
                    image={image}
                    position={position}
                    onPositionChange={setPosition}
                    onImageReady={() => setReady(true)}
                    onLoadFailure={() => {
                      setReady(false)
                      setFieldError(t('Invalid avatar image'))
                    }}
                    width={AVATAR_PREVIEW_SIZE}
                    height={AVATAR_PREVIEW_SIZE}
                    border={16}
                    borderRadius={AVATAR_PREVIEW_SIZE / 2}
                    scale={scale}
                    rotate={0}
                    backgroundColor='#ffffff'
                    disableHiDPIScaling
                    style={{
                      maxWidth: '100%',
                      pointerEvents: busy ? 'none' : 'auto',
                    }}
                  />
                </div>
                <div className='flex w-full max-w-64 items-center gap-3'>
                  <span className='text-muted-foreground text-xs'>
                    {t('Zoom')}
                  </span>
                  <Slider
                    disabled={busy}
                    min={1}
                    max={3}
                    step={0.01}
                    value={[scale]}
                    onValueChange={(value) =>
                      setScale(Array.isArray(value) ? value[0] : value)
                    }
                    aria-label={t('Zoom')}
                  />
                </div>
              </>
            ) : (
              <UserAvatar
                userId={props.profile?.id}
                avatarVersion={removeAvatar ? 0 : avatarVersion}
                name={props.profile?.username}
                className='size-24 text-2xl'
                fallbackClassName='text-2xl'
              />
            )}

            <div className='flex items-center gap-2'>
              <input
                ref={fileInputRef}
                type='file'
                aria-label={t('Upload Avatar')}
                disabled={busy}
                accept='image/jpeg,image/png,image/webp'
                className='sr-only'
                onChange={(event) => {
                  handleFileChange(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className='size-4' />
                {t('Upload Avatar')}
              </Button>
              {currentAvatar && !removeAvatar ? (
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  className='text-destructive hover:text-destructive'
                  disabled={busy}
                  onClick={() => {
                    setImage(null)
                    setRemoveAvatar(true)
                    setFieldError('')
                  }}
                >
                  <Trash2 className='size-4' />
                  {t('Remove Avatar')}
                </Button>
              ) : null}
            </div>
            <p className='text-muted-foreground text-center text-xs'>
              {t(
                'JPEG, PNG, or WebP up to 5 MB. The image is cropped to a square.'
              )}
            </p>
          </div>

          <FormField
            control={form.control}
            name='display_name'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Display Name')}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    disabled={busy}
                    placeholder={props.profile?.username}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {fieldError ? (
            <p role='alert' className='text-destructive text-sm'>
              {fieldError}
            </p>
          ) : null}
        </form>
      </Form>
    </Dialog>
  )
}
