// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

function block(opening: string): string {
  const start = css.indexOf(opening);
  if (start === -1) throw new Error(`globals.css has no "${opening}" block`);
  return css.slice(start, css.indexOf('}', start));
}

function readColours(source: string): Map<string, string> {
  const colours = new Map<string, string>();
  for (const [, name, hex] of source.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6});/gi)) {
    if (name && hex) colours.set(name, hex);
  }
  return colours;
}

const themes = {
  light: readColours(block('@theme {')),
  dark: readColours(block("[data-theme='dark'] {")),
};

// Text and the surfaces it appears on. WCAG AA asks 4.5:1 for normal-size text.
const textPairs: [text: string, surface: string][] = [
  ...['ink', 'ink-2', 'ink-3'].flatMap((text) =>
    ['ground', 'paper', 'raised'].map((surface): [string, string] => [text, surface]),
  ),
  ['ink-3', 'ground-dim'],
  ['action', 'ground'],
  ['action', 'paper'],
  ['action', 'raised'],
  ['action', 'action-wash'],
  ['ink', 'action-wash'],
  ['action-ink', 'action'],
  ['danger', 'ground'],
  ['danger', 'paper'],
  ['danger', 'raised'],
  ['success', 'ground'],
  ['success', 'paper'],
  ['success', 'raised'],
  ['hold-ink', 'hold'],
  ['hold-ink', 'hold-alt'],
  ['tape-in-ink', 'tape-in'],
  ['ink', 'tape-stay'],
  ['ink-2', 'block'],
  ['ink-2', 'block-line'],
];

// Borders that identify a control need 3:1 against what surrounds them (WCAG 1.4.11).
const controlPairs: [edge: string, surface: string][] = [
  ['field-edge', 'raised'],
  ['field-edge', 'paper'],
  ['field-edge', 'ground'],
];

describe('design tokens', () => {
  it('defines every colour in both themes', () => {
    expect([...themes.dark.keys()].sort()).toEqual([...themes.light.keys()].sort());
    expect(themes.light.size).toBeGreaterThan(0);
  });

  describe.each(Object.entries(themes))('%s theme', (_, colours) => {
    const colour = (name: string) => {
      const hex = colours.get(name);
      if (!hex) throw new Error(`No --color-${name} token`);
      return hex;
    };

    it.each(textPairs)('%s text on %s reaches 4.5:1', (text, surface) => {
      expect(contrastRatio(colour(text), colour(surface))).toBeGreaterThanOrEqual(4.5);
    });

    it.each(controlPairs)('%s on %s reaches 3:1', (edge, surface) => {
      expect(contrastRatio(colour(edge), colour(surface))).toBeGreaterThanOrEqual(3);
    });
  });
});
