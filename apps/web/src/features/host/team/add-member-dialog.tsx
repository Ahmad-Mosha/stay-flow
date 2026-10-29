'use client';

import type { PropertyRole } from '@stay-flow/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Form } from 'react-aria-components';
import { api, isApiError } from '@/api/client';
import { Button } from '@/ui/button';
import { Dialog } from '@/ui/dialog';
import { Select, SelectItem } from '@/ui/select';
import { TextField } from '@/ui/text-field';
import { useHost } from '../host-context';
import { hostKeys } from '../host-keys';
import { roleLabel, rolePlace, roles } from '../roles';

interface AddMemberDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onAdded: (message: string) => void;
}

/** Adds someone with a Stay Flow account to the team, by their email, with a role. */
export function AddMemberDialog({ isOpen, onOpenChange, onAdded }: AddMemberDialogProps) {
  return (
    <Dialog title="Add a person" isOpen={isOpen} onOpenChange={onOpenChange}>
      {(close) => <AddMemberForm onAdded={onAdded} close={close} />}
    </Dialog>
  );
}

function AddMemberForm({
  onAdded,
  close,
}: Pick<AddMemberDialogProps, 'onAdded'> & { close: () => void }) {
  const { property } = useHost();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<PropertyRole>('front_desk');
  const [attempted, setAttempted] = useState(false);

  const add = useMutation({
    mutationFn: () =>
      api('addMember', {
        params: { propertyId: property.id },
        body: { email: email.trim(), role },
      }),
    onSuccess: async (member) => {
      close();
      onAdded(`${member.name} is now ${rolePlace(member.role)} at ${property.name}.`);
      await queryClient.invalidateQueries({ queryKey: hostKeys.team(property.id) });
    },
  });

  const emailProblem = !email.trim()
    ? 'Enter their email'
    : !/^\S+@\S+\.\S+$/.test(email.trim())
      ? 'Enter an email such as nadia@example.com'
      : null;
  return (
    <Form
      validationBehavior="aria"
      onSubmit={(event) => {
        event.preventDefault();
        setAttempted(true);
        if (emailProblem || add.isPending) return;
        add.mutate();
      }}
      className="flex flex-col gap-5"
    >
      <p className="text-small text-ink-2">
        They need a Stay Flow account first. Once added, they see {property.name} when they sign in.
      </p>
      <TextField
        label="Email"
        type="email"
        autoComplete="off"
        value={email}
        onChange={(value) => {
          setEmail(value);
          // The error names the email, so it goes once the email changes.
          add.reset();
        }}
        isRequired
        isDisabled={add.isPending}
        validate={() => (attempted ? emailProblem : null)}
      />
      <Select
        label="Role"
        value={role}
        onChange={(key) => {
          const picked = roles.find((option) => option.role === key);
          if (picked) setRole(picked.role);
        }}
        isRequired
        isDisabled={add.isPending}
      >
        {roles.map((option) => (
          <SelectItem
            key={option.role}
            id={option.role}
            textValue={roleLabel(option.role)}
            detail={option.can}
          >
            {roleLabel(option.role)}
          </SelectItem>
        ))}
      </Select>
      {add.isError && (
        <p role="alert" className="text-small text-danger">
          {isApiError(add.error, 'NO_ACCOUNT')
            ? `No Stay Flow account uses ${email.trim()}. Ask them to sign up, then add them here.`
            : isApiError(add.error, 'ALREADY_MEMBER')
              ? `${email.trim()} is already on the team. Change their role in the list instead.`
              : 'We could not add them. Nothing has changed. Try again in a moment.'}
        </p>
      )}
      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
        <Button variant="secondary" size="lg" onPress={close} isDisabled={add.isPending}>
          Cancel
        </Button>
        <Button type="submit" size="lg" isPending={add.isPending}>
          {add.isPending ? 'Adding' : 'Add to team'}
        </Button>
      </div>
    </Form>
  );
}
