import { afterEach, expect } from 'vitest';
import { takeContractViolations } from './contract-check.js';

// A test passes only if the API also kept to its published OpenAPI document while it ran.
afterEach(() => {
  expect(takeContractViolations()).toEqual([]);
});
