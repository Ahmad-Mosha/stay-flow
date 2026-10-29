'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button as AriaButton } from 'react-aria-components';
import { api } from '@/api/client';
import { formatDate, plural } from '@/lib/format';
import { Button } from '@/ui/button';
import { CloseIcon } from '@/ui/icons';
import { useHost } from '../host-context';
import { hostKeys } from '../host-keys';
import { daysBetween } from './tape';

export interface BlockDetails {
  id: string;
  nights: { from: string; to: string };
  reason: string;
  roomName: string;
  unitTypeName: string;
}

interface BlockPanelProps {
  block: BlockDetails;
  today: string;
  onClose: () => void;
  onReleased: (message: string) => void;
}

/** A blocked room's nights and why, with the way to put them back on sale. */
export function BlockPanel({ block, today, onClose, onReleased }: BlockPanelProps) {
  const { property } = useHost();
  const queryClient = useQueryClient();
  const release = useMutation({
    mutationFn: () =>
      api('deleteBlock', { params: { propertyId: property.id, blockId: block.id } }),
    onSuccess: async () => {
      onReleased(`Room ${block.roomName} is back on sale.`);
      await queryClient.invalidateQueries({ queryKey: hostKeys.property(property.id) });
    },
  });
  const nights = daysBetween(block.nights.from, block.nights.to);
  const over = block.nights.to <= today;

  return (
    <article aria-labelledby="block-reason" className="flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <span className="font-mono text-small tracking-[0.06em] text-ink-2">
          ROOM {block.roomName}
        </span>
        <AriaButton
          aria-label="Close block"
          onPress={onClose}
          className="flex size-10 cursor-pointer items-center justify-center rounded-md border border-rule text-ink-2 outline-hidden data-focus-visible:outline-2 data-focus-visible:outline-action data-hovered:text-ink"
        >
          <CloseIcon className="size-4" />
        </AriaButton>
      </div>

      <div className="flex flex-col gap-2.5">
        <h2
          id="block-reason"
          className="font-display text-[2rem] leading-[1.05] font-normal tracking-[-0.01em] text-balance break-words"
        >
          {block.reason}
        </h2>
        <span className="tape-block inline-flex h-6.5 w-fit items-center rounded-sm border border-block-line px-2 text-label font-semibold text-ink-2">
          <span className="rounded-[3px] bg-paper px-1">Blocked</span>
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 text-small">
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="font-mono text-[0.6875rem] text-ink-3 uppercase">Room</dt>
          <dd>
            {block.roomName} · {block.unitTypeName}
          </dd>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="font-mono text-[0.6875rem] text-ink-3 uppercase">Nights</dt>
          <dd>{plural(nights, 'night')}</dd>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="font-mono text-[0.6875rem] text-ink-3 uppercase">First night</dt>
          <dd>{formatDate(block.nights.from)}</dd>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="font-mono text-[0.6875rem] text-ink-3 uppercase">Back on sale</dt>
          <dd>{formatDate(block.nights.to)}</dd>
        </div>
      </dl>

      {over ? (
        <p className="text-small text-ink-2">These nights are over. The room is on sale again.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            isPending={release.isPending}
            onPress={() => {
              release.mutate();
            }}
          >
            {release.isPending ? 'Putting back on sale' : 'Put back on sale'}
          </Button>
          {release.isError && (
            <p role="alert" className="text-small text-danger">
              That did not go through. The room is still blocked. Try again in a moment.
            </p>
          )}
          <p className="pt-0.5 text-small text-ink-2">
            Guests cannot book room {block.roomName} on these nights. Putting it back on sale
            removes the whole block from the calendar.
          </p>
        </div>
      )}
    </article>
  );
}
