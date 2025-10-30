# Appwrite Database Setup Guide

This guide walks you through provisioning the Appwrite resources that power Express Appwrite CMS and highlights the key places you can customize the data model for your own catalog needs.

## 1. Prerequisites
- An Appwrite project (self-hosted or Appwrite Cloud).
- Access to the Appwrite Console with permission to manage Databases, Storage, and Teams.
- The environment variables from `.env.example` copied into `.env.local` (or your deployment provider) with your real project values.
- The CMS code running locally (`npm run dev`) so you can verify the setup as you go.

> Tip: keep the [Product Varieties Database documentation](../documentation/database_documentation.md) open alongside this guide if you need a deeper explanation of relationships or sample data.

## 2. Create the Database Skeleton
1. In the Appwrite Console, open **Databases → Create database** and note the database ID.  
   - Default ID suggested by the project: `express-cms`.
   - Copy this value into `NEXT_PUBLIC_APPWRITE_DATABASE_ID`.
2. Inside the new database, create the following collections. You can reuse the IDs below or choose your own (update the matching `NEXT_PUBLIC_APPWRITE_COLLECTION_*` env vars if you do):
   | Collection | Suggested ID | Purpose |
   | --- | --- | --- |
   | Businesses | `businesses` | Stores tenant/workspace level settings. |
   | Business members | `business_users` | Maps Appwrite users to a business with a role. |
   | Categories | `categories` | Nested taxonomy used by the catalog UI. |
   | Products | `products` | Base product records. |
   | Product variants | `product_variants` | Variant rows tied back to a product. |

## 3. Configure Collection Attributes

Below are the minimum attribute sets the application expects. Adjust names or add new attributes as needed, but keep the required keys aligned with the UI code.

### 3.1 Businesses
| Attribute | Type | Required | Notes |
| --- | --- | --- | --- |
| `ownerId` | String | Yes | Appwrite user ID of the owner. |
| `name` | String | Yes | Display name shown across the UI. |
| `slug` | String | Yes | Unique slug for URLs; generated automatically during onboarding. |
| `whatsappNumber` | String | No | Contact number; nullable. |
| `address` | String | No | Mailing or fulfillment address. |
| `logo` | String | No | Storage file URL or external logo. |
| `settings` | JSON | No | Free-form map for feature flags or preferences. |

### 3.2 Business Members (`business_users`)
| Attribute | Type | Required | Notes |
| --- | --- | --- | --- |
| `businessId` | String | Yes | Reference to `businesses.$id`. |
| `userId` | String | Yes | Appwrite account ID. |
| `role` | String | Yes | One of `owner`, `admin`, `editor`, `viewer` (UI checks these values). |
| `invitedBy` | String | No | Source invite user ID or `null`. |

Create an index on `userId` (equal) and another on `businessId` to keep lookups fast.

### 3.3 Categories
| Attribute | Type | Required | Notes |
| --- | --- | --- | --- |
| `businessId` | String | Yes | All category queries scope by business. |
| `name` | String | Yes | Display name. |
| `slug` | String | No | Optional, used for storefront URLs. |
| `description` | String | No | Longer summary. |
| `image` | String | No | Storage file URL for hero image. |
| `parentId` | String | No | Reference to another category’s `$id` to build hierarchies. |
| `sortOrder` | Integer | No | Controls ordering; defaults to 0. |

Indexes: `businessId` (equal), `parentId` (equal) for child lookups, and optionally `slug` (unique) if you expose public category URLs.

### 3.4 Products
| Attribute | Type | Required | Notes |
| --- | --- | --- | --- |
| `businessId` | String | Yes | Scopes the product to a tenant. |
| `userId` | String | Yes | Creator/owner user ID. |
| `name` | String | Yes | Product title. |
| `description` | String | No | Rich description; nullable. |
| `category` | String | No | JSON blob produced by `serializeCategoryMeta` with display info. |
| `basePrice` | Integer | No | Stored in the smallest currency unit (₹ in the sample UI). |
| `images` | String[] | No | Array of storage URLs returned by Appwrite. |
| `hasVariants` | Boolean | Yes | Flags whether product-level price should be ignored in favor of variants. |

Recommended indexes: `businessId` (equal + order desc `$createdAt`), optional `name` (full-text) if you need server-side search.

### 3.5 Product Variants
| Attribute | Type | Required | Notes |
| --- | --- | --- | --- |
| `businessId` | String | Yes | Always match the parent product’s business. |
| `productId` | String | Yes | Reference to the parent product. |
| `userId` | String | Yes | Creator/last editor. |
| `variantName` | String | Yes | Human-readable label (e.g., "Red / Large"). |
| `attributes` | String | Yes | JSON stringified map of attribute → value. |
| `price` | Integer | Yes | Variant price; same currency unit as product. |
| `sku` | String | No | Optional SKU/identifier. |
| `enabled` | Boolean | Yes | UI only lists variants with `true`. |
| `images` | String[] | No | Reserved for per-variant imagery (currently stored empty). |

Indexes: `productId` (equal), `businessId` + `productId` (compound) for admin queries, and optionally `sku` (unique).

## 4. Permissions & Policies
Set collection permissions to enforce multi-tenancy:
- **Businesses**: owner can read/write; invited members read; admins can update.
- **business_users**: members read records for their business; only owners/admins create or delete.
- **Categories**, **Products**, **Product Variants**: allow read/write access to owner/admin of the business; editors can create/update but not delete; viewers read only.
- Restrict `userId` and `businessId` fields from being edited by arbitrary users using Appwrite’s attribute-level permissions if needed.

## 5. Storage Bucket
Create a storage bucket (default `product-images`) for product and business logos:
- Enable read permissions for relevant roles or signed URLs.
- Update `NEXT_PUBLIC_APPWRITE_STORAGE_BUCKET_ID` to match the bucket ID.

## 6. Tailoring the Schema
The defaults aim to cover a broad catalog use case, but you can customize safely:
- **Different pricing rules**: add fields such as `compareAtPrice` or `currency`. Update product forms (`src/app/add-product/page.tsx`, `src/app/products/[productId]/edit/page.tsx`) and the API route (`src/app/api/products/route.ts`) to read/write them.
- **Inventory tracking**: extend `product_variants` with `stockQuantity` or `lowStockThreshold`. Surface the new fields in the dashboard components.
- **Public storefront fields**: add SEO metadata or tags to `products`, then expose them via the `/api/products` route.
- **Multiple catalogs per business**: introduce a `catalogId` attribute and add filters wherever `businessId` is currently used.

Whenever you add or rename attributes:
1. Update the Appwrite collection schema.
2. Reflect the changes in the client code and TypeScript types (`src/lib/categories.ts`, dashboard/product pages, etc.).
3. Seed or migrate existing data. The script in `src/scripts/migrate-to-businesses.ts` shows how to write one-off migrations using the Appwrite SDK.

## 7. Verification Checklist
- [ ] All collections exist, and environment variables point at the right IDs.
- [ ] You can sign in, switch to your business, and see an empty dashboard instead of errors.
- [ ] Creating a category or product writes the expected fields in Appwrite.
- [ ] `/api/products?businessId=...` returns data without permission errors.
- [ ] Optional: run through the import workflow (`/import-products`) to confirm bulk writes succeed.

With the database in place, you can start tailoring the CMS workflows to match your catalog operations or share a demo environment with the sample data seeded.
