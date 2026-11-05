/** S1 ログイン（FR1.2, FR1.4） */
import { useRouter } from 'expo-router';
import React from 'react';

import { useApp } from '../src/state/AppProvider';
import { AuthForm } from '../src/ui/AuthForm';

export default function LoginScreen() {
  const router = useRouter();
  const { services, setUserId } = useApp();
  return (
    <AuthForm
      mode="login"
      onSubmit={(email, password) => services.auth.signIn(email, password)}
      onSuccess={(userId) => {
        setUserId(userId);
        router.replace('/');
      }}
      onSwitchMode={() => router.replace('/register')}
    />
  );
}
