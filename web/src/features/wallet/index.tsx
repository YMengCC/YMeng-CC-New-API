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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { getAffiliateSummary } from '@/features/affiliate/api'
import { useIsSidebarModuleVisible } from '@/hooks/use-sidebar-config'
import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'
import { getSelf } from '@/lib/api'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import { AffiliateRewardsCard } from './components/affiliate-rewards-card'
import { BillingHistoryDialog } from './components/dialogs/billing-history-dialog'
import { CreemConfirmDialog } from './components/dialogs/creem-confirm-dialog'
import { JingSoftPaymentStatusDialog } from './components/dialogs/jingsoft-payment-status-dialog'
import { PaymentConfirmDialog } from './components/dialogs/payment-confirm-dialog'
import { TransferDialog } from './components/dialogs/transfer-dialog'
import { UserInvoiceDialog } from './components/dialogs/user-invoice-dialog'
import { WithdrawalDialog } from './components/dialogs/withdrawal-dialog'
import { RechargeFormCard } from './components/recharge-form-card'
import { SubscriptionPlansCard } from './components/subscription-plans-card'
import { WalletStatsCard } from './components/wallet-stats-card'
import { DEFAULT_DISCOUNT_RATE, PAYMENT_TYPES } from './constants'
import {
  useTopupInfo,
  usePayment,
  useAffiliate,
  useRedemption,
  useCreemPayment,
  useWaffoPayment,
  useWaffoPancakePayment,
  useBEpusdtPayment,
} from './hooks'
import { useJingSoftPayment } from './hooks/use-jingsoft-payment'
import {
  getDefaultPaymentType,
  getMinTopupAmount,
  dispatchSelectedPayment,
  isBEpusdtPayment,
} from './lib'
import type {
  UserWalletData,
  PaymentMethod,
  PresetAmount,
  CreemProduct,
  WaffoPayMethod,
  BillingHistoryFilters,
} from './types'

type WalletSearch = {
  show_history?: boolean
  p?: number
  page_size?: number
  order_type?: string
  status?: BillingHistoryFilters['status']
  start_date?: string
  end_date?: string
  order_no?: string
}

interface WalletProps {
  search?: WalletSearch
}

export function Wallet(props: WalletProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const search = props.search ?? {}
  const queryClient = useQueryClient()
  const billingFilters: BillingHistoryFilters = useMemo(
    () => ({
      page: search.p,
      pageSize: search.page_size,
      orderType: search.order_type || undefined,
      status: search.status,
      startDate: search.start_date || undefined,
      endDate: search.end_date || undefined,
      orderNo: search.order_no || undefined,
    }),
    [
      search.end_date,
      search.order_no,
      search.order_type,
      search.p,
      search.page_size,
      search.start_date,
      search.status,
    ]
  )
  const updateBillingFilters = useCallback(
    (next: BillingHistoryFilters) => {
      void navigate({
        search: (previous) =>
          ({
            ...previous,
            p: next.page === 1 ? undefined : next.page,
            page_size: next.pageSize,
            order_type: next.orderType || undefined,
            status: next.status,
            start_date: next.startDate || undefined,
            end_date: next.endDate || undefined,
            order_no: next.orderNo || undefined,
          }) as never,
        replace: true,
      })
    },
    [navigate]
  )
  const summaryQuery = useQuery({
    queryKey: ['affiliate', 'summary'],
    queryFn: getAffiliateSummary,
    meta: { errorToast: false, redirectOnServerError: false },
  })
  const { data: affiliateSummary, isError: affiliateSummaryError } =
    summaryQuery
  const [user, setUser] = useState<UserWalletData | null>(null)
  const [userLoading, setUserLoading] = useState(true)
  const [topupAmount, setTopupAmount] = useState(0)
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null)
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<PaymentMethod>()
  const [selectedWaffoMethodIndex, setSelectedWaffoMethodIndex] = useState<
    number | null
  >(null)
  const [selectedBEpusdtMethodIndex, setSelectedBEpusdtMethodIndex] = useState<
    number | null
  >(null)
  const [paymentLoading, setPaymentLoading] = useState<string | null>(null)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [withdrawalDialogOpen, setWithdrawalDialogOpen] = useState(false)
  const [billingDialogOpen, setBillingDialogOpen] = useState(false)
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false)
  const [redemptionCode, setRedemptionCode] = useState('')
  const [creemDialogOpen, setCreemDialogOpen] = useState(false)
  const [selectedCreemProduct, setSelectedCreemProduct] =
    useState<CreemProduct | null>(null)
  const [showSubscriptionPanel, setShowSubscriptionPanel] = useState(true)

  const availableQuota =
    affiliateSummary?.available_quota ?? user?.invite_quota ?? user?.aff_quota

  const { status } = useStatus()
  const { currency } = useSystemConfig()
  const {
    topupInfo,
    presetAmounts,
    loading: topupLoading,
    refetch: refetchTopupInfo,
  } = useTopupInfo()
  const invoiceModuleVisible = useIsSidebarModuleVisible('/invoices')

  const paymentSelectionVersion = useRef(0)

  // Calculate effective exchange rate - when display type is USD, use rate of 1
  const effectiveUsdExchangeRate = useMemo(() => {
    return currency?.quotaDisplayType === 'USD'
      ? 1
      : currency?.usdExchangeRate || 1
  }, [currency?.quotaDisplayType, currency?.usdExchangeRate])
  const {
    amount: paymentAmount,
    calculating,
    processing,
    calculatePaymentAmount,
    processPayment,
  } = usePayment()
  const { linkQuery, transferQuota, transferring } = useAffiliate()
  const { redeeming, redeemCode } = useRedemption()
  const { processing: creemProcessing, processCreemPayment } = useCreemPayment()
  const { processing: waffoProcessing, processWaffoPayment } = useWaffoPayment()
  const { processing: pancakeProcessing, processWaffoPancakePayment } =
    useWaffoPancakePayment()
  const { processing: bepusdtProcessing, processBEpusdtPayment } =
    useBEpusdtPayment()

  // Fetch and refresh user data
  const fetchUser = useCallback(async (propagateError = false) => {
    const accountId = useAuthStore.getState().auth.user?.id
    try {
      setUserLoading(true)
      const response = requireServerSuccess(await getSelf())
      if (!response.data) throw new Error('Failed to refresh user information')
      const current = useAuthStore.getState().auth
      if (current.user?.id !== accountId) return
      setUser(response.data as UserWalletData)
      if (current.user && current.user.id === response.data.id) {
        current.setUser({
          ...current.user,
          quota: response.data.quota,
          used_quota: response.data.used_quota,
          request_count: response.data.request_count,
        })
      }
    } catch (error) {
      if (propagateError) throw error
      handleServerError(error)
    } finally {
      setUserLoading(false)
    }
  }, [])
  const refreshCreditedBalance = useCallback(() => fetchUser(true), [fetchUser])

  const jingSoftPricingSignature = useMemo(
    () =>
      JSON.stringify([
        status?.price,
        topupInfo?.discount,
        topupInfo?.jingsoft?.products,
      ]),
    [status?.price, topupInfo?.discount, topupInfo?.jingsoft?.products]
  )

  const jingSoft = useJingSoftPayment(
    topupInfo?.jingsoft,
    user?.id,
    refreshCreditedBalance,
    refetchTopupInfo,
    jingSoftPricingSignature
  )
  const prefetchJingSoftQuote = jingSoft.prefetchQuote

  const configuredJingSoftChannels = useMemo(() => {
    if (!topupInfo?.jingsoft?.enabled || !topupInfo.jingsoft.available) {
      return []
    }
    return topupInfo.jingsoft.channels.filter((ch) => {
      let methodType: string | undefined
      if (ch.payment_type === 'wxpay') {
        methodType = 'jingsoft_wxpay'
      } else if (ch.payment_type === 'alipay') {
        methodType = 'jingsoft_alipay'
      }
      if (!methodType) return false
      return topupInfo.pay_methods?.some(
        (method) => method.type === methodType && method.channel_id === ch.id
      )
    })
  }, [topupInfo])

  useEffect(() => {
    if (
      !user?.id ||
      confirmDialogOpen ||
      jingSoft.open ||
      configuredJingSoftChannels.length === 0
    ) {
      return
    }
    const minTopup = getMinTopupAmount(topupInfo)
    if (
      !Number.isFinite(topupAmount) ||
      topupAmount <= 0 ||
      topupAmount < minTopup
    ) {
      return
    }

    const isDirect = topupInfo?.jingsoft?.mode === 'direct'
    const matchedProduct =
      !isDirect && selectedPreset !== null && selectedPreset === topupAmount
        ? topupInfo?.jingsoft?.products.find(
            (item) => item.amount === selectedPreset
          )
        : undefined
    if (!isDirect && !matchedProduct) return

    const runPrefetch = () => {
      for (const ch of configuredJingSoftChannels) {
        if (isDirect) {
          prefetchJingSoftQuote({ directAmount: topupAmount }, ch)
        } else if (matchedProduct) {
          prefetchJingSoftQuote({ product: matchedProduct }, ch)
        }
      }
    }

    if (selectedPreset !== null && selectedPreset === topupAmount) {
      runPrefetch()
      return
    }
    const timer = window.setTimeout(runPrefetch, 250)
    return () => window.clearTimeout(timer)
  }, [
    user?.id,
    confirmDialogOpen,
    jingSoft.open,
    configuredJingSoftChannels,
    topupInfo,
    topupAmount,
    selectedPreset,
    prefetchJingSoftQuote,
    jingSoftPricingSignature,
  ])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  useEffect(() => {
    if (search.show_history) setBillingDialogOpen(true)
  }, [search.show_history])

  const handleBillingDialogChange = useCallback(
    (open: boolean) => {
      setBillingDialogOpen(open)
      if (!open && search.show_history) {
        void navigate({
          search: (previous) =>
            ({ ...previous, show_history: undefined }) as never,
          replace: true,
        })
      }
    },
    [navigate, search.show_history]
  )

  // Get current payment method target (selected or default)
  const getCurrentPaymentTarget = useCallback(() => {
    if (selectedPaymentMethod) {
      return {
        type: selectedPaymentMethod.type,
        channelId: selectedPaymentMethod.channel_id,
      }
    }
    const defaultType = getDefaultPaymentType(topupInfo)
    const defaultMethod = topupInfo?.pay_methods?.find(
      (item) => item.type === defaultType
    )
    return {
      type: defaultType,
      channelId: defaultMethod?.channel_id,
    }
  }, [selectedPaymentMethod, topupInfo])

  // Handle preset selection
  const handleSelectPreset = (preset: PresetAmount) => {
    const target = getCurrentPaymentTarget()
    setTopupAmount(preset.value)
    setSelectedPreset(preset.value)
    calculatePaymentAmount(
      preset.value,
      target.type,
      selectedBEpusdtMethodIndex,
      target.channelId
    )
  }

  // Handle topup amount change
  const handleTopupAmountChange = (amount: number) => {
    const target = getCurrentPaymentTarget()
    setTopupAmount(amount)
    setSelectedPreset(null)
    calculatePaymentAmount(
      amount,
      target.type,
      selectedBEpusdtMethodIndex,
      target.channelId
    )
  }

  // Handle payment method selection
  const handlePaymentMethodSelect = async (method: PaymentMethod) => {
    paymentSelectionVersion.current++
    const version = paymentSelectionVersion.current
    jingSoft.selectChannel(null)
    setSelectedPaymentMethod(method)
    setSelectedWaffoMethodIndex(null)

    let resolvedBEpusdtIndex: number | null = null
    if (isBEpusdtPayment(method.type)) {
      if (method.channel_id !== undefined && method.channel_id !== '') {
        const parsedIdx = Number.parseInt(method.channel_id, 10)
        if (Number.isInteger(parsedIdx) && parsedIdx >= 0) {
          resolvedBEpusdtIndex = parsedIdx
        }
      }
    }

    setSelectedBEpusdtMethodIndex(resolvedBEpusdtIndex)
    setPaymentLoading(method.type)

    try {
      const minTopup = Math.max(
        method.min_topup || 0,
        getMinTopupAmount(topupInfo)
      )
      if (topupAmount < minTopup) {
        return
      }

      // Calculate payment amount and show confirmation dialog
      await calculatePaymentAmount(
        topupAmount,
        method.type,
        resolvedBEpusdtIndex,
        method.channel_id
      )
      if (version === paymentSelectionVersion.current) {
        setConfirmDialogOpen(true)
      }
    } finally {
      setPaymentLoading(null)
    }
  }

  // Handle payment confirmation
  const handlePaymentConfirm = async () => {
    if (!selectedPaymentMethod) return

    const success = await dispatchSelectedPayment(
      selectedPaymentMethod,
      topupAmount,
      selectedWaffoMethodIndex,
      {
        regular: processPayment,
        waffo: processWaffoPayment,
        waffoPancake: processWaffoPancakePayment,
        bepusdt: processBEpusdtPayment,
      },
      selectedBEpusdtMethodIndex
    )

    if (success) {
      setConfirmDialogOpen(false)
      await fetchUser()
    }
  }

  // Handle redemption
  const handleRedeem = async () => {
    if (!redemptionCode) return

    const success = await redeemCode(redemptionCode)
    if (success) {
      setRedemptionCode('')
      await fetchUser()
    }
  }

  // Handle transfer
  const handleTransfer = async (amount: number) => {
    const success = await transferQuota(amount)
    if (success) {
      await queryClient.invalidateQueries({
        queryKey: ['affiliate', 'summary'],
      })
      await fetchUser()
    }
    return success
  }

  // Handle Creem product selection
  const handleCreemProductSelect = (product: CreemProduct) => {
    setSelectedCreemProduct(product)
    setCreemDialogOpen(true)
  }

  // Handle Creem payment confirmation
  const handleCreemConfirm = async () => {
    if (!selectedCreemProduct) return

    const success = await processCreemPayment(selectedCreemProduct.productId)
    if (success) {
      setCreemDialogOpen(false)
      setSelectedCreemProduct(null)
      await fetchUser()
    }
  }

  const handleWaffoMethodSelect = async (
    method: WaffoPayMethod,
    index: number
  ) => {
    paymentSelectionVersion.current++
    const version = paymentSelectionVersion.current
    jingSoft.selectChannel(null)
    const loadingKey = `waffo-${index}`
    setSelectedPaymentMethod({
      name: method.name,
      type: PAYMENT_TYPES.WAFFO,
      icon: method.icon,
    })
    setSelectedWaffoMethodIndex(index)
    setSelectedBEpusdtMethodIndex(null)
    setPaymentLoading(loadingKey)

    try {
      await calculatePaymentAmount(topupAmount, PAYMENT_TYPES.WAFFO)
      if (version === paymentSelectionVersion.current) {
        setConfirmDialogOpen(true)
      }
    } finally {
      setPaymentLoading(null)
    }
  }

  // Get discount rate for current topup amount
  const getDiscountRate = useCallback(() => {
    return topupInfo?.discount?.[topupAmount] || DEFAULT_DISCOUNT_RATE
  }, [topupInfo, topupAmount])

  const handleSubscriptionAvailabilityChange = useCallback(
    (available: boolean) => {
      setShowSubscriptionPanel(available)
    },
    []
  )

  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>{t('Wallet')}</SectionPageLayout.Title>
        <SectionPageLayout.Content>
          <div className='mx-auto flex w-full max-w-7xl flex-col gap-4 sm:gap-5'>
            <WalletStatsCard user={user} loading={userLoading} />

            <div
              className={
                showSubscriptionPanel
                  ? 'grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] xl:items-start'
                  : 'grid gap-4'
              }
            >
              <div id='wallet-add-funds' className='scroll-mt-4'>
                <RechargeFormCard
                  jingSoftChannel={jingSoft.channel}
                  onJingSoftPaymentSelect={(channel, product, directAmount) => {
                    paymentSelectionVersion.current++
                    setConfirmDialogOpen(false)
                    setSelectedPaymentMethod(undefined)
                    if (
                      topupInfo?.jingsoft?.mode === 'direct' &&
                      directAmount !== undefined
                    ) {
                      void jingSoft.selectDirectAmount(directAmount, channel)
                    } else if (product) {
                      void jingSoft.selectProduct(product, channel)
                    }
                  }}
                  jingSoftBusy={jingSoft.processing}
                  topupInfo={topupInfo}
                  presetAmounts={presetAmounts}
                  selectedPreset={selectedPreset}
                  onSelectPreset={handleSelectPreset}
                  topupAmount={topupAmount}
                  onTopupAmountChange={handleTopupAmountChange}
                  paymentAmount={paymentAmount}
                  calculating={calculating}
                  onPaymentMethodSelect={handlePaymentMethodSelect}
                  paymentLoading={paymentLoading}
                  redemptionCode={redemptionCode}
                  onRedemptionCodeChange={setRedemptionCode}
                  onRedeem={handleRedeem}
                  redeeming={redeeming}
                  topupLink={topupInfo?.topup_link}
                  loading={topupLoading}
                  priceRatio={(status?.price as number) || 1}
                  usdExchangeRate={effectiveUsdExchangeRate}
                  onOpenBilling={() => setBillingDialogOpen(true)}
                  onOpenInvoice={
                    invoiceModuleVisible
                      ? () => setInvoiceDialogOpen(true)
                      : undefined
                  }
                  creemProducts={topupInfo?.creem_products}
                  enableCreemTopup={topupInfo?.enable_creem_topup}
                  onCreemProductSelect={handleCreemProductSelect}
                  enableWaffoTopup={topupInfo?.enable_waffo_topup}
                  waffoPayMethods={topupInfo?.waffo_pay_methods}
                  waffoMinTopup={topupInfo?.waffo_min_topup}
                  onWaffoMethodSelect={handleWaffoMethodSelect}
                  enableWaffoPancakeTopup={
                    topupInfo?.enable_waffo_pancake_topup
                  }
                  enableBEpusdtTopup={topupInfo?.enable_bepusdt_topup}
                />
              </div>

              <SubscriptionPlansCard
                topupInfo={topupInfo}
                onAvailabilityChange={handleSubscriptionAvailabilityChange}
                userQuota={user?.quota}
                onPurchaseSuccess={fetchUser}
              />
            </div>

            <AffiliateRewardsCard
              user={user}
              summaryQuery={summaryQuery}
              availableQuota={availableQuota}
              linkQuery={linkQuery}
              onTransfer={() => setTransferDialogOpen(true)}
              onWithdraw={() => setWithdrawalDialogOpen(true)}
              withdrawalAvailable={
                !affiliateSummaryError &&
                (affiliateSummary?.available_quota ?? 0) > 0
              }
              complianceConfirmed={
                topupInfo?.payment_compliance_confirmed !== false
              }
            />
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <PaymentConfirmDialog
        open={confirmDialogOpen}
        onOpenChange={setConfirmDialogOpen}
        onConfirm={handlePaymentConfirm}
        topupAmount={topupAmount}
        paymentAmount={paymentAmount}
        paymentMethod={selectedPaymentMethod}
        calculating={calculating}
        processing={
          processing ||
          waffoProcessing ||
          pancakeProcessing ||
          bepusdtProcessing
        }
        paymentFeePercent={
          selectedPaymentMethod && isBEpusdtPayment(selectedPaymentMethod.type)
            ? 0
            : (selectedPaymentMethod?.fee_percent ?? 0)
        }
        discountRate={getDiscountRate()}
        usdExchangeRate={effectiveUsdExchangeRate}
        topupLink={topupInfo?.topup_link}
      />

      <PaymentConfirmDialog
        open={jingSoft.open}
        onOpenChange={(open) => {
          if (!open) jingSoft.reset()
        }}
        onConfirm={jingSoft.confirm}
        topupAmount={
          jingSoft.quote?.topup_amount ??
          jingSoft.product?.amount ??
          jingSoft.directAmount ??
          0
        }
        paymentAmount={jingSoft.quote?.amount ?? 0}
        paymentMethod={
          jingSoft.channel
            ? {
                type: 'jingsoft',
                name: jingSoft.channel.name,
                icon: jingSoft.channel.icon,
              }
            : undefined
        }
        calculating={jingSoft.calculating}
        processing={jingSoft.processing}
        jingSoft={{
          quote: jingSoft.quote,
          qq: jingSoft.qq,
          onQQChange: jingSoft.setQQ,
          available: !!topupInfo?.jingsoft?.available,
          requireQQ:
            (jingSoft.quote?.mode ?? topupInfo?.jingsoft?.mode) !== 'direct',
        }}
      />

      <JingSoftPaymentStatusDialog
        open={!!jingSoft.statusOrder}
        onOpenChange={(open) => {
          if (!open) jingSoft.closeStatus()
        }}
        order={jingSoft.statusOrder}
        queryFailed={jingSoft.statusQueryFailed}
      />

      <TransferDialog
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        onConfirm={handleTransfer}
        availableQuota={availableQuota ?? 0}
        transferring={transferring}
      />

      <WithdrawalDialog
        open={withdrawalDialogOpen}
        onOpenChange={setWithdrawalDialogOpen}
        availableQuota={
          affiliateSummaryError ? 0 : (affiliateSummary?.available_quota ?? 0)
        }
        onSuccess={fetchUser}
      />

      <BillingHistoryDialog
        open={billingDialogOpen}
        onOpenChange={handleBillingDialogChange}
        filters={billingFilters}
        onFiltersChange={updateBillingFilters}
      />

      <UserInvoiceDialog
        open={invoiceDialogOpen}
        onOpenChange={setInvoiceDialogOpen}
      />

      <CreemConfirmDialog
        open={creemDialogOpen}
        onOpenChange={setCreemDialogOpen}
        onConfirm={handleCreemConfirm}
        product={selectedCreemProduct}
        processing={creemProcessing}
      />
    </>
  )
}
