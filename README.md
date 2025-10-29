# Express Appwrite CMS

Express Appwrite CMS is a multi-tenant product management console built with Next.js 15, Tailwind CSS, and Appwrite. It provides merchants and teams with tooling to organise catalog data, manage categories, and sync variant-rich products to downstream storefronts and integrations.

## Features
- Multi-business workspaces with role-based access (owner, admin, editor, viewer)
- Product, variant, and category management backed by Appwrite databases
- CSV import tools and variant generation helpers
- Authenticated dashboard with Appwrite email/password sessions
- Public products API for storefront consumption with configurable CORS

## Getting Started

### 1. Clone and install
```bash
git clone https://github.com/your-org/express-appwrite-cms.git
cd express-appwrite-cms
npm install
```

### 2. Configure environment variables
Copy the sample file and update the values with your Appwrite credentials:
```bash
cp .env.example .env.local
```

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_APPWRITE_ENDPOINT` | Appwrite HTTP endpoint, e.g. `https://cloud.appwrite.io/v1` |
| `NEXT_PUBLIC_APPWRITE_PROJECT_ID` | Appwrite project ID |
| `NEXT_PUBLIC_APPWRITE_DATABASE_ID` | Database ID containing CMS collections |
| `NEXT_PUBLIC_APPWRITE_STORAGE_BUCKET_ID` | Storage bucket ID for product media |
| `NEXT_PUBLIC_APPWRITE_COLLECTION_*` | Collection IDs for products, variants, categories, businesses, and memberships |
| `NEXT_PUBLIC_APPWRITE_DEV_KEY` | Optional dev key for local Appwrite emulator usage |
| `APPWRITE_API_KEY` | Service API key if you call Admin APIs from Next.js Route Handlers |
| `PRODUCTS_API_ALLOWED_ORIGINS` | Comma-separated list of origins permitted to consume the public products API |
| `NEXT_PUBLIC_APP_NAME` / `NEXT_PUBLIC_LOGO_URL` / `NEXT_PUBLIC_PRIMARY_COLOR` | Branding overrides for UI surfaces |

> **Tip:** Keep `.env.local` and other secret files out of source control. The repository already ignores `.env*` files except for `.env.example`.

### 3. Appwrite setup checklist
1. Create an Appwrite project and note the project ID.
2. Provision a database with collections for products, product variants, categories, businesses, and business users. Ensure attributes match the expectations in `documentation/database_documentation.md`.
3. Create a storage bucket for product images and enable appropriate permissions.
4. Create an API key with scopes that match your usage (databases, storage, account).
5. (Optional) Configure Appwrite Teams or custom roles if you plan to differentiate permissions further.

### 4. Run the development server
```bash
npm run dev
```
The app becomes available on `http://localhost:3000`.

### 5. Linting and production builds
```bash
npm run lint     # Static analysis
npm run build    # Create an optimized production build
npm run start    # Serve the production build
```

## Project Structure
```
src/
  app/                # Next.js app router pages, layouts, and API routes
  components/         # Reusable UI components
  contexts/           # React context providers
  lib/                # Appwrite client helpers and utility functions
  config/             # Application configuration (branding)
docs/                 # Written guides and reference material
documentation/        # Data modelling documentation
public/               # Static assets and icons
```

## Documentation
- [Project Manual](docs/manual.md)
- [Use Case Guide](docs/use-cases.md)
- [Contributing Guide](docs/CONTRIBUTING.md)
- [Code of Conduct](docs/CODE_OF_CONDUCT.md)
- [Security Policy](docs/SECURITY.md)
- [Support Options](docs/SUPPORT.md)

## Contributing
We welcome community contributions! Please read the [Contributing Guide](docs/CONTRIBUTING.md) for details on our workflow, coding standards, and how to submit a pull request. All contributors are expected to follow our [Code of Conduct](docs/CODE_OF_CONDUCT.md).

## Security
If you discover a security vulnerability, please follow the steps in [SECURITY.md](docs/SECURITY.md). Do not open a public issue for sensitive disclosures.

## Support & Community
- Review [SUPPORT.md](docs/SUPPORT.md) for available help channels.
- File issues and feature requests through GitHub Issues.
- Start a discussion or ask questions by opening a GitHub Discussion topic.

## License
This project is provided under the MIT License. See [LICENSE](LICENSE) for more information.
