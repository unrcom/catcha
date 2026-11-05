/**
 * expo-router の代わり。画面のテストでは、どの画面へ移ろうとしたかだけを確かめる。
 * 使い方：jest.mock('expo-router', () => require('../helpers/routerMock'));
 */
export const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
};

export function useRouter() {
  return mockRouter;
}

export function resetRouter() {
  mockRouter.push.mockReset();
  mockRouter.replace.mockReset();
  mockRouter.back.mockReset();
}
