import type { Metadata } from 'next';
import { CheckoutView } from '@/features/booking/checkout/checkout-view';
import { PropertyFooter, PropertyHeader } from '@/features/booking/property-chrome';
import { getProperty } from '../../property';

export async function generateMetadata({
  params,
}: PageProps<'/stay/[slug]/checkout/[holdId]'>): Promise<Metadata> {
  const property = await getProperty((await params).slug);
  return { title: `Confirm your stay at ${property.name}`, robots: { index: false } };
}

export default async function CheckoutPage({
  params,
}: PageProps<'/stay/[slug]/checkout/[holdId]'>) {
  const { slug, holdId } = await params;
  const property = await getProperty(slug);

  return (
    <div className="flex min-h-dvh flex-col">
      <PropertyHeader property={property}>
        <span className="font-mono text-label text-ink-2">Prices in {property.currency}</span>
      </PropertyHeader>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-8 pb-16 sm:px-8 sm:pt-12 sm:pb-20">
        <CheckoutView property={property} holdId={holdId} />
      </main>
      <PropertyFooter />
    </div>
  );
}
