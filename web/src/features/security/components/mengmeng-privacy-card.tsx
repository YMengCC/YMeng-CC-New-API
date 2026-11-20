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
import { useTranslation } from 'react-i18next'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TitledCard } from '@/components/ui/titled-card'
import type { UserProfile } from '@/features/profile/types'

import { MengmengDemo } from './mengmeng-demo'
import { MengmengGatewayMode } from './mengmeng-gateway-mode'
import { MengmengLocalMode } from './mengmeng-local-mode'

type MengmengPrivacyCardProps = {
  profile: UserProfile
  onUpdate: () => void | Promise<void>
}

/** 萌萌的安全小屋: masking on this site, or on the user's own computer. */
export function MengmengPrivacyCard(props: MengmengPrivacyCardProps) {
  const { t } = useTranslation()

  return (
    <TitledCard
      title={t("Mengmeng's Safe House")}
      description={t(
        'Replace sensitive text with placeholders before it reaches an AI provider.'
      )}
      disableHoverEffect
    >
      <Tabs defaultValue='site'>
        <TabsList className='w-full'>
          <TabsTrigger value='site'>{t('Mask on this site')}</TabsTrigger>
          <TabsTrigger value='local'>{t('Mask on my computer')}</TabsTrigger>
        </TabsList>
        <TabsContent value='site' className='pt-2'>
          <MengmengGatewayMode
            profile={props.profile}
            onUpdate={props.onUpdate}
          />
        </TabsContent>
        <TabsContent value='local' className='pt-2'>
          <MengmengLocalMode />
        </TabsContent>
      </Tabs>
      <MengmengDemo />
    </TitledCard>
  )
}
