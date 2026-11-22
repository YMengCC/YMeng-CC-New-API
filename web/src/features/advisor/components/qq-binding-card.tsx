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
import axios from 'axios'
import { Clock, Copy, Link2, QrCode, RefreshCw, Unlink } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

import {
  type AdvisorBinding,
  type AdvisorCode,
  createAdvisorCode,
  getAdvisorBindings,
  unbindAdvisor,
} from '../api'

function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined
    return data?.message || error.message
  }
  return error instanceof Error ? error.message : String(error)
}

function formatTime(seconds: number): string {
  if (!seconds) return '未知'
  return new Date(seconds * 1000).toLocaleString()
}

export function QqBindingCard() {
  const [bindings, setBindings] = useState<AdvisorBinding[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [code, setCode] = useState<AdvisorCode | null>(null)
  const [expiresAt, setExpiresAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [creating, setCreating] = useState(false)
  const [unbinding, setUnbinding] = useState(false)

  const loadBindings = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await getAdvisorBindings()
      if (res.success) {
        setBindings(res.data?.qqs ?? [])
        setError('')
      } else if (!silent) {
        setError(res.message || '加载绑定状态失败')
      }
    } catch (err) {
      if (!silent) setError(errorMessage(err))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadBindings()
  }, [loadBindings])

  useEffect(() => {
    if (!code || bindings.length > 0) return
    const timer = window.setInterval(() => {
      if (Date.now() <= expiresAt) {
        void loadBindings(true)
      }
    }, 3000)
    return () => window.clearInterval(timer)
  }, [bindings.length, code, expiresAt, loadBindings])

  useEffect(() => {
    if (!code) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [code])

  useEffect(() => {
    if (bindings.length > 0) {
      setCode(null)
    }
  }, [bindings.length])

  const remaining = code
    ? Math.max(0, Math.ceil((expiresAt - now) / 1000))
    : 0

  const createCode = async () => {
    setCreating(true)
    setError('')
    try {
      const res = await createAdvisorCode()
      if (res.success && res.data) {
        setCode(res.data)
        setExpiresAt(Date.now() + res.data.expires_in * 1000)
        setNow(Date.now())
      } else {
        setError(res.message || '生成验证码失败')
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  const copyCode = async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(`/绑定 ${code.code}`)
      toast.success('已复制绑定指令')
    } catch {
      toast.error('复制失败，请手动选择验证码')
    }
  }

  const unbind = async () => {
    if (!window.confirm('确定解除 QQ 绑定吗？解除后群里 /余额 将不可用。')) {
      return
    }
    setUnbinding(true)
    setError('')
    try {
      const res = await unbindAdvisor()
      if (res.success) {
        setBindings([])
        setCode(null)
        toast.success('已解除 QQ 绑定')
      } else {
        setError(res.message || '解绑失败')
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setUnbinding(false)
    }
  }

  let content: ReactNode
  if (loading) {
    content = (
      <div className='space-y-2'>
        <Skeleton className='h-12 w-full' />
        <Skeleton className='h-8 w-40' />
      </div>
    )
  } else if (bindings.length > 0) {
    content = (
      <>
        <div className='space-y-2'>
          {bindings.map((binding) => (
            <div
              key={binding.qq}
              className='flex items-center justify-between gap-3 rounded-lg border px-3 py-2'
            >
              <div className='min-w-0'>
                <div className='font-mono text-sm'>QQ {binding.qq}</div>
                <div className='text-muted-foreground text-xs'>
                  绑定于 {formatTime(binding.bound_at)}
                </div>
              </div>
            </div>
          ))}
        </div>
        <Button
          variant='outline'
          size='sm'
          onClick={unbind}
          disabled={unbinding}
        >
          <Unlink className='size-4' />
          解除全部绑定
        </Button>
      </>
    )
  } else if (code) {
    content = (
      <>
        <div className='bg-muted/50 rounded-xl border p-4 text-center'>
          <div className='text-muted-foreground text-xs'>在 QQ 群发送</div>
          <div className='mt-1 font-mono text-2xl font-bold tracking-[0.15em]'>
            /绑定 {code.code}
          </div>
          <div className='text-muted-foreground mt-1 flex items-center justify-center gap-1 text-xs'>
            <Clock className='size-3' />
            {remaining > 0
              ? `剩余 ${remaining} 秒，等待绑定…`
              : '验证码已过期，请重新生成'}
          </div>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button onClick={copyCode} disabled={remaining <= 0} size='sm'>
            <Copy className='size-4' />
            复制指令
          </Button>
          <Button
            variant='outline'
            onClick={createCode}
            disabled={creating}
            size='sm'
          >
            <RefreshCw
              className={creating ? 'size-4 animate-spin' : 'size-4'}
            />
            重新生成
          </Button>
        </div>
      </>
    )
  } else {
    content = (
      <>
        <p className='text-muted-foreground text-sm'>
          尚未绑定 QQ。生成验证码后，在群里发送{' '}
          <code className='bg-muted rounded px-1 py-0.5 text-xs'>
            /绑定 验证码
          </code>
          。
        </p>
        <Button onClick={createCode} disabled={creating} size='sm'>
          <QrCode className='size-4' />
          生成绑定验证码
        </Button>
      </>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <CardTitle className='flex items-center gap-2'>
              <Link2 className='size-4' />
              QQ 绑定
            </CardTitle>
            <CardDescription>
              绑定后可在 QQ 群使用 /余额 查询额度。
            </CardDescription>
          </div>
          {bindings.length > 0 ? (
            <Badge>已绑定</Badge>
          ) : (
            <Badge variant='outline'>未绑定</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className='space-y-3'>
        {content}
        {error ? <p className='text-destructive text-sm'>{error}</p> : null}
      </CardContent>
    </Card>
  )
}
