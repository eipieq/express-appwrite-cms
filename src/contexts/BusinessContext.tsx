'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppwriteException, Query, type Models } from 'appwrite';
import { account, databases, DATABASE_ID, COLLECTIONS } from '@/lib/appwrite';
import { isDemoUserEmail, setDemoModeCookie } from '@/config/demo';
import { DEFAULT_CURRENCY, normalizeCurrencyCode, type CurrencyCode } from '@/lib/currency';

type ProductCustomFieldType = 'text' | 'select';

type ProductCustomFieldOption = {
  id: string;
  label: string;
};

export type ProductCustomField = {
  id: string;
  label: string;
  type: ProductCustomFieldType;
  required: boolean;
  options?: ProductCustomFieldOption[];
  helpText?: string | null;
};

type AccountUser = Models.User<Models.Preferences>;

type BusinessSettings = {
  currency?: CurrencyCode;
  customFields?: ProductCustomField[];
  [key: string]: unknown;
};

type BusinessDocument = Models.Document & {
  name?: string | null;
  slug?: string | null;
  ownerId?: string | null;
  whatsappNumber?: string | null;
  address?: string | null;
  logo?: string | null;
  settings?: BusinessSettings | string | null;
};

type BusinessMembershipDocument = Models.Document & {
  businessId?: string | null;
  userId?: string | null;
  role?: string | null;
  invitedBy?: string | null;
};

type BusinessContextValue = {
  currentUser: AccountUser | null;
  isDemoUser: boolean;
  currentBusiness: BusinessDocument | null;
  currentMembership: BusinessMembershipDocument | null;
  userBusinesses: BusinessDocument[];
  memberships: BusinessMembershipDocument[];
  loading: boolean;
  switchBusiness: (businessId: string) => void;
  refreshBusinesses: () => Promise<void>;
};

const BusinessContext = createContext<BusinessContextValue | undefined>(undefined);

const ACTIVE_BUSINESS_STORAGE_KEY = 'express-appwrite-cms-active-business-id';

const ensureCustomFieldOption = (value: unknown, index: number): ProductCustomFieldOption | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const idCandidate = record.id;
  const labelCandidate = record.label;

  const id =
    typeof idCandidate === 'string' && idCandidate.trim().length > 0
      ? idCandidate.trim()
      : `option-${index + 1}`;
  const label =
    typeof labelCandidate === 'string' && labelCandidate.trim().length > 0
      ? labelCandidate.trim()
      : id;

  return {
    id,
    label,
  };
};

const ensureCustomField = (value: unknown, index: number): ProductCustomField | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const idCandidate = record.id;
  const labelCandidate = record.label;
  const typeCandidate = record.type;
  const requiredCandidate = record.required;
  const helpTextCandidate = record.helpText;

  const id =
    typeof idCandidate === 'string' && idCandidate.trim().length > 0
      ? idCandidate.trim()
      : `field-${index + 1}`;
  const label =
    typeof labelCandidate === 'string' && labelCandidate.trim().length > 0
      ? labelCandidate.trim()
      : id;
  const type: ProductCustomFieldType =
    typeCandidate === 'select' ? 'select' : 'text';
  const required = requiredCandidate === true;
  const helpText =
    typeof helpTextCandidate === 'string' && helpTextCandidate.trim().length > 0
      ? helpTextCandidate.trim()
      : null;

  let options: ProductCustomFieldOption[] | undefined;
  if (type === 'select') {
    const rawOptions = Array.isArray(record.options) ? record.options : [];
    options = rawOptions
      .map((option, optionIndex) => ensureCustomFieldOption(option, optionIndex))
      .filter((option): option is ProductCustomFieldOption => option !== null);
  }

  return {
    id,
    label,
    type,
    required,
    options,
    helpText,
  };
};

const parseBusinessSettings = (value: unknown): BusinessSettings => {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      return parseBusinessSettings(parsed);
    } catch (error) {
      console.warn('Failed to parse business settings string:', error);
      return { currency: DEFAULT_CURRENCY };
    }
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const currencyValue = record.currency;
    const normalizedCurrency = normalizeCurrencyCode(currencyValue);
    const customFieldValue = record.customFields;
    const customFields = Array.isArray(customFieldValue)
      ? customFieldValue
          .map((field, index) => ensureCustomField(field, index))
          .filter((field): field is ProductCustomField => field !== null)
      : [];

    return {
      ...record,
      currency: normalizedCurrency,
      customFields,
    };
  }

  return { currency: DEFAULT_CURRENCY, customFields: [] };
};

const normalizeBusinessDocument = (doc: BusinessDocument): BusinessDocument => {
  const parsedSettings = parseBusinessSettings(doc.settings);
  return {
    ...doc,
    settings: parsedSettings,
  };
};

export function BusinessProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AccountUser | null>(null);
  const [isDemoUser, setIsDemoUser] = useState(false);
  const [userBusinesses, setUserBusinesses] = useState<BusinessDocument[]>([]);
  const [memberships, setMemberships] = useState<BusinessMembershipDocument[]>([]);
  const [activeBusinessId, setActiveBusinessId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const isRefreshingRef = useRef(false);

  const persistActiveBusinessId = useCallback((businessId: string | null) => {
    if (typeof window === 'undefined') {
      return;
    }

    if (businessId) {
      window.localStorage.setItem(ACTIVE_BUSINESS_STORAGE_KEY, businessId);
    } else {
      window.localStorage.removeItem(ACTIVE_BUSINESS_STORAGE_KEY);
    }
  }, []);

  const resolveStoredBusinessId = useCallback(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    const stored = window.localStorage.getItem(ACTIVE_BUSINESS_STORAGE_KEY);
    return stored && stored.length > 0 ? stored : null;
  }, []);

  const resolveActiveBusinessId = useCallback(
    (businesses: BusinessDocument[]): string | null => {
      if (businesses.length === 0) {
        return null;
      }

      const storedId = resolveStoredBusinessId();
      if (storedId && businesses.some((business) => business.$id === storedId)) {
        return storedId;
      }

      return businesses[0].$id ?? null;
    },
    [resolveStoredBusinessId]
  );

  const fetchBusinesses = useCallback(async () => {
    let user: AccountUser;
    try {
      user = await account.get();
    } catch (error) {
      if (error instanceof AppwriteException && error.code === 401) {
        setCurrentUser(null);
        setIsDemoUser(false);
        setDemoModeCookie(false);

        return { businesses: [] as BusinessDocument[], memberships: [] as BusinessMembershipDocument[] };
      }
      throw error;
    }

    setCurrentUser(user);

    const demo = isDemoUserEmail(user.email);
    setIsDemoUser(demo);
    setDemoModeCookie(demo);

    const membershipsResponse = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.BUSINESS_USERS,
      [Query.equal('userId', user.$id)]
    );

    const membershipDocs = membershipsResponse.documents as unknown as BusinessMembershipDocument[];

    const businessIds = membershipDocs
      .map((membership) => (typeof membership.businessId === 'string' ? membership.businessId : null))
      .filter((id): id is string => Boolean(id));

    if (businessIds.length === 0) {
      return { businesses: [] as BusinessDocument[], memberships: membershipDocs };
    }

    const uniqueBusinessIds = Array.from(new Set(businessIds));

    const businessDocs = await Promise.all(
      uniqueBusinessIds.map(async (id) => {
        try {
          const doc = await databases.getDocument(
            DATABASE_ID,
            COLLECTIONS.BUSINESSES,
            id
          );
          return normalizeBusinessDocument(doc as unknown as BusinessDocument);
        } catch (error) {
          console.error(`Failed to load business ${id}`, error);
          return null;
        }
      })
    );

    const validBusinesses = businessDocs.filter(
      (doc): doc is BusinessDocument => doc !== null
    );

    validBusinesses.sort((a, b) => {
      const nameA = (a.name ?? a.slug ?? '').toString().toLowerCase();
      const nameB = (b.name ?? b.slug ?? '').toString().toLowerCase();
      if (nameA && nameB) {
        return nameA.localeCompare(nameB);
      }
      if (nameA) {
        return -1;
      }
      if (nameB) {
        return 1;
      }
      return (a.$createdAt ?? '').localeCompare(b.$createdAt ?? '');
    });

    return { businesses: validBusinesses, memberships: membershipDocs };
  }, []);

  const applyBusinessState = useCallback(
    (businesses: BusinessDocument[], membershipDocs: BusinessMembershipDocument[]) => {
      setUserBusinesses(businesses);
      setMemberships(membershipDocs);

      const computedActiveId = resolveActiveBusinessId(businesses);
      setActiveBusinessId(computedActiveId);
      persistActiveBusinessId(computedActiveId);
    },
    [persistActiveBusinessId, resolveActiveBusinessId]
  );

  const refreshBusinesses = useCallback(async () => {
    if (isRefreshingRef.current) {
      return;
    }

    isRefreshingRef.current = true;
    setLoading(true);
    try {
      const { businesses, memberships: membershipDocs } = await fetchBusinesses();
      applyBusinessState(businesses, membershipDocs);
    } catch (error) {
      console.error('Failed to refresh businesses:', error);
      setUserBusinesses([]);
      setMemberships([]);
      setActiveBusinessId(null);
      persistActiveBusinessId(null);
      setCurrentUser(null);
      setIsDemoUser(false);
      setDemoModeCookie(false);
    } finally {
      setLoading(false);
      isRefreshingRef.current = false;
    }
  }, [applyBusinessState, fetchBusinesses, persistActiveBusinessId]);

  useEffect(() => {
    let isCancelled = false;

    const bootstrap = async () => {
      setLoading(true);
      try {
        const { businesses, memberships: membershipDocs } = await fetchBusinesses();
        if (isCancelled) {
          return;
        }
        applyBusinessState(businesses, membershipDocs);
      } catch (error) {
        if (isCancelled) {
          return;
        }
        console.error('Failed to load businesses:', error);
        setUserBusinesses([]);
        setMemberships([]);
        setActiveBusinessId(null);
        persistActiveBusinessId(null);
        setCurrentUser(null);
        setIsDemoUser(false);
        setDemoModeCookie(false);
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    bootstrap();

    return () => {
      isCancelled = true;
    };
  }, [applyBusinessState, fetchBusinesses, persistActiveBusinessId]);

  const switchBusiness = useCallback(
    (businessId: string) => {
      if (!businessId || businessId === activeBusinessId) {
        return;
      }

      const match = userBusinesses.find((business) => business.$id === businessId);
      if (!match) {
        console.warn(`Attempted to switch to unknown business: ${businessId}`);
        return;
      }

      setActiveBusinessId(businessId);
      persistActiveBusinessId(businessId);
    },
    [activeBusinessId, persistActiveBusinessId, userBusinesses]
  );

  const currentBusiness = useMemo(() => {
    if (!activeBusinessId) {
      return null;
    }
    return userBusinesses.find((business) => business.$id === activeBusinessId) ?? null;
  }, [activeBusinessId, userBusinesses]);

  const currentMembership = useMemo(() => {
    if (!activeBusinessId) {
      return null;
    }
    return memberships.find((membership) => membership.businessId === activeBusinessId) ?? null;
  }, [activeBusinessId, memberships]);

  const value = useMemo(
    () => ({
      currentBusiness,
      currentMembership,
      userBusinesses,
      memberships,
      loading,
      switchBusiness,
      refreshBusinesses,
      currentUser,
      isDemoUser,
    }),
    [
      currentBusiness,
      currentMembership,
      userBusinesses,
      memberships,
      loading,
      switchBusiness,
      refreshBusinesses,
      currentUser,
      isDemoUser,
    ]
  );

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export function useBusinessContext() {
  const context = useContext(BusinessContext);
  if (!context) {
    throw new Error('useBusinessContext must be used within a BusinessProvider');
  }
  return context;
}
