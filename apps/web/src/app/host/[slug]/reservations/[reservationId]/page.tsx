import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isApiError } from '@/api/client';
import { hostApi } from '@/api/host-api';
import { ReservationPage } from '@/features/host/reservations/reservation-page';
import { loadHostSession } from '../../property';

export const metadata: Metadata = { title: 'Booking' };

export default async function BookingPage({
  params,
}: PageProps<'/host/[slug]/reservations/[reservationId]'>) {
  const { slug, reservationId } = await params;
  const { property } = await loadHostSession(slug);
  const reservation = await hostApi('getReservation', {
    params: { propertyId: property.id, reservationId },
  }).catch((error: unknown) => {
    if (isApiError(error, 'NOT_FOUND', 'VALIDATION_FAILED')) notFound();
    throw error;
  });
  return <ReservationPage initial={reservation} />;
}
