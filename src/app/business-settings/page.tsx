'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ID } from 'appwrite';
import { account, databases, storage, DATABASE_ID, COLLECTIONS, STORAGE_BUCKET_ID } from '@/lib/appwrite';
import { useBusinessContext } from '@/contexts/BusinessContext';
import { alertDemoReadOnly } from '@/config/demo';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY, normalizeCurrencyCode } from '@/lib/currency';
import { ProductCustomField } from '@/contexts/BusinessContext';

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
    isDemoUser,
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
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [customFields, setCustomFields] = useState<ProductCustomField[]>([]);

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
      setCurrency(DEFAULT_CURRENCY);
      return;
    }

    setName(typeof currentBusiness.name === 'string' ? currentBusiness.name : '');
    setWhatsappNumber(
      typeof currentBusiness.whatsappNumber === 'string' ? currentBusiness.whatsappNumber : ''
    );
    setAddress(typeof currentBusiness.address === 'string' ? currentBusiness.address : '');
    setLogoPreview(typeof currentBusiness.logo === 'string' ? currentBusiness.logo : null);
    setLogoFile(null);

    const settingsCurrency =
      typeof currentBusiness.settings === 'object' && currentBusiness.settings !== null
        ? currentBusiness.settings.currency
        : undefined;
    setCurrency(normalizeCurrencyCode(settingsCurrency));

    const settingsCustomFields =
      typeof currentBusiness.settings === 'object' && currentBusiness.settings !== null
        ? Array.isArray(currentBusiness.settings.customFields)
          ? (currentBusiness.settings.customFields as ProductCustomField[])
          : []
        : [];
    setCustomFields(settingsCustomFields);
  }, [currentBusiness]);

  const normalizedRole = useMemo(() => {
    if (!currentMembership?.role) {
      return null;
    }
    return String(currentMembership.role).toLowerCase();
  }, [currentMembership]);

  const canEdit = useMemo(() => {
    if (isDemoUser) {
      return false;
    }
    if (!currentBusiness || !userId) {
      return false;
    }
    if (typeof currentBusiness.ownerId === 'string' && currentBusiness.ownerId === userId) {
      return true;
    }
    return normalizedRole === 'owner' || normalizedRole === 'admin';
  }, [currentBusiness, normalizedRole, userId, isDemoUser]);

  const canDelete = useMemo(() => {
    if (isDemoUser) {
      return false;
    }
    if (!currentBusiness || !userId) {
      return false;
    }
    return typeof currentBusiness.ownerId === 'string' && currentBusiness.ownerId === userId;
  }, [currentBusiness, userId, isDemoUser]);

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

  const generateFieldId = () => `field-${Date.now()}`;
  const generateOptionId = (prefix: string, index: number) => `${prefix}-option-${index + 1}`;

  const handleAddCustomField = () => {
    const nextId = generateFieldId();
    setCustomFields((prev) => [
      ...prev,
      {
        id: nextId,
        label: 'New field',
        type: 'text',
        required: false,
        helpText: null,
      },
    ]);
  };

  const handleRemoveCustomField = (id: string) => {
    setCustomFields((prev) => prev.filter((field) => field.id !== id));
  };

  const updateCustomField = (
    id: string,
    updater: (field: ProductCustomField) => ProductCustomField
  ) => {
    setCustomFields((prev) => prev.map((field) => (field.id === id ? updater(field) : field)));
  };

  const handleFieldLabelChange = (id: string, label: string) => {
    updateCustomField(id, (field) => ({
      ...field,
      label,
    }));
  };

  const handleFieldTypeChange = (id: string, type: ProductCustomField['type']) => {
    updateCustomField(id, (field) => {
      if (field.type === type) {
        return field;
      }

      if (type === 'select') {
        return {
          ...field,
          type,
          options:
            field.options && field.options.length > 0
              ? field.options
              : [{ id: generateOptionId(id, 0), label: 'Option 1' }],
        };
      }

      return {
        ...field,
        type,
        options: undefined,
      };
    });
  };

  const handleFieldRequiredChange = (id: string, required: boolean) => {
    updateCustomField(id, (field) => ({
      ...field,
      required,
    }));
  };

  const handleFieldHelpTextChange = (id: string, helpText: string) => {
    updateCustomField(id, (field) => ({
      ...field,
      helpText: helpText.trim().length > 0 ? helpText : null,
    }));
  };

  const handleFieldOptionsChange = (id: string, value: string) => {
    const optionLabels = value
      .split('\n')
      .map((option) => option.trim())
      .filter((option) => option.length > 0);

    updateCustomField(id, (field) => {
      const options = optionLabels.map((label, index) => ({
        id: generateOptionId(id, index),
        label,
      }));
      return {
        ...field,
        options,
      };
    });
  };

  const validateCustomFields = () => {
    for (const field of customFields) {
      if (!field.label || field.label.trim().length === 0) {
        return 'Custom fields must have a label.';
      }

      if (field.type === 'select') {
        if (!field.options || field.options.length === 0) {
          return `Select field "${field.label}" must include at least one option.`;
        }
      }
    }

    return null;
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();

    if (isDemoUser) {
      alertDemoReadOnly();
      return;
    }

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

    const customFieldValidationError = validateCustomFields();
    if (customFieldValidationError) {
      setError(customFieldValidationError);
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

      const existingSettings =
        typeof currentBusiness.settings === 'object' && currentBusiness.settings !== null
          ? currentBusiness.settings
          : {};

      updatePayload.settings = JSON.stringify({
        ...existingSettings,
        currency,
        customFields,
      });

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
    if (isDemoUser) {
      alertDemoReadOnly();
      return;
    }

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
      {isDemoUser && (
        <div className="mb-6 rounded-md border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
          Demo mode is read-only. Updates to business details are disabled for the shared demo account.
        </div>
      )}
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
            <div className="space-y-2">
              <Label htmlFor="business-currency">Currency</Label>
              <select
                id="business-currency"
                value={currency}
                onChange={(event) => setCurrency(normalizeCurrencyCode(event.target.value))}
                disabled={!canEdit || saving || deleting}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CURRENCY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                Prices across the dashboard use this currency for formatting.
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label>Product Custom Fields</Label>
                  <p className="text-xs text-slate-500">
                    Add structured attributes (brand, material, etc.) that appear on product forms.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddCustomField}
                  disabled={!canEdit || saving || deleting}
                >
                  Add field
                </Button>
              </div>

              <div className="space-y-3">
                {customFields.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                    No custom fields yet. Use the Add field button to collect extra product details like brand or material.
                  </div>
                ) : (
                  customFields.map((field, index) => {
                    const optionsValue =
                      field.type === 'select'
                        ? (field.options ?? []).map((option) => option.label).join('\n')
                        : '';

                    return (
                      <div
                        key={field.id}
                        className="rounded-lg border border-slate-200 p-4 shadow-sm"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-800">
                            Field {index + 1}
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => handleRemoveCustomField(field.id)}
                            disabled={!canEdit || saving || deleting}
                          >
                            Remove
                          </Button>
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label>Label</Label>
                            <Input
                              value={field.label}
                              onChange={(event) => handleFieldLabelChange(field.id, event.target.value)}
                              disabled={!canEdit || saving || deleting}
                              placeholder="Brand"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Type</Label>
                            <select
                              value={field.type}
                              onChange={(event) =>
                                handleFieldTypeChange(field.id, event.target.value === 'select' ? 'select' : 'text')
                              }
                              disabled={!canEdit || saving || deleting}
                              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="text">Text</option>
                              <option value="select">Select</option>
                            </select>
                          </div>
                          <div className="space-y-1.5">
                            <label className="flex items-center gap-2 text-sm text-slate-600">
                              <input
                                type="checkbox"
                                checked={field.required}
                                onChange={(event) => handleFieldRequiredChange(field.id, event.target.checked)}
                                disabled={!canEdit || saving || deleting}
                                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              />
                              Required
                            </label>
                          </div>
                          <div className="space-y-1.5">
                            <Label>Help text</Label>
                            <Input
                              value={field.helpText ?? ''}
                              onChange={(event) => handleFieldHelpTextChange(field.id, event.target.value)}
                              disabled={!canEdit || saving || deleting}
                              placeholder="Shown beneath the field"
                            />
                          </div>
                        </div>

                        {field.type === 'select' && (
                          <div className="mt-3 space-y-1.5">
                            <Label>Options (one per line)</Label>
                            <Textarea
                              value={optionsValue}
                              onChange={(event) => handleFieldOptionsChange(field.id, event.target.value)}
                              disabled={!canEdit || saving || deleting}
                              placeholder={'Acme\nGlobex\nSoylent'}
                              className="min-h-[90px]"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
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
