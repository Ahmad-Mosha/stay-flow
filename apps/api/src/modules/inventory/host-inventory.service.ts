import { Injectable } from '@nestjs/common';
import { isPgError, PgErrorCode } from '../../platform/database/pg-errors.js';
import { AppError } from '../../platform/errors/app-error.js';
import { PropertiesService } from '../properties/properties.service.js';
import {
  HostInventoryRepository,
  type NewRateOverride,
  type NewUnitType,
  type RateOverride,
  type UnitTypeChanges,
  type UnitTypeWithUnits,
} from './host-inventory.repository.js';
import type { Unit } from './inventory.repository.js';

/** How staff set up a property's room types, rooms and rates. */
@Injectable()
export class HostInventoryService {
  constructor(
    private readonly inventory: HostInventoryRepository,
    private readonly properties: PropertiesService,
  ) {}

  async listUnitTypes(propertyId: string): Promise<UnitTypeWithUnits[]> {
    return this.inventory.listUnitTypes(propertyId);
  }

  async createUnitType(propertyId: string, unitType: NewUnitType): Promise<UnitTypeWithUnits> {
    const created = await this.inventory.insertUnitType(propertyId, unitType);
    if (created === undefined) {
      throw new AppError('SLUG_TAKEN', 'Another room type here already uses this slug.');
    }
    return { ...created, units: [] };
  }

  /** Changes a room type. Bookings already made keep the price and guest count they were made with. */
  async updateUnitType(
    propertyId: string,
    id: string,
    changes: UnitTypeChanges,
  ): Promise<UnitTypeWithUnits> {
    const updated = (await this.inventory.updateUnitType(propertyId, id, changes)) ?? noUnitType();
    return { ...updated, units: await this.inventory.listUnits(propertyId, id) };
  }

  async createUnit(propertyId: string, unitTypeId: string, name: string): Promise<Unit> {
    try {
      return (await this.inventory.insertUnit(propertyId, unitTypeId, name)) ?? nameTaken(name);
    } catch (error) {
      // The composite foreign key only accepts a room type of the same property.
      if (
        isPgError(error, PgErrorCode.ForeignKeyViolation, 'units_property_id_unit_type_id_fkey')
      ) {
        noUnitType();
      }
      throw error;
    }
  }

  async renameUnit(propertyId: string, id: string, name: string): Promise<Unit> {
    try {
      const unit = await this.inventory.renameUnit(propertyId, id, name);
      if (unit === undefined) {
        throw new AppError('NOT_FOUND', 'This property has no room with this id.');
      }
      return unit;
    } catch (error) {
      if (isPgError(error, PgErrorCode.UniqueViolation, 'units_property_id_name_key')) {
        nameTaken(name);
      }
      throw error;
    }
  }

  /** The rate overrides that still cover tonight or a later night, where the property is. */
  async listRateOverrides(propertyId: string): Promise<RateOverride[]> {
    const property = await this.properties.getById(propertyId);
    return this.inventory.listRateOverrides(propertyId, this.properties.today(property));
  }

  async createRateOverride(propertyId: string, override: NewRateOverride): Promise<RateOverride> {
    // rate_overrides has no property column, so check the room type here.
    if ((await this.inventory.findUnitType(propertyId, override.unitTypeId)) === undefined) {
      noUnitType();
    }
    try {
      return await this.inventory.insertRateOverride(override);
    } catch (error) {
      if (isPgError(error, PgErrorCode.ExclusionViolation, 'rate_overrides_no_overlap')) {
        throw new AppError(
          'RATES_OVERLAP',
          'Another rate for this room type already covers some of these nights.',
        );
      }
      throw error;
    }
  }

  async deleteRateOverride(propertyId: string, id: string): Promise<void> {
    if (!(await this.inventory.deleteRateOverride(propertyId, id))) {
      throw new AppError('NOT_FOUND', 'This property has no rate override with this id.');
    }
  }
}

function noUnitType(): never {
  throw new AppError('NOT_FOUND', 'This property has no room type with this id.');
}

function nameTaken(name: string): never {
  throw new AppError('UNIT_NAME_TAKEN', `Another room here is already called ${name}.`);
}
