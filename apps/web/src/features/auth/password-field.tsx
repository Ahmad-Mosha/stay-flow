'use client';

import { useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { EyeIcon, EyeOffIcon } from '@/ui/icons';
import { TextField, type TextFieldProps } from '@/ui/text-field';

type PasswordFieldProps = Omit<TextFieldProps, 'type' | 'trailing' | 'label'> & {
  label?: string;
};

/** A password, with a button to show what was typed. */
export function PasswordField({ label = 'Password', ...props }: PasswordFieldProps) {
  const [shown, setShown] = useState(false);
  return (
    <TextField
      {...props}
      label={label}
      type={shown ? 'text' : 'password'}
      trailing={
        <AriaButton
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          onPress={() => {
            setShown((current) => !current);
          }}
          className="flex size-10 cursor-pointer items-center justify-center rounded-sm text-ink-2 outline-hidden data-focus-visible:outline-2 data-focus-visible:outline-action data-hovered:text-ink"
        >
          {shown ? <EyeOffIcon /> : <EyeIcon />}
        </AriaButton>
      }
    />
  );
}
