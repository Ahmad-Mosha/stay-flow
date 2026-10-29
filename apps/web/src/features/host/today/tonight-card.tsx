import type { TodayResponse } from '@stay-flow/contracts';
import { formatDate, plural } from '@/lib/format';
import { cx } from '@/ui/cx';
import { minutesLeft, type RoomState, type RoomTonight } from './rooms-tonight';

interface TonightCardProps {
  tonight: TodayResponse['tonight'];
  rooms: RoomTonight[];
  now: number;
}

const counts = [
  { key: 'sold', label: 'Sold', swatch: 'bg-tape-in' },
  { key: 'held', label: 'Held', swatch: 'tape-hold' },
  { key: 'free', label: 'Free', swatch: 'border border-rule-strong bg-raised' },
  { key: 'blocked', label: 'Blocked', swatch: 'tape-block' },
] as const;

/** Every room tonight: the four counts, then one tile per room. */
export function TonightCard({ tonight, rooms, now }: TonightCardProps) {
  const taken = tonight.sold + tonight.held;
  const share = tonight.rooms === 0 ? 0 : Math.round((taken / tonight.rooms) * 100);
  const holds = rooms.flatMap((room) =>
    room.state.kind === 'held' ? [{ room, expiresAt: room.state.expiresAt }] : [],
  );
  const firstHold = holds.toSorted((a, b) => a.expiresAt - b.expiresAt)[0];

  return (
    <section
      aria-labelledby="tonight-title"
      className="flex min-w-0 flex-col gap-5 rounded-lg border border-rule bg-paper p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1">
        <h2 id="tonight-title" className="text-[1.0625rem] font-semibold">
          Tonight
        </h2>
        <p className="text-small text-ink-2">
          {taken} of {plural(tonight.rooms, 'room')} {tonight.held > 0 ? 'sold or held' : 'sold'}
          <span className="text-ink-3"> · {share}%</span>
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4">
        {counts.map(({ key, label, swatch }) => (
          <div key={key} className="flex flex-col-reverse gap-1.5">
            <dt className="flex items-center gap-2 text-small text-ink-2">
              <span aria-hidden="true" className={cx('h-2.5 w-3.5 rounded-[3px]', swatch)} />
              {label}
            </dt>
            <dd
              className={cx(
                'numerals text-[2.25rem] leading-none font-semibold',
                tonight[key] === 0 && 'text-ink-3',
              )}
            >
              {tonight[key]}
            </dd>
          </div>
        ))}
      </dl>

      <ul
        aria-label="Rooms tonight"
        className="grid grid-cols-[repeat(auto-fit,minmax(3.75rem,1fr))] gap-2"
      >
        {rooms.map((room) => (
          <RoomTile key={room.id} room={room} now={now} />
        ))}
      </ul>

      {firstHold && (
        <p className="flex items-start gap-2 text-small text-ink-2">
          <span aria-hidden="true" className="tape-hold mt-1 h-2.5 w-3.5 shrink-0 rounded-[3px]" />
          {holds.length === 1
            ? `Room ${firstHold.room.name} is held on the booking page for ${plural(minutesLeft(firstHold.expiresAt, now), 'more minute')}. It becomes free again if the guest does not confirm.`
            : `${plural(holds.length, 'room')} are held on the booking page. The first, room ${firstHold.room.name}, becomes free in ${plural(minutesLeft(firstHold.expiresAt, now), 'minute')} if its guest does not confirm.`}
        </p>
      )}
    </section>
  );
}

// The same fills as the room calendar, so a room looks the same on both.
export const roomTileStyles: Record<RoomState['kind'], string> = {
  free: 'border border-rule bg-raised text-ink-2',
  blocked: 'tape-block border border-block-line text-ink-2',
  held: 'tape-hold border border-hold text-hold-ink',
  in_house: 'border border-tape-in bg-tape-in text-tape-in-ink',
  arriving: 'border border-tape-stay bg-tape-stay text-ink',
  not_arrived: 'border-[1.5px] border-danger bg-tape-stay text-ink',
};

function describe(room: RoomTonight, now: number): { short: string; long: string } {
  const { state } = room;
  switch (state.kind) {
    case 'free':
      return { short: 'Free', long: 'free tonight' };
    case 'blocked':
      return { short: state.reason, long: `blocked: ${state.reason}` };
    case 'held': {
      const minutes = minutesLeft(state.expiresAt, now);
      return {
        short: `Held ${String(minutes)}m`,
        long: `held on the booking page for ${plural(minutes, 'more minute')}`,
      };
    }
    case 'in_house':
      return { short: 'In house', long: `${state.reservation.guest?.name ?? 'guest'} in house` };
    case 'arriving':
      return {
        short: 'Arriving',
        long: `${state.reservation.guest?.name ?? 'guest'} arriving today`,
      };
    case 'not_arrived':
      return {
        short: 'Late',
        long: `${state.reservation.guest?.name ?? 'guest'} due ${formatDate(state.reservation.checkIn)}, not arrived`,
      };
  }
}

function RoomTile({ room, now }: { room: RoomTonight; now: number }) {
  const { short, long } = describe(room, now);
  return (
    <li
      aria-label={`Room ${room.name}, ${long}`}
      title={`${room.unitType}: ${long}`}
      className={cx(
        'flex h-16 min-w-0 flex-col justify-between rounded-md px-2 py-2',
        roomTileStyles[room.state.kind],
      )}
    >
      <span className="font-mono text-small">{room.name}</span>
      <span className="truncate text-[0.6875rem] leading-4 font-medium">{short}</span>
    </li>
  );
}
