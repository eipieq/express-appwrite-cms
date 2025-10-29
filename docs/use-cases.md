# Express Appwrite CMS – Use Case Guide

## Overview
Express Appwrite CMS is a multi-tenant content management interface for merchants who sell products online.  
It integrates with Appwrite for authentication, database, and storage services, and provides tooling for teams to create, organize, and distribute product data.

## Personas
- **Business Owner**  
  Creates the workspace, manages the content, invites teammates, and controls billing (if applicable).

- **Content Manager (Admin/Editor)**  
  Maintains product records, categories, and pricing. Oversees CSV imports and variant configuration.

- **Collaborator (Viewer)**  
  Reviews content details, exports data, and provides feedback, but cannot modify sensitive fields.

- **Developer / Integration Partner**  
  Consumes the `/api/products` endpoint to power storefronts, mobile apps, or third-party integrations.

## Core Flows
### Workspace Provisioning
1. User signs up via Appwrite and logs into Express Appwrite CMS.
2. If no businesses exist, onboarding prompts them to create one.
3. Business metadata (name, address, WhatsApp number, logo) is stored in the `businesses` collection.

### Team Management
1. Owners/admins invite collaborators by Appwrite `userId`.
2. Roles (owner/admin/editor/viewer) define access to mutating actions.
3. Memberships are persisted in the `business_users` collection.

### Content Operations
1. **Add Product**: create base product record, assign category, upload images, generate variants.
2. **Edit Product**: verify ownership, update content, sync variants, handle media changes.
3. **Bulk Import**: validate CSV structure, propose categories, rate-limit writes to Appwrite.
4. **Category Management**: create hierarchical categories, assign images, control ordering.

### API Distribution
1. External clients call `/api/products?businessId=...`.
2. Endpoint returns product, category metadata, and variants formatted for storefront consumption.

## Data Model Snapshot
| Collection | Key Fields | Notes |
|------------|------------|-------|
| `businesses` | `ownerId`, `name`, `slug`, `whatsappNumber`, `address`, `logo`, `settings` | One record per business workspace |
| `business_users` | `businessId`, `userId`, `role`, `invitedBy` | Links Appwrite users to businesses |
| `products` | `businessId`, `userId`, `name`, `description`, `category`, `basePrice`, `images`, `hasVariants` | `userId` captures creator |
| `product_variants` | `businessId`, `productId`, `userId`, `variantName`, `attributes`, `price`, `sku`, `enabled` | Stored per variant combination |
| `categories` | `businessId`, `name`, `slug`, `description`, `image`, `parentId`, `sortOrder` | Supports nested hierarchy |

## Permission Model
- **Owner**: Full access, can delete business, manage team, promote/demote members.
- **Admin**: Manage content and team (except deleting the business).
- **Editor**: Manage content content, but no team or destructive business actions.
- **Viewer**: Read-only access.

## Deployment Scenarios
- **Cloud (Vercel + Appwrite Cloud)** – default setup with `.env` referencing Appwrite endpoint and project ID.
- **Self-Hosted** – Appwrite on-prem or containerized; update environment variables and storage/CDN settings accordingly.

## Extensibility Hooks
- **Additional Integrations**: Extend `/api/products` or introduce webhooks for downstream services.
- **Custom Roles**: Adjust `ROLE_LABELS` and permissions checks once Appwrite permissions are updated.
- **Plugins / Modules**: Build additional pages (e.g., pricing tiers, marketing assets) leveraging the Business context.

## Future Enhancements
- Email-based invite flow (tokenized acceptance).
- Automated ACL provisioning when documents are created.
- End-to-end tests covering multi-business switching and role enforcement.

Use this guide when communicating Express Appwrite CMS’s capabilities to collaborators, onboarding contributors, or planning roadmap work. It summarises who the system serves, what they can do, and how the data model supports those flows.
