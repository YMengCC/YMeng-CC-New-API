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
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { handleServerError } from '@/lib/handle-server-error'
import { getServerErrorStatus } from '@/lib/server-error-message'

import { deletePlaygroundFile, uploadPlaygroundFile } from '../api'
import {
  appendUserMessagePair,
  applyMessageEdit,
  createRegeneratedMessages,
  removeMessageByKey,
  toMessageAttachment,
} from '../lib'
import type { ChatSendResult, Message } from '../types'

type UsePlaygroundConversationOptions = {
  messages: Message[]
  updateMessages: (
    updater: Message[] | ((prev: Message[]) => Message[])
  ) => void
  sendChat: (messages: Message[], fileIds?: string[]) => Promise<ChatSendResult>
}

type PendingAttachmentSend = {
  token: number
  controller: AbortController
  // Uploaded ids not yet handed to a chat request.
  uncommittedIds: string[]
}

/** Rejection used when a send with attachments did not reach the server. */
export class AttachmentSendCancelledError extends Error {
  constructor() {
    super('Attachment send cancelled')
    this.name = 'AbortError'
  }
}

function discardUploads(ids: string[]): void {
  for (const id of ids) {
    // Deletion is idempotent; uploads also expire on their own.
    deletePlaygroundFile(id).catch(() => undefined)
  }
}

export function usePlaygroundConversation({
  messages,
  updateMessages,
  sendChat,
}: UsePlaygroundConversationOptions) {
  const { t } = useTranslation()
  const [editingMessageKey, setEditingMessageKey] = useState<string | null>(
    null
  )
  const [isUploading, setIsUploading] = useState(false)
  const messagesRef = useRef(messages)
  const sendTokenRef = useRef(0)
  const pendingSendRef = useRef<PendingAttachmentSend | null>(null)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  /**
   * Abandon an attachment send whose uploads are still in flight: abort the
   * requests, delete uploads that never reached a chat request and ignore any
   * late results so they cannot write into another conversation.
   */
  const cancelPendingSend = useCallback(() => {
    sendTokenRef.current += 1
    const pending = pendingSendRef.current
    pendingSendRef.current = null
    if (!pending) return
    pending.controller.abort()
    discardUploads(pending.uncommittedIds)
    pending.uncommittedIds = []
    setIsUploading(false)
  }, [])

  useEffect(() => cancelPendingSend, [cancelPendingSend])

  const sendWithAttachments = useCallback(
    async (text: string, files: File[]) => {
      cancelPendingSend()
      const token = sendTokenRef.current + 1
      sendTokenRef.current = token
      const pending: PendingAttachmentSend = {
        token,
        controller: new AbortController(),
        uncommittedIds: [],
      }
      pendingSendRef.current = pending
      const isCurrent = () =>
        sendTokenRef.current === token && pendingSendRef.current === pending
      setIsUploading(true)

      try {
        for (const file of files) {
          const uploaded = await uploadPlaygroundFile(
            file,
            pending.controller.signal
          )
          if (!isCurrent()) {
            discardUploads([uploaded.id])
            throw new AttachmentSendCancelledError()
          }
          pending.uncommittedIds.push(uploaded.id)
        }
      } catch (error: unknown) {
        if (!isCurrent()) throw new AttachmentSendCancelledError()
        pendingSendRef.current = null
        discardUploads(pending.uncommittedIds)
        setIsUploading(false)
        handleServerError(
          error,
          t('Attachment upload failed'),
          getServerErrorStatus(error) === 413
            ? { title: t('Each file must not exceed 10 MiB') }
            : undefined
        )
        throw error
      }

      // From here on the ids belong to the chat request and must not be
      // deleted unless that request is rejected before the server accepts it.
      const fileIds = pending.uncommittedIds
      pending.uncommittedIds = []
      pendingSendRef.current = null
      setIsUploading(false)

      const nextMessages = appendUserMessagePair(
        messagesRef.current,
        text,
        undefined,
        files.map(toMessageAttachment)
      )
      updateMessages(nextMessages)
      const result = await sendChat(nextMessages, fileIds)
      if (result === 'accepted') return

      if (result === 'failed') discardUploads(fileIds)
      throw new AttachmentSendCancelledError()
    },
    [cancelPendingSend, sendChat, t, updateMessages]
  )

  /**
   * Send a user message. With attachments the returned promise resolves only
   * after the chat request was accepted, and rejects otherwise so the composer
   * keeps the draft for a retry with fresh uploads.
   */
  const handleSendMessage = useCallback(
    (text: string, files?: File[]): Promise<void> => {
      if (files && files.length > 0) {
        return sendWithAttachments(text, files)
      }

      const nextMessages = appendUserMessagePair(messagesRef.current, text)
      updateMessages(nextMessages)
      void sendChat(nextMessages)
      return Promise.resolve()
    },
    [sendWithAttachments, updateMessages, sendChat]
  )

  const handleRegenerateMessage = useCallback(
    (message: Message) => {
      const nextMessages = createRegeneratedMessages(messages, message.key)
      if (!nextMessages) return

      updateMessages(nextMessages)
      void sendChat(nextMessages)
    },
    [messages, updateMessages, sendChat]
  )

  const handleEditMessage = useCallback((message: Message) => {
    setEditingMessageKey(message.key)
  }, [])

  const handleEditOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setEditingMessageKey(null)
    }
  }, [])

  const applyEdit = useCallback(
    (newContent: string, shouldSubmit: boolean) => {
      if (!editingMessageKey) return

      const editResult = applyMessageEdit(
        messages,
        editingMessageKey,
        newContent,
        shouldSubmit
      )
      if (!editResult) return

      setEditingMessageKey(null)
      updateMessages(editResult.messages)

      if (editResult.shouldSend) {
        void sendChat(editResult.messages)
      }
    },
    [editingMessageKey, messages, updateMessages, sendChat]
  )

  const handleDeleteMessage = useCallback(
    (message: Message) => {
      updateMessages((previousMessages) =>
        removeMessageByKey(previousMessages, message.key)
      )
    },
    [updateMessages]
  )

  return {
    editingMessageKey,
    isUploading,
    cancelPendingSend,
    handleSendMessage,
    handleRegenerateMessage,
    handleEditMessage,
    handleEditOpenChange,
    applyEdit,
    handleDeleteMessage,
  }
}
