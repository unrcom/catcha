import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { FpsMeter, framesPerSecond } from '../../src/prey/FpsMeter';

describe('FpsMeter (NFR1 の計測表示)', () => {
  it('turns counted frames into frames per second', () => {
    expect(framesPerSecond(60, 1_000)).toBe(60);
    expect(framesPerSecond(1_740, 30_000)).toBe(58);
  });

  it('gives 0 instead of dividing by no time', () => {
    expect(framesPerSecond(10, 0)).toBe(0);
  });

  it('shows a placeholder in a corner until the first second is counted', async () => {
    await render(<FpsMeter preyCount={30} />);
    expect(screen.getByTestId('fps-meter')).toHaveTextContent('-- fps');
  });
});
