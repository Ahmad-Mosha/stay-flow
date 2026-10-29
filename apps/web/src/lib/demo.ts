/** The host account the API's seed creates, open to anyone who wants to try the front desk. */
export const demoHost = { email: 'host@example.com', password: 'nubia-demo-password' } as const;

/** The rest of the demo team the seed creates, to try the dashboard in each role. */
export const demoTeam = [
  { role: 'manager', label: 'Manager', email: 'manager@example.com' },
  { role: 'front_desk', label: 'Front desk', email: 'frontdesk@example.com' },
] as const;
