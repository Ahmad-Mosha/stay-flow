import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TextField } from './text-field';

describe('TextField', () => {
  it('names the input by its label and describes it with the help text', () => {
    render(<TextField label="Email" description="We send your confirmation here." />);

    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveAccessibleDescription(
      'We send your confirmation here.',
    );
  });

  it('marks an invalid field and reads out the error', () => {
    render(
      <TextField
        label="Phone"
        description="With the country code."
        isInvalid
        errorMessage="Enter the full number."
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Phone' });

    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription(
      expect.stringContaining('Enter the full number.') as string,
    );
  });
});
