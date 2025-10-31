'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { account, databases, DATABASE_ID, COLLECTIONS } from '@/lib/appwrite';
import { useRouter } from 'next/navigation';
import { AppwriteException, ID, Query, type Models } from 'appwrite';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type Category,
  buildCategoryMap,
  formatCategoryPath,
  getCategoryAncestry,
  getCategoryPath,
  listBusinessCategories,
  serializeCategoryMeta,
} from '@/lib/categories';
import { useBusinessContext } from '@/contexts/BusinessContext';
import { alertDemoReadOnly } from '@/config/demo';

type CSVRow = {
  'Product Code': string;
  'Product Name': string;
  'Category': string;
  'Short Description': string;
  'Full Description': string;
  'Size (MM / Inch)': string;
  'Colour / Finish': string;
  'Packing Size': string;
  'MRP (INR)': string;
  'HSN Code': string;
  'Material': string;
  'Variant Code': string;
  'Product Image URL': string;
  'Notes': string;
};

type ImportAction = 'create' | 'skip' | 'update';

type ParsedProduct = {
  productCode: string;
  name: string;
  category: string;
  categoryId?: string;
  categorySlug?: string;
  categoryPath?: string[];
  categoryPathLabel?: string;
  categoryAncestors?: string[];
  categoryMatchType?: 'slug' | 'name';
  shortDescription: string;
  fullDescription: string;
  variants: {
    size: string;
    finish: string;
    price: number;
    sku: string;
  }[];
  imageUrl: string;
  action: ImportAction;
  existingProductId?: string;
  existingProductName?: string;
  existingUpdatedAt?: string;
  existingMatchType?: 'code' | 'name';
};

type ExistingProductMeta = {
  id: string;
  name: string;
  updatedAt: string;
  productCode?: string;
};

type ProductDocument = Models.Document & {
  name?: string;
  productCode?: string;
};

type VariantDocument = Models.Document;

const buildProposedCategoriesForProducts = (
  products: ParsedProduct[],
  categories: Category[]
): ProposedCategory[] => {
  if (products.length === 0) {
    return [];
  }

  const categoriesIndex = buildCategoryIndexByParent(categories);

  const proposals = new Map<string, ProposedCategory>();

  products.forEach((product) => {
    if (!product.category || product.categoryId) {
      return;
    }

    const segments = parseCategorySegments(product.category);
    if (segments.length === 0) {
      return;
    }

    let parentId: string | null = null;
    let parentPath: string[] = [];

    segments.forEach((segment) => {
      const existing = findCategoryInIndex(categoriesIndex, parentId, segment);
      if (existing) {
        parentId = existing.$id;
        parentPath = [...parentPath, existing.name];
        return;
      }

      const nextPath = [...parentPath, segment];
      const key = buildCategoryPathKey(nextPath);

      if (!proposals.has(key)) {
        proposals.set(key, {
          key,
          path: nextPath,
          label: formatCategoryPath(nextPath),
          name: segment.trim(),
          slug: slugify(segment),
          parentExistingId: parentId,
          parentKey: parentPath.length > 0 ? buildCategoryPathKey(parentPath) : null,
          parentPath: [...parentPath],
          depth: nextPath.length,
        });
      }

      parentId = null;
      parentPath = nextPath;
    });
  });

  return Array.from(proposals.values()).sort((a, b) => {
    if (a.depth !== b.depth) {
      return a.depth - b.depth;
    }
    return a.label.localeCompare(b.label);
  });
};

const createEmptyCSVRow = (): CSVRow => ({
  'Product Code': '',
  'Product Name': '',
  'Category': '',
  'Short Description': '',
  'Full Description': '',
  'Size (MM / Inch)': '',
  'Colour / Finish': '',
  'Packing Size': '',
  'MRP (INR)': '',
  'HSN Code': '',
  'Material': '',
  'Variant Code': '',
  'Product Image URL': '',
  'Notes': '',
});

const slugify = (value: string) => {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeCategorySegment = (value: string) => slugify(value);

const parseCategorySegments = (rawValue: string | null | undefined): string[] => {
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split('>')
    .map(segment => segment.trim())
    .filter(segment => segment.length > 0);
};

const buildCategoryPathKey = (segments: string[]) => {
  return segments.map(segment => normalizeCategorySegment(segment)).join('>');
};

type RateLimitOptions<T> = {
  batchSize: number;
  batchDelayMs: number;
  parallel: number;
  perItemDelayMs: number;
  maxRetries: number;
  retryInitialDelayMs: number;
  retryBackoffMultiplier: number;
  shouldRetry?: (error: unknown, item: T) => boolean;
  onProgress?: (completed: number, total: number) => void;
};

type ProcessFailure<T> = {
  index: number;
  item: T;
  error: unknown;
  attempts: number;
  code?: number;
  message?: string;
  errorType?: string;
};

type ProcessResult<T> = {
  failures: ProcessFailure<T>[];
};

type ProposedCategory = {
  key: string;
  path: string[];
  label: string;
  name: string;
  slug: string;
  parentExistingId?: string | null;
  parentKey?: string | null;
  parentPath: string[];
  depth: number;
};

type ResolvedCategory = {
  id: string;
  slug: string | null;
  path: string[];
  label: string;
  ancestry: string[];
  matchType: 'slug' | 'name';
};

const buildCategorySlugMap = (categories: Category[]) => {
  const map = new Map<string, Category>();
  categories.forEach((category) => {
    if (category.slug) {
      map.set(category.slug.toLowerCase(), category);
    }
  });
  return map;
};

const buildCategoryNameMap = (categories: Category[]) => {
  const map = new Map<string, Category>();
  categories.forEach((category) => {
    map.set(category.name.toLowerCase(), category);
  });
  return map;
};

const resolveCategoryFromMaps = (
  rawValue: string | null | undefined,
  lookup: Map<string, Category>,
  slugMap: Map<string, Category>,
  nameMap: Map<string, Category>
): ResolvedCategory | null => {
  if (!rawValue) {
    return null;
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  const slugValue = slugify(trimmed);
  if (slugValue) {
    const slugMatch = slugMap.get(slugValue);
    if (slugMatch) {
      const path = getCategoryPath(slugMatch.$id, lookup);
      const ancestry = getCategoryAncestry(slugMatch.$id, lookup);
      const label = path.length > 0 ? formatCategoryPath(path) : slugMatch.name;
      return {
        id: slugMatch.$id,
        slug: slugMatch.slug ?? null,
        path,
        label,
        ancestry,
        matchType: 'slug',
      };
    }
  }

  const normalizedName = trimmed.toLowerCase();
  const nameMatch = nameMap.get(normalizedName);
  if (nameMatch) {
    const path = getCategoryPath(nameMatch.$id, lookup);
    const ancestry = getCategoryAncestry(nameMatch.$id, lookup);
    const label = path.length > 0 ? formatCategoryPath(path) : nameMatch.name;
    return {
      id: nameMatch.$id,
      slug: nameMatch.slug ?? null,
      path,
      label,
      ancestry,
      matchType: 'name',
    };
  }

  return null;
};

const buildCategoryIndexByParent = (categories: Category[]) => {
  const index = new Map<string, Map<string, Category>>();

  categories.forEach((category) => {
    const parentKey = category.parentId ?? 'root';
    if (!index.has(parentKey)) {
      index.set(parentKey, new Map());
    }
    const bucket = index.get(parentKey)!;
    bucket.set(`name:${category.name.trim().toLowerCase()}`, category);
    if (category.slug) {
      bucket.set(`slug:${category.slug.trim().toLowerCase()}`, category);
    }
  });

  return index;
};

const findCategoryInIndex = (
  index: Map<string, Map<string, Category>>,
  parentId: string | null,
  segment: string
): Category | null => {
  const parentKey = parentId ?? 'root';
  const bucket = index.get(parentKey);
  if (!bucket) {
    return null;
  }

  const normalizedName = segment.trim().toLowerCase();
  const nameMatch = bucket.get(`name:${normalizedName}`);
  if (nameMatch) {
    return nameMatch;
  }

  const slugCandidate = slugify(segment);
  if (slugCandidate) {
    const slugMatch = bucket.get(`slug:${slugCandidate.toLowerCase()}`);
    if (slugMatch) {
      return slugMatch;
    }
  }

  return null;
};

const extractErrorDetails = (error: unknown) => {
  if (error instanceof AppwriteException) {
    return {
      code: Number.isFinite(error.code) ? error.code : undefined,
      message: error.message || undefined,
      errorType: error.type || undefined,
    };
  }

  if (error instanceof Error) {
    const extended = error as Error & {
      code?: number;
      status?: number;
      statusCode?: number;
      response?: { status?: number; statusCode?: number };
      type?: string;
    };

    const statusCode =
      (typeof extended.code === 'number' ? extended.code : undefined) ??
      (typeof extended.status === 'number' ? extended.status : undefined) ??
      (typeof extended.statusCode === 'number' ? extended.statusCode : undefined) ??
      (typeof extended.response?.status === 'number' ? extended.response.status : undefined) ??
      (typeof extended.response?.statusCode === 'number' ? extended.response.statusCode : undefined);

    return {
      code: statusCode,
      message: extended.message,
      errorType: typeof extended.type === 'string' ? extended.type : undefined,
    };
  }

  if (error && typeof error === 'object') {
    const maybeRecord = error as {
      code?: number;
      status?: number;
      statusCode?: number;
      response?: { status?: number; statusCode?: number };
      message?: string;
      type?: string;
    };

    const statusCode =
      (typeof maybeRecord.code === 'number' ? maybeRecord.code : undefined) ??
      (typeof maybeRecord.status === 'number' ? maybeRecord.status : undefined) ??
      (typeof maybeRecord.statusCode === 'number' ? maybeRecord.statusCode : undefined) ??
      (typeof maybeRecord.response?.status === 'number' ? maybeRecord.response.status : undefined) ??
      (typeof maybeRecord.response?.statusCode === 'number' ? maybeRecord.response.statusCode : undefined);

    return {
      code: statusCode,
      message: typeof maybeRecord.message === 'string' ? maybeRecord.message : undefined,
      errorType: typeof maybeRecord.type === 'string' ? maybeRecord.type : undefined,
    };
  }

  return {
    code: undefined,
    message: error ? String(error) : undefined,
    errorType: undefined,
  };
};

const defaultShouldRetry = (error: unknown) => {
  const { code, message } = extractErrorDetails(error);
  if (code && [408, 425, 429, 500, 502, 503, 504].includes(code)) {
    return true;
  }

  if (typeof message === 'string') {
    const lowered = message.toLowerCase();
    if (
      lowered.includes('429') ||
      lowered.includes('too many requests') ||
      lowered.includes('rate limit') ||
      lowered.includes('timeout') ||
      lowered.includes('network error') ||
      lowered.includes('failed to fetch')
    ) {
      return true;
    }
  }

  return false;
};

const processWithRateLimit = async <T,>(
  items: T[],
  handler: (item: T, index: number) => Promise<void>,
  options: RateLimitOptions<T>
): Promise<ProcessResult<T>> => {
  const {
    batchSize,
    batchDelayMs,
    parallel,
    perItemDelayMs,
    maxRetries,
    retryInitialDelayMs,
    retryBackoffMultiplier,
    shouldRetry = defaultShouldRetry,
    onProgress,
  } = options;

  const total = items.length;
  const failures: ProcessFailure<T>[] = [];
  let completed = 0;

  if (total === 0) {
    return { failures };
  }

  const executeItem = async (item: T, index: number) => {
    let attempts = 0;

    while (true) {
      try {
        attempts += 1;
        await handler(item, index);
        break;
      } catch (error) {
        const errorDetails = extractErrorDetails(error);
        const canRetry = attempts <= maxRetries && shouldRetry(error, item);
        if (!canRetry) {
          failures.push({
            index,
            item,
            error,
            attempts,
            ...errorDetails,
          });
          break;
        }

        const backoffDelay = retryInitialDelayMs * Math.pow(retryBackoffMultiplier, attempts - 1);
        await sleep(backoffDelay);
      }
    }

    completed += 1;
    onProgress?.(completed, total);

    if (perItemDelayMs > 0) {
      await sleep(perItemDelayMs);
    }
  };

  for (let offset = 0; offset < total; offset += batchSize) {
    const batchItems = items.slice(offset, offset + batchSize);
    const normalizedParallel = Math.max(1, parallel);
    const workerCount = Math.min(normalizedParallel, batchItems.length);

    if (workerCount <= 1) {
      for (let localIndex = 0; localIndex < batchItems.length; localIndex += 1) {
        await executeItem(batchItems[localIndex], offset + localIndex);
      }
    } else {
      let cursor = 0;

      const workers = Array.from({ length: workerCount }, async () => {
        while (true) {
          const current = cursor;
          if (current >= batchItems.length) {
            break;
          }
          cursor += 1;
          await executeItem(batchItems[current], offset + current);
        }
      });

      await Promise.all(workers);
    }

    const processedSoFar = offset + batchItems.length;
    if (processedSoFar < total && batchDelayMs > 0) {
      await sleep(batchDelayMs);
    }
  }

  return { failures };
};

const IMPORT_RATE_LIMIT_CONFIG = {
  batchSize: 3,
  batchDelayMs: 1500,
  parallel: 1,
  perItemDelayMs: 400,
  maxRetries: 5,
  retryInitialDelayMs: 1500,
  retryBackoffMultiplier: 2,
  requestPauseMs: 250,
} as const;

export default function ImportProductsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedProduct[]>([]);
  const [preview, setPreview] = useState<CSVRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [existingProducts, setExistingProducts] = useState<{
    byCode: Record<string, ExistingProductMeta>;
    byName: Record<string, ExistingProductMeta>;
  }>({ byCode: {}, byName: {} });
  const [existingLoaded, setExistingLoaded] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [categoryCreationChoices, setCategoryCreationChoices] = useState<Record<string, boolean>>({});
  const { currentBusiness, userBusinesses, loading: businessLoading, isDemoUser } = useBusinessContext();
  const [authChecked, setAuthChecked] = useState(false);
  const previousBusinessIdProductsRef = useRef<string | null>(null);
  const previousBusinessIdCategoriesRef = useRef<string | null>(null);
  const categoryLookup = useMemo(() => buildCategoryMap(categories), [categories]);
  const categorySlugMap = useMemo(() => buildCategorySlugMap(categories), [categories]);
  const proposedCategories = useMemo(
    () => buildProposedCategoriesForProducts(parsedData, categories),
    [parsedData, categories]
  );
  useEffect(() => {
    setCategoryCreationChoices((prev) => {
      const next: Record<string, boolean> = {};
      proposedCategories.forEach((proposal) => {
        next[proposal.key] = Object.prototype.hasOwnProperty.call(prev, proposal.key)
          ? prev[proposal.key]
          : true;
      });

      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length === nextKeys.length && prevKeys.every((key) => prev[key] === next[key])) {
        return prev;
      }

      return next;
    });
  }, [proposedCategories]);
  const categoriesSelectedForCreation = proposedCategories.filter(
    (proposal) => categoryCreationChoices[proposal.key]
  );
  const categoryNameMap = useMemo(() => buildCategoryNameMap(categories), [categories]);
  const resolveCategory = useCallback(
    (rawValue?: string | null) =>
      resolveCategoryFromMaps(rawValue ?? null, categoryLookup, categorySlugMap, categoryNameMap),
    [categoryLookup, categoryNameMap, categorySlugMap]
  );

  useEffect(() => {
    let isMounted = true;

    const checkAuth = async () => {
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
          setAuthChecked(true);
        }
      }
    };

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (!authChecked || businessLoading || !userId) {
      return;
    }

    if (!currentBusiness) {
      if (userBusinesses.length === 0) {
        router.replace('/onboarding');
      }
      return;
    }
  }, [authChecked, businessLoading, currentBusiness, router, userId, userBusinesses]);

  useEffect(() => {
    if (!authChecked || businessLoading || !userId) {
      return;
    }

    if (!currentBusiness) {
      setExistingProducts({ byCode: {}, byName: {} });
      setExistingLoaded(true);
      return;
    }

    const businessId = currentBusiness.$id;

    if (previousBusinessIdProductsRef.current !== businessId) {
      previousBusinessIdProductsRef.current = businessId;
      setExistingProducts({ byCode: {}, byName: {} });
      setExistingLoaded(false);
    }

    let isCancelled = false;

    const loadExistingProducts = async () => {
      try {
        let response = await databases.listDocuments<ProductDocument>(
          DATABASE_ID,
          COLLECTIONS.PRODUCTS,
          [
            Query.equal('businessId', businessId),
            Query.limit(200)
          ]
        );

        if (response.documents.length === 0) {
          response = await databases.listDocuments<ProductDocument>(
            DATABASE_ID,
            COLLECTIONS.PRODUCTS,
            [
              Query.equal('userId', userId),
              Query.limit(200)
            ]
          );
        }

        if (isCancelled) {
          return;
        }

        const byCode: Record<string, ExistingProductMeta> = {};
        const byName: Record<string, ExistingProductMeta> = {};

        response.documents.forEach((doc) => {
          const nameValue = typeof doc.name === 'string' ? doc.name : '';
          const productCodeValue = typeof doc.productCode === 'string' ? doc.productCode : undefined;

          const meta: ExistingProductMeta = {
            id: doc.$id,
            name: nameValue,
            updatedAt: doc.$updatedAt,
            productCode: productCodeValue,
          };

          if (productCodeValue) {
            const key = productCodeValue.trim().toLowerCase();
            if (key) {
              byCode[key] = meta;
            }
          }

          if (nameValue) {
            const nameKey = nameValue.trim().toLowerCase();
            if (nameKey) {
              byName[nameKey] = meta;
            }
          }
        });

        setExistingProducts({ byCode, byName });
      } catch (error) {
        if (!isCancelled) {
          console.error('Failed to load existing products for duplicate detection:', error);
        }
      } finally {
        if (!isCancelled) {
          setExistingLoaded(true);
        }
      }
    };

    loadExistingProducts();

    return () => {
      isCancelled = true;
    };
  }, [authChecked, businessLoading, currentBusiness, userId]);

  useEffect(() => {
    if (!authChecked || businessLoading || !userId) {
      return;
    }

    if (!currentBusiness) {
      setCategories([]);
      setCategoriesLoaded(true);
      return;
    }

    const businessId = currentBusiness.$id;

    if (previousBusinessIdCategoriesRef.current !== businessId) {
      previousBusinessIdCategoriesRef.current = businessId;
      setCategories([]);
      setCategoriesLoaded(false);
    }

    let isMounted = true;

    const loadCategories = async () => {
      try {
        const result = await listBusinessCategories(businessId);
        if (!isMounted) return;
        setCategories(result);
      } catch (error) {
        if (!isMounted) return;
        console.error('Failed to load categories for import:', error);
        setCategories([]);
      } finally {
        if (isMounted) {
          setCategoriesLoaded(true);
        }
      }
    };

    loadCategories();

    return () => {
      isMounted = false;
    };
  }, [authChecked, businessLoading, currentBusiness, userId]);

  const normalizeKey = useCallback((value?: string | null) => {
    return value ? value.toString().trim().toLowerCase() : '';
  }, []);

  const detectExistingProduct = useCallback(
    (productCode: string, name: string) => {
      const codeKey = normalizeKey(productCode);
      if (codeKey) {
        const match = existingProducts.byCode[codeKey];
        if (match) {
          return { meta: match, type: 'code' as const };
        }
      }

      const nameKey = normalizeKey(name);
      if (nameKey) {
        const match = existingProducts.byName[nameKey];
        if (match) {
          return { meta: match, type: 'name' as const };
        }
      }

      return null;
    },
    [existingProducts, normalizeKey]
  );

  useEffect(() => {
    if (!existingLoaded) {
      return;
    }

    setParsedData((prev: ParsedProduct[]) => {
      let mutated = false;

      const next = prev.map<ParsedProduct>(product => {
        const existing = detectExistingProduct(product.productCode, product.name);

        if (existing) {
          const alreadyMatched = product.existingProductId === existing.meta.id && product.existingMatchType === existing.type;
          if (alreadyMatched) {
            return product;
          }

          mutated = true;
          return {
            ...product,
            existingProductId: existing.meta.id,
            existingProductName: existing.meta.name,
            existingUpdatedAt: existing.meta.updatedAt,
            existingMatchType: existing.type,
            action: (product.existingProductId ? product.action : 'skip') as ImportAction
          };
        }

        if (product.existingProductId) {
          mutated = true;
          return {
            ...product,
            existingProductId: undefined,
            existingProductName: undefined,
            existingUpdatedAt: undefined,
            existingMatchType: undefined,
            action: (product.action === 'skip' ? 'skip' : 'create') as ImportAction
          };
        }

        return product;
      });

      return mutated ? next : prev;
    });
  }, [existingLoaded, detectExistingProduct]);

  useEffect(() => {
    if (!categoriesLoaded) {
      return;
    }

    setParsedData((prev: ParsedProduct[]) => {
      let mutated = false;

      const next = prev.map<ParsedProduct>((product) => {
        const resolved = resolveCategory(product.category);

        if (resolved) {
          const alreadyMatched =
            product.categoryId === resolved.id &&
            product.categoryPathLabel === resolved.label &&
            product.categoryMatchType === resolved.matchType;

          if (alreadyMatched) {
            return product;
          }

          mutated = true;
          return {
            ...product,
            categoryId: resolved.id,
            categorySlug: resolved.slug ?? undefined,
            categoryPath: resolved.path,
            categoryPathLabel: resolved.label,
            categoryAncestors: resolved.ancestry,
            categoryMatchType: resolved.matchType,
          };
        }

        if (
          product.categoryId ||
          product.categoryPath ||
          product.categoryPathLabel ||
          product.categoryAncestors ||
          product.categoryMatchType
        ) {
          mutated = true;
          const nextProduct = { ...product };
          delete nextProduct.categoryId;
          delete nextProduct.categorySlug;
          delete nextProduct.categoryPath;
          delete nextProduct.categoryPathLabel;
          delete nextProduct.categoryAncestors;
          delete nextProduct.categoryMatchType;
          return nextProduct;
        }

        return product;
      });

      return mutated ? next : prev;
    });
  }, [categoriesLoaded, resolveCategory]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
        alert('Please upload a CSV file');
        return;
      }
      parseCSV(file);
    }
  };

  const parseCSV = async (file: File) => {
    setLoading(true);
    try {
      const text = await file.text();
      
      // Split by newlines but handle quoted fields with commas
      const lines: string[] = [];
      let currentLine = '';
      let insideQuotes = false;
      
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        
        if (char === '"') {
          insideQuotes = !insideQuotes;
        }
        
        if (char === '\n' && !insideQuotes) {
          if (currentLine.trim()) {
            lines.push(currentLine);
          }
          currentLine = '';
        } else {
          currentLine += char;
        }
      }
      if (currentLine.trim()) lines.push(currentLine);
      
      // Parse header
      const headers = parseCSVLine(lines[0]);
      console.log('CSV Headers:', headers);
      
      const rows: CSVRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        const values = parseCSVLine(lines[i]);
        const row = createEmptyCSVRow();
        headers.forEach((header, index) => {
          if (header in row) {
            const key = header as keyof CSVRow;
            row[key] = values[index] || '';
          }
        });
        rows.push(row);
      }

      console.log('Parsed rows:', rows.length);
      console.log('Sample row:', rows[0]);

      // Show preview
      setPreview(rows.slice(0, 5));

      // Group by product code
      const productMap = new Map<string, ParsedProduct>();
      
      rows.forEach(row => {
        const productCode = row['Product Code'];
        
        if (!productMap.has(productCode)) {
          productMap.set(productCode, {
            productCode,
            name: row['Product Name'],
            category: row['Category'],
            shortDescription: row['Short Description'],
            fullDescription: row['Full Description'],
            imageUrl: row['Product Image URL'],
            variants: [],
            action: 'create' as ImportAction
          });
        }

        const product = productMap.get(productCode)!;
        
        // Add variant
        const price = parseFloat(row['MRP (INR)'].replace(/[^0-9.]/g, '')) || 0;
        product.variants.push({
          size: row['Size (MM / Inch)'],
          finish: row['Colour / Finish'],
          price,
          sku: row['Variant Code'] || `${productCode}-${row['Size (MM / Inch)']}-${row['Colour / Finish']}`
        });
      });

      const productsWithActions = Array.from(productMap.values()).map<ParsedProduct>(product => {
        const resolvedCategory = resolveCategory(product.category);
        const enrichedProduct: ParsedProduct = resolvedCategory
          ? {
              ...product,
              categoryId: resolvedCategory.id,
              categorySlug: resolvedCategory.slug ?? undefined,
              categoryPath: resolvedCategory.path,
              categoryPathLabel: resolvedCategory.label,
              categoryAncestors: resolvedCategory.ancestry,
              categoryMatchType: resolvedCategory.matchType,
            }
          : product;

        const existing = detectExistingProduct(enrichedProduct.productCode, enrichedProduct.name);
        if (existing) {
          return {
            ...enrichedProduct,
            action: 'skip' as ImportAction,
            existingProductId: existing.meta.id,
            existingProductName: existing.meta.name,
            existingUpdatedAt: existing.meta.updatedAt,
            existingMatchType: existing.type
          };
        }
        return {
          ...enrichedProduct,
          action: 'create' as ImportAction
        };
      });

      setParsedData(productsWithActions);
      
      console.log(`✅ Parsed ${productsWithActions.length} products with ${rows.length} total variants`);
    } catch (error) {
      console.error('Error parsing CSV:', error);
      alert('Failed to parse CSV file');
    } finally {
      setLoading(false);
    }
  };

  // Helper function to parse a CSV line handling quoted fields
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let insideQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    
    return result;
  };

  const updateProductAction = (index: number, action: ImportAction) => {
    setParsedData(prev =>
      prev.map((product, i) =>
        i === index ? { ...product, action } : product
      )
    );
  };

  const applyBulkActionToDuplicates = (action: ImportAction) => {
    setParsedData(prev =>
      prev.map(product =>
        product.existingProductId ? { ...product, action } : product
      )
    );
  };

  const toggleCategoryCreationChoice = useCallback((key: string, value: boolean) => {
    setCategoryCreationChoices(prev => {
      if (prev[key] === value) {
        return prev;
      }
      return { ...prev, [key]: value };
    });
  }, []);

  const bulkSetCategoryCreationChoice = useCallback((value: boolean) => {
    setCategoryCreationChoices(prev => {
      const keys = Object.keys(prev);
      if (keys.length === 0) {
        return prev;
      }
      const allMatch = keys.every(key => prev[key] === value);
      if (allMatch) {
        return prev;
      }
      const next: Record<string, boolean> = {};
      keys.forEach(key => {
        next[key] = value;
      });
      return next;
    });
  }, []);

  const formatDateTime = (iso?: string) => {
    if (!iso) return 'Unknown';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
  };

  const duplicates = parsedData
    .map((product, index) => ({ product, index }))
    .filter(({ product }) => Boolean(product.existingProductId));
  const selectedForImport = parsedData.filter(product => product.action !== 'skip');
  const createCount = selectedForImport.filter(product => product.action === 'create').length;
  const updateCount = selectedForImport.filter(product => product.action === 'update').length;
  const skipCount = parsedData.filter(product => product.action === 'skip').length;
  const totalVariants = parsedData.reduce((sum, product) => sum + product.variants.length, 0);
  const unresolvedAfterPlanCount = useMemo(() => {
    if (selectedForImport.length === 0) {
      return 0;
    }

    const index = buildCategoryIndexByParent(categories);
    const selectedKeys = new Set(
      proposedCategories
        .filter(proposal => categoryCreationChoices[proposal.key])
        .map(proposal => proposal.key)
    );

    const canResolve = (product: ParsedProduct) => {
      if (product.categoryId) {
        return true;
      }
      const rawCategory = product.category;
      if (!rawCategory || !rawCategory.trim()) {
        return true;
      }
      const segments = parseCategorySegments(rawCategory);
      if (segments.length === 0) {
        return true;
      }

      let parentId: string | null = null;
      let parentPath: string[] = [];

      for (const segment of segments) {
        const existing = findCategoryInIndex(index, parentId, segment);
        if (existing) {
          parentId = existing.$id;
          parentPath = [...parentPath, existing.name];
          continue;
        }

        const nextPath = [...parentPath, segment];
        const key = buildCategoryPathKey(nextPath);
        if (!selectedKeys.has(key)) {
          return false;
        }

        parentId = null;
        parentPath = nextPath;
      }

      return true;
    };

    return selectedForImport.reduce((count, product) => (canResolve(product) ? count : count + 1), 0);
  }, [selectedForImport, categories, proposedCategories, categoryCreationChoices]);
  const hasUnresolvedCategories = unresolvedAfterPlanCount > 0;

  const handleImport = async () => {
    if (isDemoUser) {
      alertDemoReadOnly();
      return;
    }

    if (!userId) {
      alert('User not authenticated');
      return;
    }

    if (!currentBusiness) {
      alert('No business selected. Please choose a business before importing.');
      return;
    }

    if (parsedData.length === 0) {
      alert('No data to import');
      return;
    }

    const businessId = currentBusiness.$id;

    const productsToProcess = parsedData.filter(product => product.action !== 'skip');
    if (productsToProcess.length === 0) {
      alert('No products selected for import');
      return;
    }

    const createCountForConfirm = productsToProcess.filter(product => product.action === 'create').length;
    const updateCountForConfirm = productsToProcess.filter(product => product.action === 'update').length;

    if (!confirm(`Import ${productsToProcess.length} products? (${createCountForConfirm} new, ${updateCountForConfirm} updates)`)) {
      return;
    }

    const runWithRequestPause = async <T,>(action: () => Promise<T>): Promise<T> => {
      try {
        return await action();
      } catch (error) {
        const { code } = extractErrorDetails(error);
        if (code && [408, 425, 429, 500, 502, 503, 504].includes(code)) {
          const extraDelay =
            IMPORT_RATE_LIMIT_CONFIG.retryInitialDelayMs *
            IMPORT_RATE_LIMIT_CONFIG.retryBackoffMultiplier;
          if (Number.isFinite(extraDelay) && extraDelay > 0) {
            await sleep(extraDelay);
          }
        }
        throw error;
      } finally {
        if (IMPORT_RATE_LIMIT_CONFIG.requestPauseMs > 0) {
          await sleep(IMPORT_RATE_LIMIT_CONFIG.requestPauseMs);
        }
      }
    };

    const categoriesSnapshot = [...categories];
    const selectedCategoryKeys = new Set(
      proposedCategories
        .filter(proposal => categoryCreationChoices[proposal.key])
        .map(proposal => proposal.key)
    );
    const categoryIndexForValidation = buildCategoryIndexByParent(categoriesSnapshot);

    const canResolveCategoryForProduct = (product: ParsedProduct) => {
      if (product.categoryId) {
        return true;
      }
      const rawCategory = product.category;
      if (!rawCategory || !rawCategory.trim()) {
        return true;
      }
      const segments = parseCategorySegments(rawCategory);
      if (segments.length === 0) {
        return true;
      }

      let parentId: string | null = null;
      let parentPath: string[] = [];

      for (const segment of segments) {
        const existing = findCategoryInIndex(categoryIndexForValidation, parentId, segment);
        if (existing) {
          parentId = existing.$id;
          parentPath = [...parentPath, existing.name];
          continue;
        }

        const nextPath = [...parentPath, segment];
        const key = buildCategoryPathKey(nextPath);
        if (!selectedCategoryKeys.has(key)) {
          return false;
        }

        parentId = null;
        parentPath = nextPath;
      }

      return true;
    };

    const unresolvedProducts = productsToProcess.filter(product => !canResolveCategoryForProduct(product));
    if (unresolvedProducts.length > 0) {
      const sample = unresolvedProducts
        .slice(0, 3)
        .map(product => `• ${product.name || product.productCode || 'Unnamed product'} (${product.category || 'No category'})`)
        .join('\n');
      alert(
        `Some products reference categories that are not selected for creation.\n` +
        `Please create or map those categories before importing.\n\n` +
        `${sample}`
      );
      return;
    }

    const categoriesToCreate = categoriesSelectedForCreation
      .slice()
      .sort((a, b) => a.depth - b.depth);

    const createdCategoryIds = new Map<string, string>();
    const createdCategories: Category[] = [];
    const categoryIndexMutable = categoryIndexForValidation;

    const addCategoryToIndex = (category: Category) => {
      const parentKey = category.parentId ?? 'root';
      if (!categoryIndexMutable.has(parentKey)) {
        categoryIndexMutable.set(parentKey, new Map());
      }
      const bucket = categoryIndexMutable.get(parentKey)!;
      bucket.set(`name:${category.name.trim().toLowerCase()}`, category);
      if (category.slug) {
        bucket.set(`slug:${category.slug.trim().toLowerCase()}`, category);
      }
    };

    for (const proposal of categoriesToCreate) {
      let parentId: string | null = proposal.parentExistingId ?? null;
      if (!parentId && proposal.parentKey) {
        parentId = createdCategoryIds.get(proposal.parentKey) ?? null;
      }

      const existing = findCategoryInIndex(categoryIndexMutable, parentId, proposal.name);
      if (existing) {
        createdCategoryIds.set(proposal.key, existing.$id);
        continue;
      }

      const fallbackSlug =
        proposal.slug && proposal.slug.length > 0
          ? proposal.slug
          : slugify(proposal.name) || proposal.name.trim().toLowerCase().replace(/\s+/g, '-') || `category-${Date.now()}`;
      const sortOrder = proposal.depth * 100;

      const createdDoc = await runWithRequestPause(() =>
        databases.createDocument(
          DATABASE_ID,
          COLLECTIONS.CATEGORIES,
          ID.unique(),
          {
            userId,
            businessId,
            name: proposal.name,
            slug: fallbackSlug,
            description: null,
            image: null,
            parentId: parentId ?? null,
            sortOrder,
          }
        )
      );

      const normalizedCategory: Category = {
        $id: createdDoc.$id,
        name: typeof createdDoc.name === 'string' ? createdDoc.name : proposal.name,
        slug:
          typeof createdDoc.slug === 'string' && createdDoc.slug.length > 0
            ? createdDoc.slug
            : fallbackSlug,
        description:
          typeof createdDoc.description === 'string' && createdDoc.description.length > 0
            ? createdDoc.description
            : null,
        image:
          typeof createdDoc.image === 'string' && createdDoc.image.length > 0
            ? createdDoc.image
            : null,
        parentId:
          typeof createdDoc.parentId === 'string' && createdDoc.parentId.length > 0
            ? createdDoc.parentId
            : parentId ?? null,
        sortOrder:
          typeof createdDoc.sortOrder === 'number'
            ? createdDoc.sortOrder
            : sortOrder,
      };

      createdCategoryIds.set(proposal.key, normalizedCategory.$id);
      createdCategories.push(normalizedCategory);
      addCategoryToIndex(normalizedCategory);
    }

    const categoriesAfterCreation = categoriesSnapshot.concat(createdCategories);
    if (createdCategories.length > 0) {
      setCategories(prev => {
        const existingIds = new Set(prev.map(category => category.$id));
        const toAdd = createdCategories.filter(category => !existingIds.has(category.$id));
        return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
      });
    }

    const effectiveCategoryLookup = buildCategoryMap(categoriesAfterCreation);
    const effectiveCategorySlugMap = buildCategorySlugMap(categoriesAfterCreation);
    const effectiveCategoryNameMap = buildCategoryNameMap(categoriesAfterCreation);

    const productsReadyForImport = productsToProcess.map(product => {
      let resolved: ResolvedCategory | null = null;

      if (product.categoryId && effectiveCategoryLookup.has(product.categoryId)) {
        const matched = effectiveCategoryLookup.get(product.categoryId)!;
        const path = getCategoryPath(product.categoryId, effectiveCategoryLookup);
        const ancestry = getCategoryAncestry(product.categoryId, effectiveCategoryLookup);
        const label = path.length > 0 ? formatCategoryPath(path) : matched.name;
        resolved = {
          id: matched.$id,
          slug: matched.slug ?? null,
          path,
          label,
          ancestry,
          matchType: product.categoryMatchType ?? 'name',
        };
      }

      if (!resolved) {
        resolved = resolveCategoryFromMaps(
          product.category ?? null,
          effectiveCategoryLookup,
          effectiveCategorySlugMap,
          effectiveCategoryNameMap
        );
      }

      if (resolved) {
        return {
          ...product,
          categoryId: resolved.id,
          categorySlug: resolved.slug ?? undefined,
          categoryPath: resolved.path,
          categoryPathLabel: resolved.label,
          categoryAncestors: resolved.ancestry,
          categoryMatchType: resolved.matchType,
        };
      }

      return {
        ...product,
        categoryId: undefined,
        categorySlug: undefined,
        categoryPath: undefined,
        categoryPathLabel: undefined,
        categoryAncestors: undefined,
        categoryMatchType: undefined,
      };
    });

    const unresolvedAfterCreation = productsReadyForImport.filter(
      product => product.category && product.category.trim().length > 0 && !product.categoryId
    );
    if (unresolvedAfterCreation.length > 0) {
      const sample = unresolvedAfterCreation
        .slice(0, 3)
        .map(product => `• ${product.name || product.productCode || 'Unnamed product'} (${product.category})`)
        .join('\n');
      alert(
        `Some products still have unresolved categories after applying the creation plan.\n\n${sample}`
      );
      return;
    }

    const categoryLookupForImport = effectiveCategoryLookup;

    const importProduct = async (product: ParsedProduct) => {
      const images = product.imageUrl ? [product.imageUrl] : [];
      const resolvedPath = product.categoryPath && product.categoryPath.length > 0
        ? product.categoryPath
        : product.categoryId
          ? getCategoryPath(product.categoryId, categoryLookupForImport)
          : [];
      const resolvedAncestors = product.categoryAncestors && product.categoryAncestors.length > 0
        ? product.categoryAncestors
        : product.categoryId
          ? getCategoryAncestry(product.categoryId, categoryLookupForImport)
          : [];
      const categoryName =
        resolvedPath.length > 0
          ? resolvedPath[resolvedPath.length - 1]
          : (product.category ? product.category.trim() || null : null);
      const categoryPathLabel =
        product.categoryPathLabel ??
        (resolvedPath.length > 0 ? formatCategoryPath(resolvedPath) : null);
      const categorySlug =
        product.categorySlug ??
        (product.categoryId ? categoryLookupForImport.get(product.categoryId)?.slug ?? null : null);

      const matchedCategory = product.categoryId ? categoryLookupForImport.get(product.categoryId) ?? null : null;
      const categoryLabel = categoryPathLabel ?? categoryName ?? null;
      const categoryMeta = product.categoryId && categoryLabel
        ? {
            id: product.categoryId,
            slug: categorySlug ?? matchedCategory?.slug ?? null,
            label: categoryLabel,
            path: resolvedPath,
            ancestors: resolvedAncestors,
          }
        : null;
      const categoryValue = categoryMeta ? serializeCategoryMeta(categoryMeta) : null;

      const baseProductData = {
        name: product.name,
        description: product.fullDescription || product.shortDescription || null,
        category: categoryValue,
        basePrice: 0,
        hasVariants: product.variants.length > 0
      };

      const createProductPayload = {
        ...baseProductData,
        businessId,
        userId,
        archived: false,
      };

      const updateProductPayload = {
        ...baseProductData,
        businessId,
      };

      let targetProductId: string;

      if (product.action === 'update' && product.existingProductId) {
        const existingProductId = product.existingProductId;
        const updatePayload: typeof updateProductPayload & { images?: string[] } = {
          ...updateProductPayload
        };

        if (images.length > 0) {
          updatePayload.images = images;
        }

        await runWithRequestPause(() =>
          databases.updateDocument(
            DATABASE_ID,
            COLLECTIONS.PRODUCTS,
            existingProductId,
            updatePayload
          )
        );

        targetProductId = existingProductId;

        let existingVariants = await runWithRequestPause(() =>
          databases.listDocuments<VariantDocument>(
            DATABASE_ID,
            COLLECTIONS.PRODUCT_VARIANTS,
            [
              Query.equal('productId', targetProductId),
              Query.equal('businessId', businessId),
              Query.limit(200)
            ]
          )
        );

        if (existingVariants.documents.length === 0) {
          existingVariants = await runWithRequestPause(() =>
            databases.listDocuments<VariantDocument>(
              DATABASE_ID,
              COLLECTIONS.PRODUCT_VARIANTS,
              [
                Query.equal('productId', targetProductId),
                Query.limit(200)
              ]
            )
          );
        }

        for (const variant of existingVariants.documents) {
          await runWithRequestPause(() =>
            databases.deleteDocument(
              DATABASE_ID,
              COLLECTIONS.PRODUCT_VARIANTS,
              variant.$id
            )
          );
        }
      } else {
        const createdProduct = await runWithRequestPause(() =>
          databases.createDocument(
            DATABASE_ID,
            COLLECTIONS.PRODUCTS,
            ID.unique(),
            {
              ...createProductPayload,
              images
            }
          )
        );

        targetProductId = createdProduct.$id;
      }

      if (product.variants.length > 0) {
        for (const variant of product.variants) {
          const attributes = {
            Size: variant.size,
            Finish: variant.finish
          };

          await runWithRequestPause(() =>
            databases.createDocument(
              DATABASE_ID,
              COLLECTIONS.PRODUCT_VARIANTS,
              ID.unique(),
              {
                productId: targetProductId,
                userId,
                businessId,
                variantName: `${variant.size} - ${variant.finish}`,
                attributes: JSON.stringify(attributes),
                price: variant.price,
                sku: variant.sku || null,
                enabled: true,
                images: []
              }
            )
          );
        }
      }
    };

    setImporting(true);
    setProgress({ current: 0, total: productsReadyForImport.length });

    try {
      const { failures } = await processWithRateLimit(
        productsReadyForImport,
        async (product) => {
          await importProduct(product);
        },
        {
          batchSize: IMPORT_RATE_LIMIT_CONFIG.batchSize,
          batchDelayMs: IMPORT_RATE_LIMIT_CONFIG.batchDelayMs,
          parallel: IMPORT_RATE_LIMIT_CONFIG.parallel,
          perItemDelayMs: IMPORT_RATE_LIMIT_CONFIG.perItemDelayMs,
          maxRetries: IMPORT_RATE_LIMIT_CONFIG.maxRetries,
          retryInitialDelayMs: IMPORT_RATE_LIMIT_CONFIG.retryInitialDelayMs,
          retryBackoffMultiplier: IMPORT_RATE_LIMIT_CONFIG.retryBackoffMultiplier,
          onProgress: (completed, total) => {
            setProgress({ current: completed, total });
          },
        }
      );

      if (failures.length > 0) {
        console.error('Import completed with failures:', failures);
        const failureDetails = failures.slice(0, 5).map((failure) => {
          const label = failure.item.name || failure.item.productCode || 'Unnamed product';
          const detailParts = [];
          if (failure.code) {
            detailParts.push(`code ${failure.code}`);
          }
          if (failure.message) {
            detailParts.push(failure.message);
          }
          if (!detailParts.length && failure.errorType) {
            detailParts.push(failure.errorType);
          }
          if (!detailParts.length) {
            detailParts.push('Unknown error');
          }
          return `• ${label}: ${detailParts.join(' – ')}`;
        });

        alert(
          `Imported ${productsReadyForImport.length - failures.length} products, ${failures.length} failed.\n\n` +
          `${failureDetails.join('\n')}${failures.length > failureDetails.length ? '\n• Additional failures not shown. See console for full list.' : ''}`
        );
        return;
      }

      alert(`Successfully processed ${productsReadyForImport.length} products!`);
      router.push('/dashboard');
    } catch (error) {
      console.error('Import error:', error);
      alert('Failed to import products. Check console for details.');
    } finally {
      setImporting(false);
    }
  };

  if (!authChecked || businessLoading || !userId || !currentBusiness) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {isDemoUser && (
        <div className="mb-6 rounded-md border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900">
          Demo mode is read-only. Use this import flow to explore the experience, but data will not be written.
        </div>
      )}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Import Products from CSV</h1>
        <Button variant="outline" onClick={() => router.push('/dashboard')}>
          Cancel
        </Button>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Upload CSV File</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="csv">CSV File *</Label>
            <Input
              id="csv"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              disabled={importing}
            />
            <p className="text-sm text-gray-600 mt-2">
              Expected columns: Product Code, Product Name, Category, Size, Colour/Finish, MRP, etc.
            </p>
          </div>

          {loading && <p>Parsing CSV file...</p>}

          {preview.length > 0 && (
            <div className="border rounded-lg overflow-auto max-h-64">
              <p className="text-sm font-semibold p-2 bg-gray-50">Preview (first 5 rows):</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product Code</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Finish</TableHead>
                    <TableHead>MRP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>{row['Product Code']}</TableCell>
                      <TableCell>{row['Product Name']}</TableCell>
                      <TableCell>{row['Size (MM / Inch)']}</TableCell>
                      <TableCell>{row['Colour / Finish']}</TableCell>
                      <TableCell>{row['MRP (INR)']}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {parsedData.length > 0 && (
        <>
          {proposedCategories.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Proposed Categories</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1 text-sm text-gray-700">
                  <p>
                    We detected {proposedCategories.length} categor{proposedCategories.length === 1 ? 'y' : 'ies'} that do not yet exist.
                    Select which ones to create before importing products so categories are linked correctly.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => bulkSetCategoryCreationChoice(true)}
                  >
                    Select All
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => bulkSetCategoryCreationChoice(false)}
                  >
                    Deselect All
                  </Button>
                </div>

                <p className="text-sm text-gray-600">
                  Selected for creation: {categoriesSelectedForCreation.length} of {proposedCategories.length}
                </p>

                <div className="border rounded-lg overflow-auto max-h-80">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16 text-center">Create</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Parent</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {proposedCategories.map((proposal) => {
                        const parentLabel = proposal.parentPath.length > 0
                          ? formatCategoryPath(proposal.parentPath)
                          : 'Top level';
                        const creationSelected = categoryCreationChoices[proposal.key] ?? true;
                        return (
                          <TableRow key={proposal.key}>
                            <TableCell className="text-center">
                              <Checkbox
                                checked={creationSelected}
                                onCheckedChange={(checked) =>
                                  toggleCategoryCreationChoice(proposal.key, checked === true)
                                }
                                aria-label={`Create category ${proposal.label}`}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <p className="text-sm font-medium text-gray-900">{proposal.label}</p>
                                <p className="text-xs text-gray-500">Slug suggestion: {proposal.slug || 'n/a'}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <p className="text-sm text-gray-800">{parentLabel}</p>
                              <p className="text-xs text-gray-500">
                                {proposal.parentExistingId
                                  ? 'Parent already exists'
                                  : proposal.parentPath.length > 0
                                    ? 'Parent will be created from selections'
                                    : 'Root category'}
                              </p>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Parsed Data Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p><strong>Total Products:</strong> {parsedData.length}</p>
                <p><strong>Total Variants:</strong> {totalVariants}</p>
                <p><strong>Categories:</strong> {Array.from(new Set(parsedData.map(p => p.categoryPathLabel || p.category).filter(Boolean))).join(', ') || '—'}</p>
                <p><strong>Duplicates Detected:</strong> {duplicates.length}</p>
                <p>
                  <strong>Selected to Import:</strong> {selectedForImport.length}{' '}
                  <span className="text-sm text-gray-600">
                    (Create: {createCount}, Update: {updateCount}, Skip: {skipCount})
                  </span>
                </p>
              </div>

              {hasUnresolvedCategories && (
                <p className="mt-2 text-sm text-red-600">
                  {unresolvedAfterPlanCount} product{unresolvedAfterPlanCount === 1 ? '' : 's'} still lack a matched category. Select or create the missing categories before importing.
                </p>
              )}

              <div className="mt-6">
                <Button 
                  onClick={handleImport} 
                  disabled={importing || selectedForImport.length === 0 || hasUnresolvedCategories || isDemoUser}
                  className="w-full"
                >
                  {importing 
                    ? `Importing... ${progress.current}/${progress.total}` 
                  : selectedForImport.length === 0
                    ? 'Select products to import'
                    : isDemoUser
                      ? 'Demo mode is read-only'
                      : hasUnresolvedCategories
                        ? 'Resolve category mappings'
                        : `Import ${selectedForImport.length} Products`}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {duplicates.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Duplicate Products Detected</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-gray-700">
                We found {duplicates.length} product code(s) that already exist. Choose how to handle each duplicate before importing.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => applyBulkActionToDuplicates('update')}
                >
                  Update All
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => applyBulkActionToDuplicates('skip')}
                >
                  Skip All
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => applyBulkActionToDuplicates('create')}
                >
                  Duplicate All
                </Button>
              </div>
            </div>

            <div className="border rounded-lg overflow-auto max-h-80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[140px]">Product Code</TableHead>
                    <TableHead className="min-w-[200px]">CSV Product</TableHead>
                    <TableHead className="min-w-[220px]">Existing Product</TableHead>
                    <TableHead className="min-w-[140px]">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {duplicates.map(({ product, index }) => (
                    <TableRow key={`${product.productCode || product.name || 'row'}-${index}`}>
                      <TableCell className="font-medium">{product.productCode || '—'}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-gray-900">{product.name || 'Untitled'}</p>
                          <p className="text-xs text-gray-500">
                            {(product.categoryPathLabel || product.category || 'No category')} • {product.variants.length} variant(s)
                            {product.categoryMatchType && product.categoryId ? ` • mapped by ${product.categoryMatchType}` : ''}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-sm">
                          <p className="font-medium text-gray-900">{product.existingProductName || 'Existing product'}</p>
                          <p className="text-xs text-gray-500">
                            Last updated: {formatDateTime(product.existingUpdatedAt)}
                          </p>
                          {product.existingMatchType && (
                            <p className="text-xs text-gray-500">
                              Matched by {product.existingMatchType === 'code' ? 'product code' : 'product name'}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <select
                          className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm"
                          value={product.action}
                          onChange={(e) => updateProductAction(index, e.target.value as ImportAction)}
                        >
                          <option value="update">Update existing</option>
                          <option value="skip">Skip import</option>
                          <option value="create">Create duplicate</option>
                        </select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {importing && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress:</span>
                <span>{progress.current} / {progress.total}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
              <p className="text-sm text-gray-600">Please wait, this may take a few minutes...</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
