import type { Metadata } from 'next';
import { hostApi } from '@/api/host-api';
import { RatesView } from '@/features/host/rates/rates-view';
import { loadHostSession } from '../property';

export const metadata: Metadata = { title: 'Rates' };

export default async function RatesPage({ params }: PageProps<'/host/[slug]/rates'>) {
  const { slug } = await params;
  const { property } = await loadHostSession(slug);
  const propertyParams = { propertyId: property.id };
  const [unitTypes, rateOverrides] = await Promise.all([
    hostApi('listUnitTypes', { params: propertyParams }),
    hostApi('listRateOverrides', { params: propertyParams }),
  ]);
  return <RatesView initial={{ unitTypes, rateOverrides }} />;
}
