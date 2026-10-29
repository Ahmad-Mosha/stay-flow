import type { Metadata } from 'next';
import { today } from '@internationalized/date';
import { hostApi } from '@/api/host-api';
import { CalendarView } from '@/features/host/calendar/calendar-view';
import { windowFromSearch } from '@/features/host/calendar/tape';
import { loadHostSession } from '../property';

export const metadata: Metadata = { title: 'Calendar' };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CalendarPage({
  params,
  searchParams,
}: PageProps<'/host/[slug]/calendar'>) {
  const [{ slug }, search] = await Promise.all([params, searchParams]);
  const { property } = await loadHostSession(slug);
  const range = windowFromSearch(
    { view: first(search.view), from: first(search.from) },
    today(property.timeZone).toString(),
  );
  const propertyParams = { propertyId: property.id };
  const [calendar, unitTypes] = await Promise.all([
    hostApi('getRoomCalendar', {
      params: propertyParams,
      query: { from: range.from, to: range.to },
    }),
    hostApi('listUnitTypes', { params: propertyParams }),
  ]);
  return <CalendarView initial={{ calendar, unitTypes }} />;
}
