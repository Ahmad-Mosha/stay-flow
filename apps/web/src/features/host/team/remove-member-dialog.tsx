'use client';

import type { MemberResponse } from '@stay-flow/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, isApiError } from '@/api/client';
import { Button } from '@/ui/button';
import { Dialog } from '@/ui/dialog';
import { useHost } from '../host-context';
import { hostKeys } from '../host-keys';

interface RemoveMemberDialogProps {
  member: MemberResponse;
  /** The only owner cannot leave, so the dialog says why instead of asking. */
  soleOwner: boolean;
  onClose: () => void;
  onRemoved: (message: string) => void;
}

/** Takes someone off the team once the owner confirms. Mounted only while open. */
export function RemoveMemberDialog({
  member,
  soleOwner,
  onClose,
  onRemoved,
}: RemoveMemberDialogProps) {
  const { user, property } = useHost();
  const queryClient = useQueryClient();
  const yourself = member.userId === user.id;
  const remove = useMutation({
    mutationFn: () =>
      api('removeMember', { params: { propertyId: property.id, userId: member.userId } }),
    onSuccess: async () => {
      onClose();
      onRemoved(`${member.name} is off the team.`);
      await queryClient.invalidateQueries({ queryKey: hostKeys.team(property.id) });
    },
  });

  if (soleOwner) {
    return (
      <Dialog
        title="Make someone else an owner first"
        isOpen
        onOpenChange={(isOpen) => {
          if (!isOpen) onClose();
        }}
      >
        {(close) => (
          <div className="flex flex-col gap-5">
            <p className="text-small text-ink-2">
              {yourself ? 'You are' : `${member.name} is`} the only owner of {property.name}, and
              every property needs one. Change someone else&apos;s role to owner, then come back.
            </p>
            <div className="flex justify-end pt-1">
              <Button variant="secondary" size="lg" onPress={close}>
                Got it
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    );
  }

  return (
    <Dialog
      role="alertdialog"
      title={yourself ? 'Leave this property?' : `Remove ${member.name}?`}
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      isDismissable={!remove.isPending}
    >
      {(close) => (
        <div className="flex flex-col gap-5">
          <p className="text-small text-ink-2">
            {yourself
              ? `You lose access to ${property.name} at once. Another owner can add you back.`
              : `${member.name} loses access to ${property.name} at once. Their account stays, and you can add them again later.`}
          </p>
          {remove.isError && (
            <p role="alert" className="text-small text-danger">
              {isApiError(remove.error, 'LAST_OWNER')
                ? 'Every property needs an owner. Make someone else an owner first.'
                : 'We could not remove them. Nothing has changed. Try again in a moment.'}
            </p>
          )}
          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <Button variant="secondary" size="lg" onPress={close} isDisabled={remove.isPending}>
              {yourself ? 'Stay' : 'Keep'}
            </Button>
            <Button
              variant="danger"
              size="lg"
              isPending={remove.isPending}
              onPress={() => {
                remove.mutate();
              }}
            >
              {remove.isPending ? 'Removing' : yourself ? 'Leave property' : 'Remove'}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
