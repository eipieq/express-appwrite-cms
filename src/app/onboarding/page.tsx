'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ID } from 'appwrite';
import { account, databases, DATABASE_ID, COLLECTIONS } from '@/lib/appwrite';
import { useBusinessContext } from '@/contexts/BusinessContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { BRANDING } from "@/config/branding";
import { alertDemoReadOnly } from '@/config/demo';
import { X } from 'lucide-react';
import { DEFAULT_CURRENCY } from '@/lib/currency';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function OnboardingContent() {
  const router = useRouter();
  const {
    userBusinesses,
    loading: businessLoading,
    refreshBusinesses,
    switchBusiness,
    isDemoUser,
  } = useBusinessContext();
  const searchParams = useSearchParams();
  const forceCreate = searchParams?.get('mode') === 'create';

  const [userId, setUserId] = useState<string | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [name, setName] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadUser = async () => {
      try {
        const user = await account.get();
        if (!isMounted) {
          return;
        }
        setUserId(user.$id);
      } catch {
        router.push('/login');
      } finally {
        if (isMounted) {
          setAuthChecking(false);
        }
      }
    };

    loadUser();

    return () => {
      isMounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (authChecking || businessLoading) {
      return;
    }

    if (userBusinesses.length > 0 && !forceCreate) {
      router.replace('/dashboard');
    }
  }, [authChecking, businessLoading, userBusinesses, router, forceCreate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (isDemoUser) {
      alertDemoReadOnly();
      return;
    }

    if (!userId) {
      setError('Unable to load your account. Please sign in again.');
      return;
    }

    if (!name.trim()) {
      setError('Business name is required.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const trimmedName = name.trim();
      const normalizedWhatsapp = whatsappNumber.trim();
      const normalizedAddress = address.trim();
      const baseSlug = slugify(trimmedName);
      const uniqueSlug = baseSlug.length > 0 ? baseSlug : `business-${Date.now()}`;

      const business = await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.BUSINESSES,
        ID.unique(),
        {
          ownerId: userId,
          name: trimmedName,
          slug: uniqueSlug,
          whatsappNumber: normalizedWhatsapp.length > 0 ? normalizedWhatsapp : null,
          address: normalizedAddress.length > 0 ? normalizedAddress : null,
          logo: null,
          settings: JSON.stringify({ currency: DEFAULT_CURRENCY, customFields: [] }),
        }
      );

      await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.BUSINESS_USERS,
        ID.unique(),
        {
          businessId: business.$id,
          userId,
          role: 'owner',
          invitedBy: null,
        }
      );

      await refreshBusinesses();
      switchBusiness(business.$id);
      router.push('/dashboard');
    } catch (creationError) {
      console.error('Failed to create business:', creationError);
      setError('Failed to create your business. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (authChecking || businessLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-slate-500">
        Preparing your workspace...
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[80vh] w-full max-w-lg items-center justify-center px-4 py-10">
      <Card className="w-full shadow-lg">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-2xl">
              {forceCreate ? 'Create a Business' : 'Create Your First Business'}
            </CardTitle>
            <p className="mt-2 text-sm text-slate-600">
              {forceCreate
                ? `Add another business to your ${BRANDING.name} workspace.`
                : 'We noticed you don’t have a business yet. Let’s get you set up so you can start managing products.'}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => router.push('/dashboard')}
            aria-label="Close"
            className="self-end text-slate-400 transition hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent>
          {isDemoUser && (
            <div className="mb-4 rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-900">
              Demo mode is read-only. You can walk through the form, but the shared demo account cannot create businesses.
            </div>
          )}
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="business-name">Business Name *</Label>
              <Input
                id="business-name"
                value={name}
                disabled={submitting || isDemoUser}
                onChange={(event) => setName(event.target.value)}
                placeholder={`e.g., ${BRANDING.name} Traders`}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="business-whatsapp">WhatsApp Number</Label>
              <Input
                id="business-whatsapp"
                value={whatsappNumber}
                disabled={submitting || isDemoUser}
                onChange={(event) => setWhatsappNumber(event.target.value)}
                placeholder="+91 98765 43210"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="business-address">Address</Label>
              <Textarea
                id="business-address"
                value={address}
                disabled={submitting || isDemoUser}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="Street, City, State, ZIP"
                className="min-h-[100px]"
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting || isDemoUser}>
              {submitting ? 'Creating business…' : isDemoUser ? 'Demo mode is read-only' : 'Create Business'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[80vh] items-center justify-center text-sm text-slate-500">
          Loading onboarding…
        </div>
      }
    >
      <OnboardingContent />
    </Suspense>
  );
}
