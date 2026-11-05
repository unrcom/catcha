/** S1b 新規登録（FR1.1, FR1.4） */
import { useRouter } from 'expo-router';
import React from 'react';

import { useApp } from '../src/state/AppProvider';
import { AuthForm } from '../src/ui/AuthForm';

export default function RegisterScreen() {
  const router = useRouter();
  const { services, setUserId } = useApp();
  return (
    <AuthForm
      mode="register"
      onSubmit={(email, password) => services.auth.signUp(email, password)}
      onSuccess={(userId) => {
        setUserId(userId);
        router.replace('/');
      }}
      onSwitchMode={() => router.replace('/login')}
    />
  );
}
