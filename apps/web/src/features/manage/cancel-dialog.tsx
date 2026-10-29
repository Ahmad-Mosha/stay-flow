'use client';

import type { GuestReservationResponse } from '@stay-flow/contracts';
import { useState } from 'react';
import { isApiError } from '@/api/client';
import { formatStay } from '@/lib/format';
import { Button } from '@/ui/button';
import { Dialog } from '@/ui/dialog';
import { TextField } from '@/ui/text-field';
import { RefundLines } from '../booking/refund-lines';

interface CancelDialogProps {
  booking: GuestReservationResponse;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** True while the booking is being read again, so the refund shown may be about to change. */
  refreshing: boolean;
  pending: boolean;
  error: unknown;
  onCancel: (reason: string | undefined) => void;
}

/** Asks once more, with the exact refund, before a cancellation that cannot be undone. */
export function CancelDialog({
  booking,
  isOpen,
  onOpenChange,
  refreshing,
  pending,
  error,
  onCancel,
}: CancelDialogProps) {
  const [reason, setReason] = useState('');
  const refund = booking.refund;

  return (
    <Dialog
      role="alertdialog"
      title="Cancel your stay?"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable={!pending}
    >
      {(close) => (
        <>
          <p className="text-small text-ink-2">
            {booking.unitType.name}, {formatStay(booking.checkIn, booking.checkOut)}, at{' '}
            {booking.property.name}. Cancelling cannot be undone.
          </p>
          {refund && (
            <RefundLines
              totalMinor={booking.totalMinor}
              feeMinor={refund.feeMinor}
              refundMinor={refund.refundMinor}
              currency={booking.currency}
              refundLabel="You get back"
            />
          )}
          <TextField
            multiline
            label="Reason (optional)"
            description="The hotel sees this. It helps them, but you do not have to say."
            value={reason}
            onChange={setReason}
            maxLength={500}
            isDisabled={pending}
          />
          {Boolean(error) && (
            <p role="alert" className="text-small text-danger">
              {isApiError(error, 'REFUND_CHANGED')
                ? 'The refund changed while this page was open, because free cancellation has just ended. Nothing was cancelled. The amounts above are up to date now.'
                : 'We could not cancel the booking. Nothing has changed. Try again in a moment.'}
            </p>
          )}
          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <Button variant="secondary" size="lg" onPress={close} isDisabled={pending}>
              Keep my booking
            </Button>
            <Button
              variant="danger"
              size="lg"
              isPending={pending}
              isDisabled={refreshing && !pending}
              onPress={() => {
                onCancel(reason.trim() || undefined);
              }}
            >
              {pending ? 'Cancelling' : 'Cancel booking'}
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
