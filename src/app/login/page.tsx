'use client';

import Image from 'next/image';
import { useState } from 'react';
import { account } from '@/lib/appwrite';
import { DEMO_EMAIL, DEMO_PASSWORD, isDemoUserEmail, setDemoModeCookie } from '@/config/demo';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BRANDING } from "@/config/branding";

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const demoAvailable = DEMO_EMAIL.length > 0 && DEMO_PASSWORD.length > 0;

  const loginWithCredentials = async (
    targetEmail: string,
    targetPassword: string,
    { forceDemoMode = false }: { forceDemoMode?: boolean } = {}
  ) => {
    setLoading(true);
    setError('');

    try {
      await account.createEmailPasswordSession(targetEmail, targetPassword);
      const isDemo = forceDemoMode || isDemoUserEmail(targetEmail);
      setDemoModeCookie(isDemo);
      document.cookie = `appwrite-session=active; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
      router.push('/dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await loginWithCredentials(email, password);
  };

  const handleDemoLogin = async () => {
    if (!demoAvailable) {
      setError('Demo credentials are not configured yet.');
      return;
    }

    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    await loginWithCredentials(DEMO_EMAIL, DEMO_PASSWORD, { forceDemoMode: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Image
            src={BRANDING.logo}
            alt={BRANDING.name}
            width={320}
            height={80}
            className="mx-auto mt-4 mb-6 h-auto w-80"
            priority
          />
          <CardTitle className="text-2xl text-center font-medium">Admin Login</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-3">
              <Label htmlFor="email">email address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Logging in...' : 'Login'}
            </Button>
            {demoAvailable && (
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDemoLogin}
                  disabled={loading}
                  className="w-full"
                >
                  Explore The Demo
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Uses the shared demo account so you can browse without affecting real data.
                </p>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
