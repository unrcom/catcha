import AsyncStorage from '@react-native-async-storage/async-storage';

// Confirms the test runner, the preset and the setup-file mocks load.
describe('test runner', () => {
  it('loads the AsyncStorage mock from the setup file', async () => {
    await AsyncStorage.setItem('k', 'v');
    expect(await AsyncStorage.getItem('k')).toBe('v');
  });
});
