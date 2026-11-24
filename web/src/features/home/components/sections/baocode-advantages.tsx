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
import { Gauge, Shuffle, SquareTerminal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

// BaoCode against the tools beginners usually compare it with. The figures
// are BaoCode's own benchmark (baocode.dev): one idle window, against Cursor.
const BENCHMARKS = [
  {
    labelKey: 'Launch time',
    baocode: '0.18 s',
    cursor: '2–3 s',
    // 0.18 s of about 2.5 s
    ratio: 0.07,
  },
  {
    labelKey: 'Idle memory',
    baocode: '120 MB',
    cursor: '1.9 GB',
    // 120 MB of 1.9 GB
    ratio: 0.06,
  },
] as const

export function BaoCodeAdvantages() {
  const { t } = useTranslation()

  const rivals = [
    {
      icon: SquareTerminal,
      name: 'Claude Code',
      text: t('Visual UI, not a terminal'),
    },
    { icon: Shuffle, name: 'Codex', text: t('Any model, one app') },
    { icon: Gauge, name: 'Cursor', text: t('Native, no Electron') },
  ]

  return (
    <div
      data-relief='raised'
      data-depth-tilt='6'
      data-depth-float='4'
      data-depth-glare=''
      className='relative w-full max-w-md overflow-hidden rounded-2xl border border-[var(--paper-rule)] bg-[var(--paper-tint)]/85 p-4 shadow-[0_20px_44px_-28px_rgba(122,78,20,0.42)] backdrop-blur-xs'
    >
      <div
        aria-hidden
        className='pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[var(--paper-sand)] to-transparent'
      />

      <p
        data-depth-layer='1'
        className='flex flex-wrap items-baseline gap-x-2 font-[family-name:var(--paper-serif)] text-base leading-snug font-semibold text-[var(--paper-ink)]'
      >
        <span className='rounded-md bg-[var(--paper-pill-bg)] px-1.5 py-0.5 font-sans text-[10px] font-bold tracking-[0.16em] text-[var(--paper-pill-ink)] uppercase'>
          {t('Why BaoCode')}
        </span>
        {t('Smoother than Codex, Claude Code and Cursor')}
      </p>

      <dl className='mt-3.5 grid grid-cols-2 gap-2.5'>
        {BENCHMARKS.map((item) => (
          <div
            key={item.labelKey}
            data-relief='plate'
            data-depth-layer='2'
            className='rounded-xl border border-[var(--paper-rule)] bg-[var(--paper)]/85 px-3 py-2.5'
          >
            <dt className='text-[11px] font-medium text-[var(--paper-muted)]'>
              {t(item.labelKey)}
            </dt>
            <dd className='mt-0.5'>
              <div className='flex flex-wrap items-baseline gap-x-1.5'>
                <span className='font-mono text-lg font-bold whitespace-nowrap text-[var(--paper-ink)] tabular-nums'>
                  {item.baocode}
                </span>
                <span className='font-mono text-[11px] whitespace-nowrap text-[var(--paper-faint)] tabular-nums'>
                  vs Cursor {item.cursor}
                </span>
              </div>
              <span className='mt-1.5 block h-1.5 overflow-hidden rounded-full bg-[var(--paper-faint)]/25'>
                <span
                  className='block h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400'
                  style={{ width: `${Math.max(item.ratio * 100, 6)}%` }}
                />
              </span>
            </dd>
          </div>
        ))}
      </dl>

      <ul data-depth-group className='mt-2.5 grid grid-cols-3 gap-2'>
        {rivals.map((rival) => (
          <li
            key={rival.name}
            data-relief='plate'
            data-depth-glare=''
            className='relative flex min-w-0 flex-col gap-0.5 overflow-hidden rounded-xl border border-[var(--paper-pill-border)]/85 bg-[var(--paper-pill-bg)] px-2.5 py-2'
          >
            <span className='flex items-center gap-1 text-[11px] font-medium text-[var(--paper-pill-ink)]'>
              <rival.icon className='size-3 shrink-0' aria-hidden />
              <span className='truncate'>vs {rival.name}</span>
            </span>
            <span className='text-xs leading-snug font-semibold text-[var(--paper-ink)]'>
              {rival.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
