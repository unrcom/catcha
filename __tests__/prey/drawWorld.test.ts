import { PREY_RENDERERS } from '../../src/prey/kinds';
import { colorOf, drawWorld } from '../../src/prey/render/drawWorld';
import { createWorld, stepWorld, touchWorld } from '../../src/prey/world';
import { toyPalette } from '../../src/ui/theme';

const field = { width: 1024, height: 768 };

afterEach(() => jest.restoreAllMocks());

describe('drawWorld (FR3.1, FR4.3)', () => {
  it('draws every visible prey and the ripples of a busy world into one picture', () => {
    const rand = () => 0.5;
    const world = createWorld({ count: 30, field, isTablet: true, now: 0, rand });
    for (let now = 16; now < 10_000; now += 16) stepWorld(world, field, now, rand);
    touchWorld(world, { x: 512, y: 384 }, field, 10_000, rand);
    const renderers = Object.keys(PREY_RENDERERS).map((kind) => jest.spyOn(PREY_RENDERERS, kind));
    expect(drawWorld(world, toyPalette('dark'), 10_100, [])).toEqual({ __picture: true });
    expect(renderers.some((r) => r.mock.calls.length > 0)).toBe(true);
  });

  it('does not draw a kind that an overlay draws instead (FR2.9 fallback slot)', () => {
    const rand = () => 0.5;
    const world = createWorld({ count: 5, field, isTablet: true, now: 0, rand });
    const teaser = jest.spyOn(PREY_RENDERERS, 'teaser');
    drawWorld(world, toyPalette('dark'), 0, ['teaser']);
    expect(teaser).not.toHaveBeenCalled();
    drawWorld(world, toyPalette('dark'), 0, []);
    expect(teaser).toHaveBeenCalled();
  });

  it('takes the colors from the palette of the current background', () => {
    expect(colorOf(0, toyPalette('dark'))).toBe(toyPalette('dark').toys[0]);
    expect(colorOf(2, toyPalette('light'))).toBe(toyPalette('light').toys[2]);
    expect(colorOf(5, toyPalette('light'))).toBe(toyPalette('light').toys[2]);
    expect(colorOf('mouse', toyPalette('light'))).toBe(toyPalette('light').mouse);
  });
});
