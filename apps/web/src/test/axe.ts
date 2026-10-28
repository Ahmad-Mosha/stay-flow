import axe from 'axe-core';

/**
 * Runs axe on a rendered tree and returns the rule ids that failed. jsdom does no layout or
 * colour, so contrast is checked from the tokens instead (src/design/tokens.test.ts).
 */
export async function axeViolations(container: Element): Promise<string[]> {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  return results.violations.map(({ id, nodes }) => `${id} (${String(nodes.length)})`);
}
