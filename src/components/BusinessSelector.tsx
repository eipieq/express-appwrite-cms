'use client';

import { useMemo, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useBusinessContext } from '@/contexts/BusinessContext';

const CREATE_BUSINESS_OPTION = '__create__';

export default function BusinessSelector() {
  const router = useRouter();
  const {
    currentBusiness,
    userBusinesses,
    loading,
    switchBusiness,
  } = useBusinessContext();

  const options = useMemo(() => {
    return userBusinesses.map((business) => ({
      id: business.$id,
      label: business.name?.trim().length ? business.name : 'Untitled Business',
    }));
  }, [userBusinesses]);

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (value === CREATE_BUSINESS_OPTION) {
      router.push('/onboarding?mode=create');
      return;
    }
    switchBusiness(value);
  };

  if (loading) {
    return (
      <div className="h-10 min-w-[160px] animate-pulse rounded-md bg-slate-100" />
    );
  }

  if (options.length === 0) {
    return (
      <button
        type="button"
        onClick={() => router.push('/onboarding?mode=create')}
        className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
      >
        Create Business
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="business-selector" className="hidden text-sm font-medium text-slate-500 sm:block">
        Business
      </label>
      <select
        id="business-selector"
        className="min-w-[180px] rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
        value={currentBusiness?.$id ?? ''}
        onChange={handleChange}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
        <option value={CREATE_BUSINESS_OPTION}>+ Create Business</option>
      </select>
    </div>
  );
}
