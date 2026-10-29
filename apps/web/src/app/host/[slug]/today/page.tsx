import type { Metadata } from 'next';
import { today as todayIn } from '@internationalized/date';
import { hostApi } from '@/api/host-api';
import { tonightRange } from '@/features/host/today/rooms-tonight';
import { TodayView } from '@/features/host/today/today-view';
import { loadHostSession } from '../property';

export const metadata: Metadata = { title: 'Today' };

export default async function TodayPage({ params }: PageProps<'/host/[slug]/today'>) {
  const { slug } = await params;
  const { property } = await loadHostSession(slug);
  const propertyParams = { propertyId: property.id };
  // Both at once: the view reads the calendar again if the API's day turns out to differ.
  const [today, calendar] = await Promise.all([
    hostApi('getToday', { params: propertyParams }),
    hostApi('getRoomCalendar', {
      params: propertyParams,
      query: tonightRange(todayIn(property.timeZone).toString()),
    }),
  ]);
  return <TodayView initial={{ today, calendar }} />;
}
