export type Theme = 'light' | 'dark';

/** Read by the host layout on the server, so the first paint is already in the right theme. */
export const THEME_COOKIE = 'stay-flow-theme';

export function themeFrom(value: string | undefined): Theme {
  return value === 'dark' ? 'dark' : 'light';
}
