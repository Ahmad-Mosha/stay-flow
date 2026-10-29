/** Query keys for a property's dashboard data, so one change can refresh all of it at once. */
export const hostKeys = {
  property: (propertyId: string) => ['host', propertyId] as const,
  today: (propertyId: string) => ['host', propertyId, 'today'] as const,
  calendar: (propertyId: string, from: string, to: string) =>
    ['host', propertyId, 'calendar', from, to] as const,
  unitTypes: (propertyId: string) => ['host', propertyId, 'unit-types'] as const,
  rateOverrides: (propertyId: string) => ['host', propertyId, 'rate-overrides'] as const,
  reservations: (propertyId: string, filters: { q: string | null; status: string | null }) =>
    ['host', propertyId, 'reservations', filters] as const,
  reservation: (propertyId: string, reservationId: string) =>
    ['host', propertyId, 'reservation', reservationId] as const,
};
