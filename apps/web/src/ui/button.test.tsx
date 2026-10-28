import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('calls onPress on click and from the keyboard', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(<Button onPress={onPress}>Reserve</Button>);

    await user.click(screen.getByRole('button', { name: 'Reserve' }));
    await user.keyboard('{Enter}');

    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it('while pending, announces progress and ignores presses', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(
      <Button isPending onPress={onPress}>
        Confirm booking
      </Button>,
    );
    const button = screen.getByRole('button', { name: /Confirm booking/ });

    await user.click(button);

    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeInTheDocument();
    expect(onPress).not.toHaveBeenCalled();
  });

  it('cannot submit its form a second time while pending', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: SubmitEvent) => {
      event.preventDefault();
    });
    const { container } = render(
      <form>
        <Button type="submit" isPending>
          Confirm booking
        </Button>
      </form>,
    );
    container.querySelector('form')?.addEventListener('submit', onSubmit);

    await user.click(screen.getByRole('button'));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
