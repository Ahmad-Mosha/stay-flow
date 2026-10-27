import { Injectable } from '@nestjs/common';
import { isPgError, PgErrorCode } from '../../platform/database/pg-errors.js';
import { AppError } from '../../platform/errors/app-error.js';
import { IdentityService } from '../identity/identity.service.js';
import { type Membership, MembershipsRepository } from './memberships.repository.js';
import type { PropertyRole } from './policy.js';

export interface Member extends Membership {
  readonly name: string;
  readonly email: string;
}

const LAST_OWNER_DETAIL = 'Every property needs an owner. Make someone else an owner first.';

@Injectable()
export class TeamService {
  constructor(
    private readonly memberships: MembershipsRepository,
    private readonly identity: IdentityService,
  ) {}

  async list(propertyId: string): Promise<Member[]> {
    const memberships = await this.memberships.listByProperty(propertyId);
    const users = await this.identity.findUsers(memberships.map((member) => member.userId));
    const usersById = new Map(users.map((user) => [user.id, user]));
    return memberships.flatMap((membership) => {
      const user = usersById.get(membership.userId);
      return user === undefined ? [] : [{ ...membership, name: user.name, email: user.email }];
    });
  }

  async add(propertyId: string, email: string, role: PropertyRole): Promise<Member> {
    const user = await this.identity.findUserByEmail(email);
    if (user === undefined) {
      throw new AppError('NO_ACCOUNT', 'No account uses this email. Ask them to sign up first.');
    }
    const membership = await this.memberships.insert({ propertyId, userId: user.id, role });
    if (membership === undefined) {
      throw new AppError('ALREADY_MEMBER', `${user.name} is already on this property's team.`);
    }
    return { ...membership, name: user.name, email: user.email };
  }

  async changeRole(propertyId: string, userId: string, role: PropertyRole): Promise<Member> {
    const membership = await keepingAnOwner(() =>
      this.memberships.updateRole(propertyId, userId, role),
    );
    if (membership === undefined) {
      throw notAMember();
    }
    const [user] = await this.identity.findUsers([userId]);
    if (user === undefined) {
      throw notAMember();
    }
    return { ...membership, name: user.name, email: user.email };
  }

  async remove(propertyId: string, userId: string): Promise<void> {
    if (!(await keepingAnOwner(() => this.memberships.delete(propertyId, userId)))) {
      throw notAMember();
    }
  }
}

/** Runs a team change, turning the database's last-owner rule into a 409. */
async function keepingAnOwner<T>(change: () => Promise<T>): Promise<T> {
  try {
    return await change();
  } catch (error) {
    if (isPgError(error, PgErrorCode.CheckViolation, 'property_members_keep_an_owner')) {
      throw new AppError('LAST_OWNER', LAST_OWNER_DETAIL);
    }
    throw error;
  }
}

function notAMember(): AppError {
  return new AppError('NOT_FOUND', 'This person is not on the team.');
}
