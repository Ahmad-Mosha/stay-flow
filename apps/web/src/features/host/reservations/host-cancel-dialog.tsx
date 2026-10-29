'use client';

import type { HostReservationDetailResponse } from '@stay-flow/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Form } from 'react-aria-components';
import { api, isApiError } from '@/api/client';
import { formatStay } from '@/lib/format';
import { Button } from '@/ui/button';
import { Checkbox } from '@/ui/checkbox';
import { Dialog } from '@/ui/dialog';
import { TextField } from '@/ui/text-field';
import { RefundLines } from '../../booking/refund-lines';
import { hostKeys } from '../host-keys';

interface HostCancelDialogProps {
  reservation: HostReservationDetailResponse;
  propertyId: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onCancelled: (message: string) => void;
}

/** Cancels on the guest's behalf, with a reason for the history, and can waive the fee. */
export function HostCancelDialog({
  reservation,
  propertyId,
  isOpen,
  onOpenChange,
  onCancelled,
}: HostCancelDialogProps) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [waiveFee, setWaiveFee] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const refund = reservation.refund;
  const feeMinor = waiveFee ? 0 : (refund?.feeMinor ?? 0);

  const cancel = useMutation({
    mutationFn: () =>
      api('cancelReservation', {
        params: { propertyId, reservationId: reservation.id },
        body: { reason: reason.trim(), waiveFee },
      }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(hostKeys.reservation(propertyId, reservation.id), updated);
      onOpenChange(false);
      onCancelled(`Cancelled. ${reservation.guest?.name ?? 'The guest'} gets an email about it.`);
      await queryClient.invalidateQueries({ queryKey: hostKeys.property(propertyId) });
    },
    onError: async (error) => {
      if (isApiError(error, 'INVALID_TRANSITION', 'STAY_ENDED')) {
        await queryClient.invalidateQueries({ queryKey: hostKeys.property(propertyId) });
      }
    },
  });

  return (
    <Dialog
      role="alertdialog"
      title="Cancel this booking?"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable={!cancel.isPending}
    >
      {(close) => (
        <Form
          validationBehavior="aria"
          onSubmit={(event) => {
            event.preventDefault();
            setAttempted(true);
            if (!reason.trim()) return;
            cancel.mutate();
          }}
          className="flex flex-col gap-5"
        >
          <p className="text-small text-ink-2">
            {reservation.guest?.name ?? reservation.reference}, {reservation.unitType.name},{' '}
            {formatStay(reservation.checkIn, reservation.checkOut)}. The room goes back on sale and
            the guest gets an email. This cannot be undone.
          </p>
          {refund && (
            <RefundLines
              totalMinor={reservation.totalMinor}
              feeMinor={feeMinor}
              refundMinor={reservation.totalMinor - feeMinor}
              currency={reservation.currency}
              refundLabel="Refund to the guest"
            />
          )}
          {refund && refund.feeMinor > 0 && (
            <Checkbox
              label="Refund the first night too"
              description="When the hotel cancels, or as a goodwill gesture."
              isSelected={waiveFee}
              onChange={setWaiveFee}
              isDisabled={cancel.isPending}
            />
          )}
          <TextField
            multiline
            label="Reason"
            description="Kept in the booking’s history, such as “Guest called: flight cancelled”."
            value={reason}
            onChange={setReason}
            maxLength={500}
            isRequired
            isDisabled={cancel.isPending}
            validate={(value) => (attempted && !value.trim() ? 'Say why, for the history' : null)}
          />
          {cancel.isError && (
            <p role="alert" className="text-small text-danger">
              {isApiError(cancel.error, 'INVALID_TRANSITION', 'STAY_ENDED')
                ? 'This booking changed meanwhile, so nothing was cancelled. Close this to see where it stands.'
                : 'We could not cancel the booking. Nothing has changed. Try again in a moment.'}
            </p>
          )}
          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <Button variant="secondary" size="lg" onPress={close} isDisabled={cancel.isPending}>
              Keep booking
            </Button>
            <Button type="submit" variant="danger" size="lg" isPending={cancel.isPending}>
              {cancel.isPending ? 'Cancelling' : 'Cancel booking'}
            </Button>
          </div>
        </Form>
      )}
    </Dialog>
  );
}
