import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { reservationStatusSchema } from '@stay-flow/contracts';
import { StatusTape, tapeLabel, type TapeStatus } from './status-tape';

const statuses: TapeStatus[] = [...reservationStatusSchema.options, 'blocked'];

describe('StatusTape', () => {
  it.each(statuses)('writes the name of the %s status on the tape', (status) => {
    render(<StatusTape status={status} />);

    expect(screen.getByText(tapeLabel(status))).toBeInTheDocument();
  });

  it('gives every status its own name', () => {
    expect(new Set(statuses.map(tapeLabel)).size).toBe(statuses.length);
  });

  it('lets the caller replace the name with more detail', () => {
    render(<StatusTape status="held">Held · 6 min</StatusTape>);

    expect(screen.getByText('Held · 6 min')).toBeInTheDocument();
  });
});
