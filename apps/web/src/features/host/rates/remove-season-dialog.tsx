'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, isApiError } from '@/api/client';
import { formatMoney } from '@/lib/format';
import { Button } from '@/ui/button';
import { Dialog } from '@/ui/dialog';
import { useHost } from '../host-context';
import { hostKeys } from '../host-keys';
import type { Season } from './seasons';

interface RemoveSeasonDialogProps {
  season: Season;
  /** "18 Dec – 3 Jan", as the list shows it. */
  span: string;
  onClose: () => void;
  onRemoved: (message: string) => void;
}

/** Puts a room type back on its base rate for a season's nights. Mounted only while open. */
export function RemoveSeasonDialog({ season, span, onClose, onRemoved }: RemoveSeasonDialogProps) {
  const { property } = useHost();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) =>
      api('deleteRateOverride', { params: { propertyId: property.id, rateOverrideId: id } }),
    onSuccess: async () => {
      onClose();
      onRemoved(`${season.label} is removed.`);
      await queryClient.invalidateQueries({ queryKey: hostKeys.property(property.id) });
    },
    onError: async (error) => {
      // Someone else removed it first: the list catches up and the dialog has nothing to do.
      if (isApiError(error, 'NOT_FOUND')) {
        onClose();
        await queryClient.invalidateQueries({ queryKey: hostKeys.property(property.id) });
      }
    },
  });

  return (
    <Dialog
      role="alertdialog"
      title={`Remove ${season.label}?`}
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      isDismissable={!remove.isPending}
    >
      {(close) => (
        <div className="flex flex-col gap-5">
          <p className="text-small text-ink-2">
            {season.unitType.name} goes back to its base rate of{' '}
            {formatMoney(season.unitType.baseRateMinor, property.currency)} on the nights of {span}.
            Bookings already made keep their prices.
          </p>
          {remove.isError && (
            <p role="alert" className="text-small text-danger">
              We could not remove the rate. Nothing has changed. Try again in a moment.
            </p>
          )}
          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <Button variant="secondary" size="lg" onPress={close} isDisabled={remove.isPending}>
              Keep rate
            </Button>
            <Button
              variant="danger"
              size="lg"
              isPending={remove.isPending}
              onPress={() => {
                remove.mutate(season.id);
              }}
            >
              {remove.isPending ? 'Removing' : 'Remove rate'}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
