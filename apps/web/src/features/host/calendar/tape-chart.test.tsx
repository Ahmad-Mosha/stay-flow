import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axeViolations } from '@/test/axe';
import { arriving, leaving, weeksCalendar } from '@/test/fixtures';
import { windowOf } from './tape';
import { TapeChart, type Selection } from './tape-chart';

function renderChart(selected: Selection | null = null) {
  const onSelect = vi.fn();
  const onAnnounce = vi.fn();
  const view = render(
    <TapeChart
      calendar={weeksCalendar}
      unitTypes={undefined}
      range={windowOf(weeksCalendar.nights, '3w')}
      today="2026-10-29"
      now={Date.parse('2026-10-29T09:00:00Z')}
      currency="EGP"
      selected={selected}
      onSelect={onSelect}
      onPickNights={vi.fn()}
      onAnnounce={onAnnounce}
    />,
  );
  return { ...view, onSelect, onAnnounce };
}

describe('TapeChart', () => {
  it('draws every stay and block on its room, in words a screen reader can follow', () => {
    renderChart();

    const room102 = within(screen.getByRole('group', { name: 'Room 102, Garden Double' }));
    expect(
      room102.getByRole('button', {
        name: 'Omar Farouk, room 102, 25 to 29 October, in house, leaves today',
      }),
    ).toBeInTheDocument();
    expect(
      room102.getByRole('button', {
        name: 'Sara Lindqvist, room 102, 29 October to 1 November, confirmed, arrives today',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Room 104 blocked, 2 to 5 November: Repainting' }),
    ).toHaveTextContent('Repainting');
    expect(screen.getByLabelText('Thu 29 Oct: 2 rooms free')).toHaveTextContent('2');
  });

  it('takes one Tab stop, then moves between bars with the arrow keys', async () => {
    const user = userEvent.setup();
    renderChart({ kind: 'stay', id: arriving.id });

    const sara = screen.getByRole('button', { name: /^Sara Lindqvist/ });
    expect(sara).toHaveAttribute('tabindex', '0');
    expect(sara).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: /^Omar Farouk/ })).toHaveAttribute('tabindex', '-1');

    sara.focus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('button', { name: /^Omar Farouk/ })).toHaveFocus();
    // Room 103 is empty, so down goes on to the block in 104.
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: /^Room 104 blocked/ })).toHaveFocus();
  });

  it('opens a stay or a block when it is pressed', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderChart();

    await user.click(screen.getByRole('button', { name: /^Omar Farouk/ }));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'stay', id: leaving.id });
    await user.click(screen.getByRole('button', { name: /^Room 104 blocked/ }));
    expect(onSelect).toHaveBeenLastCalledWith({
      kind: 'block',
      id: '01a1825d-fec4-7bec-80b4-a135d7ed5d9d',
    });
  });

  it('has no accessibility violations', async () => {
    const { container } = renderChart();
    expect(await axeViolations(container)).toEqual([]);
  });
});
