import path from 'node:path';

/** The demo hotel and its owner, as the seed creates them. */
export const demo = {
  property: 'dar-nubia',
  host: { email: 'host@example.com', password: 'nubia-demo-password' },
};

/** The demo host's signed-in browser state, saved by the setup project. */
export const hostSession = path.join(import.meta.dirname, '../.auth/host.json');
