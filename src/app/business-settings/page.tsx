'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ID } from 'appwrite';
import { account, databases, storage, DATABASE_ID, COLLECTIONS, STORAGE_BUCKET_ID } from '@/lib/appwrite';
import { useBusinessContext } from '@/contexts/BusinessContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

function buildImageUrl(fileId: string): string {
  const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
  const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
  if (!endpoint || !projectId) {
    return '';
  }
  return `${endpoint}/storage/buckets/${STORAGE_BUCKET_ID}/files/${fileId}/view?project=${projectId}`;
}

export default function BusinessSettingsPage() {
  const router = useRouter();
  const {
    currentBusiness,
    currentMembership,
    userBusinesses,
    loading: businessLoading,
    refreshBusinesses,
  } = useBusinessContext();

  const [userId, setUserId] = useState<string | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [name, setName] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [address, setAddress] = useState('');
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
    if (!currentBusiness) {
      setName('');
      setWhatsappNumber('');
      setAddress('');
      setLogoPreview(null);
      setLogoFile(null);
      return;
    }

    setName(typeof currentBusiness.name === 'string' ? currentBusiness.name : '');
    setWhatsappNumber(
      typeof currentBusiness.whatsappNumber === 'string' ? currentBusiness.whatsappNumber : ''
    );
    setAddress(typeof currentBusiness.address === 'string' ? currentBusiness.address : '');
    setLogoPreview(typeof currentBusiness.logo === 'string' ? currentBusiness.logo : null);
    setLogoFile(null);
  }, [currentBusiness]);

  const normalizedRole = useMemo(() => {
    if (!currentMembership?.role) {
      return null;
    }
    return String(currentMembership.role).toLowerCase();
  }, [currentMembership]);

  const canEdit = useMemo(() => {
    if (!currentBusiness || !userId) {
      return false;
    }
    if (typeof currentBusiness.ownerId === 'string' && currentBusiness.ownerId === userId) {
      return true;
    }
    return normalizedRole === 'owner' || normalizedRole === 'admin';
  }, [currentBusiness, normalizedRole, userId]);

  const canDelete = useMemo(() => {
    if (!currentBusiness || !userId) {
      return false;
    }
    return typeof currentBusiness.ownerId === 'string' && currentBusiness.ownerId === userId;
  }, [currentBusiness, userId]);

  const handleLogoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) {
      return;
    }
    const file = event.target.files[0];
    setLogoFile(file);
    const previewUrl = URL.createObjectURL(file);
    setLogoPreview(previewUrl);
  };

  const handleClearLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!currentBusiness) {
      setError('No business selected.');
      return;
    }

    if (!canEdit) {
      setError('You do not have permission to update this business.');
      return;
    }

    if (!name.trim()) {
      setError('Business name is required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const trimmedName = name.trim();
      const normalizedWhatsapp = whatsappNumber.trim();
      const normalizedAddress = address.trim();

      const updatePayload: Record<string, unknown> = {
        name: trimmedName,
        whatsappNumber: normalizedWhatsapp.length > 0 ? normalizedWhatsapp : null,
        address: normalizedAddress.length > 0 ? normalizedAddress : null,
      };

      if (logoFile) {
        const uploaded = await storage.createFile(STORAGE_BUCKET_ID, ID.unique(), logoFile);
        const logoUrl = buildImageUrl(uploaded.$id);
        updatePayload.logo = logoUrl || uploaded.$id;
      } else if (!logoPreview) {
        updatePayload.logo = null;
      }

      await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.BUSINESSES,
        currentBusiness.$id,
        updatePayload
      );

      await refreshBusinesses();
      setLogoFile(null);
      setError(null);
    } catch (updateError) {
      console.error('Failed to update business:', updateError);
      setError('Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!currentBusiness || !canDelete) {
      return;
    }

    const confirmation = confirm(
      'Are you sure you want to delete this business? This action cannot be undone.'
    );
    if (!confirmation) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      if (currentMembership?.$id) {
        await databases.deleteDocument(
          DATABASE_ID,
          COLLECTIONS.BUSINESS_USERS,
          currentMembership.$id
        );
      }

      await databases.deleteDocument(
        DATABASE_ID,
        COLLECTIONS.BUSINESSES,
        currentBusiness.$id
      );

      await refreshBusinesses();
      router.replace('/onboarding');
    } catch (deleteError) {
      console.error('Failed to delete business:', deleteError);
      setError('Failed to delete the business. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  if (authChecking || businessLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
        Loading business details...
      </div>
    );
  }

  if (!currentBusiness) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-lg font-semibold text-slate-700">No business selected.</p>
        <Button onClick={() => router.push('/onboarding?mode=create')}>
          {userBusinesses.length > 0 ? 'Create another business' : 'Create a business'}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">Business Settings</CardTitle>
          <p className="mt-2 text-sm text-slate-600">
            Manage your business profile details. These details appear across your dashboard and public surfaces.
          </p>
        </CardHeader>
        <CardContent>
          <form className="space-y-6" onSubmit={handleSave}>
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
                onChange={(event) => setName(event.target.value)}
                disabled={!canEdit || saving || deleting}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="business-whatsapp">WhatsApp Number</Label>
              <Input
                id="business-whatsapp"
                value={whatsappNumber}
                onChange={(event) => setWhatsappNumber(event.target.value)}
                disabled={!canEdit || saving || deleting}
                placeholder="+91 98765 43210"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="business-address">Address</Label>
              <Textarea
                id="business-address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                disabled={!canEdit || saving || deleting}
                placeholder="Street, City, State, ZIP"
                className="min-h-[120px]"
              />
            </div>
            <div className="space-y-3">
              <Label htmlFor="business-logo">Logo</Label>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="h-24 w-24 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                  {logoPreview ? (
                    <Image
                      src={logoPreview}
                      alt="Business logo preview"
                      width={96}
                      height={96}
                      unoptimized
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                      No logo
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  <Input
                    id="business-logo"
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    disabled={!canEdit || saving || deleting}
                  />
                  {logoPreview && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleClearLogo}
                      disabled={!canEdit || saving || deleting}
                    >
                      Remove logo
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                {canEdit
                  ? 'Updates save instantly across the dashboard.'
                  : 'You need owner or admin permissions to update this business.'}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={!canEdit || saving || deleting}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
                {canDelete && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={saving || deleting}
                  >
                    {deleting ? 'Deleting...' : 'Delete Business'}
                  </Button>
                )}
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
