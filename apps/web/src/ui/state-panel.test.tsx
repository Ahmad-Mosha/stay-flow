import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatePanel } from './state-panel';

describe('StatePanel', () => {
  it('renders the title as a heading at the requested level', () => {
    render(<StatePanel eyebrow="No arrivals" title="Nobody is arriving today" headingLevel={3} />);

    expect(
      screen.getByRole('heading', { level: 3, name: 'Nobody is arriving today' }),
    ).toBeInTheDocument();
  });

  it('stays out of the accessibility tree as a live region unless asked to announce', () => {
    render(<StatePanel tone="danger" eyebrow="Connection lost" title="Not confirmed" />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('announces an error as an alert and a success as a status', () => {
    render(
      <>
        <StatePanel announce tone="danger" eyebrow="Connection lost" title="Not confirmed" />
        <StatePanel announce tone="success" eyebrow="Confirmed" title="You are booked" />
      </>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Not confirmed');
    expect(screen.getByRole('status')).toHaveTextContent('You are booked');
  });
});
