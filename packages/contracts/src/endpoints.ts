import { z } from 'zod';
import {
  availabilityCalendarQuerySchema,
  availabilityCalendarResponseSchema,
  availabilityQuerySchema,
  availabilityResponseSchema,
} from './availability.js';
import { signInRequestSchema, signUpRequestSchema, userResponseSchema } from './auth.js';
import { slugSchema } from './common.js';
import {
  hostCancelRequestSchema,
  hostReservationDetailResponseSchema,
  reservationListQuerySchema,
  reservationListResponseSchema,
  roomCalendarQuerySchema,
  roomCalendarResponseSchema,
  todayResponseSchema,
} from './frontdesk.js';
import {
  blockResponseSchema,
  createBlockRequestSchema,
  createRateOverrideRequestSchema,
  createUnitRequestSchema,
  createUnitTypeRequestSchema,
  hostUnitTypeListResponseSchema,
  hostUnitTypeResponseSchema,
  rateOverrideListResponseSchema,
  rateOverrideResponseSchema,
  unitResponseSchema,
  updateUnitRequestSchema,
  updateUnitTypeRequestSchema,
} from './inventory.js';
import {
  createPropertyRequestSchema,
  hostPropertyListResponseSchema,
  hostPropertyResponseSchema,
  propertyResponseSchema,
  updatePropertyRequestSchema,
} from './properties.js';
import {
  confirmReservationRequestSchema,
  guestCancelRequestSchema,
  guestReservationResponseSchema,
  placeHoldRequestSchema,
  reservationResponseSchema,
} from './reservations.js';
import {
  addMemberRequestSchema,
  changeMemberRoleRequestSchema,
  memberResponseSchema,
  teamResponseSchema,
} from './team.js';

/** One endpoint of the API: what it takes and what it answers. The API publishes these as OpenAPI. */
export interface Endpoint {
  readonly method: 'get' | 'post' | 'patch' | 'delete';
  /** The full path, with `{name}` for each path parameter. */
  readonly path: string;
  /** The group it is listed under. */
  readonly tag: string;
  readonly summary: string;
  readonly description?: string;
  /**
   * Who may call it: anyone, a host with a session cookie (and, to change anything, a trusted
   * Origin), or a guest with a manage-booking link in `Authorization: Bearer`.
   */
  readonly auth: 'public' | 'session' | 'guestLink';
  /** Takes an `Idempotency-Key` header: a retry with the same key gets the first answer. */
  readonly idempotent?: true;
  readonly params?: z.ZodObject;
  readonly query?: z.ZodType;
  readonly body?: z.ZodType;
  /** The status of a success. */
  readonly status: 200 | 201 | 204;
  /** The body of a success. None for 204. */
  readonly response?: z.ZodType;
}

/** What the health probes answer while all is well. */
export const healthStatusSchema = z.object({ status: z.literal('ok') });

const uuid = z.uuid();
const propertyParams = z.object({ propertyId: uuid });
const reservationParams = propertyParams.extend({ reservationId: uuid });
const slugParams = z.object({ slug: slugSchema });

/** Every endpoint the API serves. A test holds the API's routes to this list, both ways. */
export const endpoints = {
  liveness: {
    method: 'get',
    path: '/health/live',
    tag: 'Health',
    summary: 'Check the process is up',
    description: 'Never checks dependencies, since restarting the process would not fix them.',
    auth: 'public',
    status: 200,
    response: healthStatusSchema,
  },
  readiness: {
    method: 'get',
    path: '/health/ready',
    tag: 'Health',
    summary: 'Check the process can serve traffic',
    description: 'Fails with 503 when the database is unreachable or the process is shutting down.',
    auth: 'public',
    status: 200,
    response: healthStatusSchema,
  },

  signUp: {
    method: 'post',
    path: '/v1/auth/sign-up',
    tag: 'Auth',
    summary: 'Create a host account and sign in',
    description: 'Sets the session cookie. Rate limited per client.',
    auth: 'public',
    body: signUpRequestSchema,
    status: 201,
    response: userResponseSchema,
  },
  signIn: {
    method: 'post',
    path: '/v1/auth/sign-in',
    tag: 'Auth',
    summary: 'Sign in as a host',
    description: 'Sets the session cookie. Rate limited per client, and per client and email.',
    auth: 'public',
    body: signInRequestSchema,
    status: 200,
    response: userResponseSchema,
  },
  signOut: {
    method: 'post',
    path: '/v1/auth/sign-out',
    tag: 'Auth',
    summary: 'Sign out',
    description: 'Ends the session, if there is one, and clears its cookie.',
    auth: 'public',
    status: 204,
  },
  currentUser: {
    method: 'get',
    path: '/v1/auth/me',
    tag: 'Auth',
    summary: 'Get the signed-in host',
    auth: 'session',
    status: 200,
    response: userResponseSchema,
  },

  getProperty: {
    method: 'get',
    path: '/v1/properties/{slug}',
    tag: 'Booking',
    summary: 'Get a property and its stay rules',
    auth: 'public',
    params: slugParams,
    status: 200,
    response: propertyResponseSchema,
  },
  searchAvailability: {
    method: 'get',
    path: '/v1/properties/{slug}/availability',
    tag: 'Booking',
    summary: 'Find the room types free for a stay, with their prices',
    auth: 'public',
    params: slugParams,
    query: availabilityQuerySchema,
    status: 200,
    response: availabilityResponseSchema,
  },
  getAvailabilityCalendar: {
    method: 'get',
    path: '/v1/properties/{slug}/availability/calendar',
    tag: 'Booking',
    summary: 'Get the free rooms and prices of each night in a month',
    auth: 'public',
    params: slugParams,
    query: availabilityCalendarQuerySchema,
    status: 200,
    response: availabilityCalendarResponseSchema,
  },
  placeHold: {
    method: 'post',
    path: '/v1/properties/{slug}/holds',
    tag: 'Booking',
    summary: 'Hold a room while the guest confirms',
    description:
      'Takes the best-fitting free room of the type for ten minutes. Two holds can never take ' +
      'the same room for the same night: the database refuses the overlap.',
    auth: 'public',
    idempotent: true,
    params: slugParams,
    body: placeHoldRequestSchema,
    status: 201,
    response: reservationResponseSchema,
  },
  confirmReservation: {
    method: 'post',
    path: '/v1/reservations/{id}/confirm',
    tag: 'Booking',
    summary: 'Confirm a hold as a booking',
    description: 'Emails the guest a confirmation with a link to manage the booking.',
    auth: 'public',
    idempotent: true,
    params: z.object({ id: uuid }),
    body: confirmReservationRequestSchema,
    status: 200,
    response: reservationResponseSchema,
  },
  releaseReservation: {
    method: 'post',
    path: '/v1/reservations/{id}/release',
    tag: 'Booking',
    summary: 'Give up a hold and free its room',
    description: 'Releasing a hold that already ended does nothing.',
    auth: 'public',
    params: z.object({ id: uuid }),
    status: 204,
  },

  getGuestReservation: {
    method: 'get',
    path: '/v1/guest/reservation',
    tag: 'Guest',
    summary: 'Open the booking a manage-booking link belongs to',
    auth: 'guestLink',
    status: 200,
    response: guestReservationResponseSchema,
  },
  cancelGuestReservation: {
    method: 'post',
    path: '/v1/guest/reservation/cancel',
    tag: 'Guest',
    summary: 'Cancel the booking, with the refund the guest was shown',
    description: 'Cancels nothing if the refund has changed since, and answers 409 REFUND_CHANGED.',
    auth: 'guestLink',
    body: guestCancelRequestSchema,
    status: 200,
    response: guestReservationResponseSchema,
  },

  listHostProperties: {
    method: 'get',
    path: '/v1/host/properties',
    tag: 'Host: properties',
    summary: 'List the properties the host belongs to, with their role',
    auth: 'session',
    status: 200,
    response: hostPropertyListResponseSchema,
  },
  createProperty: {
    method: 'post',
    path: '/v1/host/properties',
    tag: 'Host: properties',
    summary: 'Create a property, with the host as its owner',
    auth: 'session',
    body: createPropertyRequestSchema,
    status: 201,
    response: hostPropertyResponseSchema,
  },
  getHostProperty: {
    method: 'get',
    path: '/v1/host/properties/{propertyId}',
    tag: 'Host: properties',
    summary: 'Get a property and its settings',
    auth: 'session',
    params: propertyParams,
    status: 200,
    response: hostPropertyResponseSchema,
  },
  updateProperty: {
    method: 'patch',
    path: '/v1/host/properties/{propertyId}',
    tag: 'Host: properties',
    summary: 'Change a property’s settings and stay rules',
    description: 'Bookings keep the terms they were made under.',
    auth: 'session',
    params: propertyParams,
    body: updatePropertyRequestSchema,
    status: 200,
    response: hostPropertyResponseSchema,
  },

  listTeam: {
    method: 'get',
    path: '/v1/host/properties/{propertyId}/members',
    tag: 'Host: team',
    summary: 'List the people who run the property',
    auth: 'session',
    params: propertyParams,
    status: 200,
    response: teamResponseSchema,
  },
  addMember: {
    method: 'post',
    path: '/v1/host/properties/{propertyId}/members',
    tag: 'Host: team',
    summary: 'Add a host to the team, with a role',
    auth: 'session',
    params: propertyParams,
    body: addMemberRequestSchema,
    status: 201,
    response: memberResponseSchema,
  },
  changeMemberRole: {
    method: 'patch',
    path: '/v1/host/properties/{propertyId}/members/{userId}',
    tag: 'Host: team',
    summary: 'Change a member’s role',
    description: 'A property always keeps at least one owner.',
    auth: 'session',
    params: propertyParams.extend({ userId: uuid }),
    body: changeMemberRoleRequestSchema,
    status: 200,
    response: memberResponseSchema,
  },
  removeMember: {
    method: 'delete',
    path: '/v1/host/properties/{propertyId}/members/{userId}',
    tag: 'Host: team',
    summary: 'Remove a member from the team',
    auth: 'session',
    params: propertyParams.extend({ userId: uuid }),
    status: 204,
  },

  listUnitTypes: {
    method: 'get',
    path: '/v1/host/properties/{propertyId}/unit-types',
    tag: 'Host: rooms and rates',
    summary: 'List the room types, with their rooms',
    auth: 'session',
    params: propertyParams,
    status: 200,
    response: hostUnitTypeListResponseSchema,
  },
  createUnitType: {
    method: 'post',
    path: '/v1/host/properties/{propertyId}/unit-types',
    tag: 'Host: rooms and rates',
    summary: 'Add a room type',
    auth: 'session',
    params: propertyParams,
    body: createUnitTypeRequestSchema,
    status: 201,
    response: hostUnitTypeResponseSchema,
  },
  updateUnitType: {
    method: 'patch',
    path: '/v1/host/properties/{propertyId}/unit-types/{unitTypeId}',
    tag: 'Host: rooms and rates',
    summary: 'Change a room type’s details or base rate',
    auth: 'session',
    params: propertyParams.extend({ unitTypeId: uuid }),
    body: updateUnitTypeRequestSchema,
    status: 200,
    response: hostUnitTypeResponseSchema,
  },
  createUnit: {
    method: 'post',
    path: '/v1/host/properties/{propertyId}/units',
    tag: 'Host: rooms and rates',
    summary: 'Add a room',
    auth: 'session',
    params: propertyParams,
    body: createUnitRequestSchema,
    status: 201,
    response: unitResponseSchema,
  },
  updateUnit: {
    method: 'patch',
    path: '/v1/host/properties/{propertyId}/units/{unitId}',
    tag: 'Host: rooms and rates',
    summary: 'Rename a room',
    auth: 'session',
    params: propertyParams.extend({ unitId: uuid }),
    body: updateUnitRequestSchema,
    status: 200,
    response: unitResponseSchema,
  },
  listRateOverrides: {
    method: 'get',
    path: '/v1/host/properties/{propertyId}/rate-overrides',
    tag: 'Host: rooms and rates',
    summary: 'List the seasonal rates',
    auth: 'session',
    params: propertyParams,
    status: 200,
    response: rateOverrideListResponseSchema,
  },
  createRateOverride: {
    method: 'post',
    path: '/v1/host/properties/{propertyId}/rate-overrides',
    tag: 'Host: rooms and rates',
    summary: 'Set a seasonal rate for a room type',
    description: 'Seasonal rates of one room type never overlap: the database refuses it.',
    auth: 'session',
    params: propertyParams,
    body: createRateOverrideRequestSchema,
    status: 201,
    response: rateOverrideResponseSchema,
  },
  deleteRateOverride: {
    method: 'delete',
    path: '/v1/host/properties/{propertyId}/rate-overrides/{rateOverrideId}',
    tag: 'Host: rooms and rates',
    summary: 'Remove a seasonal rate',
    auth: 'session',
    params: propertyParams.extend({ rateOverrideId: uuid }),
    status: 204,
  },

  listReservations: {
    method: 'get',
    path: '/v1/host/properties/{propertyId}/reservations',
    tag: 'Host: reservations',
    summary: 'List reservations, newest first, a page at a time',
    auth: 'session',
    params: propertyParams,
    query: reservationListQuerySchema,
    status: 200,
    response: reservationListResponseSchema,
  },
  getReservation: {
    method: 'get',
    path: '/v1/host/properties/{propertyId}/reservations/{reservationId}',
    tag: 'Host: reservations',
    summary: 'Get a reservation with its history',
    auth: 'session',
    params: reservationParams,
    status: 200,
    response: hostReservationDetailResponseSchema,
  },
  checkIn: {
    method: 'post',
    path: '/v1/host/properties/{propertyId}/reservations/{reservationId}/check-in',
    tag: 'Host: reservations',
    summary: 'Check the guest in',
    auth: 'session',
    params: reservationParams,
    status: 200,
    response: hostReservationDetailResponseSchema,
  },
  checkOut: {
    method: 'post',
    path: '/v1/host/properties/{propertyId}/reservations/{reservationId}/check-out',
    tag: 'Host: reservations',
    summary: 'Check the guest out',
    description: 'An early departure gives back the nights from tonight on.',
    auth: 'session',
    params: reservationParams,
    status: 200,
    response: hostReservationDetailResponseSchema,
  },
  markNoShow: {
    method: 'post',
    path: '/v1/host/properties/{propertyId}/reservations/{reservationId}/no-show',
    tag: 'Host: reservations',
    summary: 'Mark a guest who never came as a no-show, and free the room',
    auth: 'session',
    params: reservationParams,
    status: 200,
    response: hostReservationDetailResponseSchema,
  },
  cancelReservation: {
    method: 'post',
    path: '/v1/host/properties/{propertyId}/reservations/{reservationId}/cancel',
    tag: 'Host: reservations',
    summary: 'Cancel a booking, refunding by its cancellation policy',
    description: 'Emails the guest. The host may waive the cancellation fee.',
    auth: 'session',
    params: reservationParams,
    body: hostCancelRequestSchema,
    status: 200,
    response: hostReservationDetailResponseSchema,
  },

  getToday: {
    method: 'get',
    path: '/v1/host/properties/{propertyId}/today',
    tag: 'Host: front desk',
    summary: 'Get today’s arrivals, departures, guests in house, and rooms tonight',
    auth: 'session',
    params: propertyParams,
    status: 200,
    response: todayResponseSchema,
  },
  getRoomCalendar: {
    method: 'get',
    path: '/v1/host/properties/{propertyId}/calendar',
    tag: 'Host: front desk',
    summary: 'Get each room’s stays and blocks over a range of nights',
    auth: 'session',
    params: propertyParams,
    query: roomCalendarQuerySchema,
    status: 200,
    response: roomCalendarResponseSchema,
  },
  createBlock: {
    method: 'post',
    path: '/v1/host/properties/{propertyId}/blocks',
    tag: 'Host: front desk',
    summary: 'Take a room out of service for some nights',
    description: 'Races with guests’ holds like any booking: exactly one of them gets each night.',
    auth: 'session',
    params: propertyParams,
    body: createBlockRequestSchema,
    status: 201,
    response: blockResponseSchema,
  },
  deleteBlock: {
    method: 'delete',
    path: '/v1/host/properties/{propertyId}/blocks/{blockId}',
    tag: 'Host: front desk',
    summary: 'Put a blocked room back on sale',
    auth: 'session',
    params: propertyParams.extend({ blockId: uuid }),
    status: 204,
  },
} as const satisfies Record<string, Endpoint>;

export type EndpointName = keyof typeof endpoints;
