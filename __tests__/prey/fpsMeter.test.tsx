import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { FPS_METER_MARGIN, FpsMeter, framesPerSecond } from '../../src/prey/FpsMeter';

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

  it('stays inside the safe area so the notch and rounded corners do not cut it off', async () => {
    const insets = { top: 0, left: 59, right: 59, bottom: 21 };
    await render(
      <SafeAreaInsetsContext.Provider value={insets}>
        <FpsMeter preyCount={50} />
      </SafeAreaInsetsContext.Provider>,
    );
    expect(screen.getByTestId('fps-meter')).toHaveStyle({ top: FPS_METER_MARGIN, left: 59 + FPS_METER_MARGIN });
  });

  it('keeps a small margin from the screen edge when there is no safe area value', async () => {
    await render(<FpsMeter preyCount={30} />);
    expect(screen.getByTestId('fps-meter')).toHaveStyle({ top: FPS_METER_MARGIN, left: FPS_METER_MARGIN });
  });
});
