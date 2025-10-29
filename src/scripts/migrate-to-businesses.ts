import { ID, Query } from 'appwrite';
import { account, databases, DATABASE_ID, COLLECTIONS } from '@/lib/appwrite';

const PAGE_LIMIT = 100;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

type DocumentRecord = Record<string, unknown> & { $id: string; businessId?: string | null };

function needsBusinessId(doc: DocumentRecord): boolean {
  const current = doc.businessId;
  if (current === undefined || current === null) {
    return true;
  }
  if (typeof current === 'string' && current.trim().length === 0) {
    return true;
  }
  return false;
}

async function paginateDocuments(collectionId: string, baseQueries: string[]) {
  const documents: DocumentRecord[] = [];
  let cursor: string | null = null;
  let hasMore = true;

  while (hasMore) {
    const queries = [...baseQueries, Query.limit(PAGE_LIMIT)];
    if (cursor) {
      queries.push(Query.cursorAfter(cursor));
    }

    const response = await databases.listDocuments(
      DATABASE_ID,
      collectionId,
      queries
    );

    if (response.documents.length === 0) {
      hasMore = false;
      continue;
    }

    documents.push(...(response.documents as unknown as DocumentRecord[]));

    if (response.documents.length < PAGE_LIMIT) {
      hasMore = false;
    } else {
      cursor = response.documents[response.documents.length - 1].$id;
    }
  }

  return documents;
}

async function ensureBusinessId(
  collectionId: string,
  documents: DocumentRecord[],
  businessId: string
) {
  const targets = documents.filter((doc) => {
    if (!needsBusinessId(doc)) {
      return false;
    }
    return true;
  });
  if (targets.length === 0) {
    return;
  }

  for (const document of targets) {
    try {
      await databases.updateDocument(
        DATABASE_ID,
        collectionId,
        document.$id,
        { businessId }
      );
      document.businessId = businessId;
    } catch (error) {
      console.error(`Failed to update ${collectionId} document ${document.$id}:`, error);
    }
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

export async function migrateToBusinesses(): Promise<void> {
  const user = await account.get();
  const userId = user.$id;

  const existingMemberships = await databases.listDocuments(
    DATABASE_ID,
    COLLECTIONS.BUSINESS_USERS,
    [Query.equal('userId', userId), Query.limit(1)]
  );

  let businessId: string;

  if (existingMemberships.total > 0) {
    const membership = existingMemberships.documents[0] as Record<string, unknown>;
    const membershipBusinessId =
      typeof membership.businessId === 'string' ? membership.businessId : null;

    if (!membershipBusinessId) {
      throw new Error('Existing membership missing businessId. Please repair data manually.');
    }

    businessId = membershipBusinessId;
  } else {
    const defaultName = 'My Business';
    const baseSlug = slugify(defaultName);
    const uniqueSlug = baseSlug ? `${baseSlug}-${userId.slice(0, 6)}` : `business-${userId}`;

    const business = await databases.createDocument(
      DATABASE_ID,
      COLLECTIONS.BUSINESSES,
      ID.unique(),
      {
        ownerId: userId,
        name: defaultName,
        slug: uniqueSlug,
        whatsappNumber: null,
        address: null,
        logo: null,
        settings: {},
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

    businessId = business.$id;
  }

  const productDocs = await paginateDocuments(COLLECTIONS.PRODUCTS, [Query.equal('userId', userId)]);
  await ensureBusinessId(COLLECTIONS.PRODUCTS, productDocs, businessId);

  const productIds = productDocs.map((doc) => doc.$id);

  const variantDocsByUser = await paginateDocuments(
    COLLECTIONS.PRODUCT_VARIANTS,
    [Query.equal('userId', userId)]
  );

  await ensureBusinessId(COLLECTIONS.PRODUCT_VARIANTS, variantDocsByUser, businessId);

  if (productIds.length > 0) {
    const productIdChunks = chunk(productIds, 100);
    for (const chunkIds of productIdChunks) {
      const variantDocsByProduct = await paginateDocuments(
        COLLECTIONS.PRODUCT_VARIANTS,
        [Query.equal('productId', chunkIds)]
      );
      await ensureBusinessId(COLLECTIONS.PRODUCT_VARIANTS, variantDocsByProduct, businessId);
    }
  }

  const categoryDocs = await paginateDocuments(
    COLLECTIONS.CATEGORIES,
    [Query.equal('userId', userId)]
  );

  await ensureBusinessId(COLLECTIONS.CATEGORIES, categoryDocs, businessId);

  console.info('Migration completed successfully for user:', userId);
}

export default migrateToBusinesses;
