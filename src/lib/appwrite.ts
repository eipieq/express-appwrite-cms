import { Account, Client, Databases, Storage } from 'appwrite';

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const devKey = process.env.NEXT_PUBLIC_APPWRITE_DEV_KEY;

function configureClient(client: Client) {
    if (endpoint && projectId) {
        client.setEndpoint(endpoint).setProject(projectId);
    }

    if (process.env.NODE_ENV === 'development' && devKey) {
        client.setDevKey(devKey);
    }
}

export const client = new Client();
configureClient(client);

export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);

// Database and Collection IDs
export const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID ?? '';
export const COLLECTIONS = {
    PRODUCTS: process.env.NEXT_PUBLIC_APPWRITE_COLLECTION_PRODUCTS ?? 'products',
    PRODUCT_VARIANTS: process.env.NEXT_PUBLIC_APPWRITE_COLLECTION_PRODUCT_VARIANTS ?? 'product_variants',
    CATEGORIES: process.env.NEXT_PUBLIC_APPWRITE_COLLECTION_CATEGORIES ?? 'categories',
    BUSINESSES: process.env.NEXT_PUBLIC_APPWRITE_COLLECTION_BUSINESSES ?? 'businesses',
    BUSINESS_USERS: process.env.NEXT_PUBLIC_APPWRITE_COLLECTION_BUSINESS_USERS ?? 'business_users'
} as const;

// Storage bucket ID (you'll need to create this in Appwrite)
export const STORAGE_BUCKET_ID = process.env.NEXT_PUBLIC_APPWRITE_STORAGE_BUCKET_ID ?? 'product-images';

export function createAdminClient() {
    const adminClient = new Client();
    configureClient(adminClient);

    return {
        account: new Account(adminClient),
        databases: new Databases(adminClient),
        storage: new Storage(adminClient)
    };
}
