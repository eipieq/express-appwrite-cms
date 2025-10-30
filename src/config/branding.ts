export const BRANDING = {
  name: process.env.NEXT_PUBLIC_APP_NAME ?? "Express Appwrite CMS",
  logo: process.env.NEXT_PUBLIC_LOGO_URL ?? "public/express-appwrite-cms-full-width.svg",
  primaryColor: process.env.NEXT_PUBLIC_PRIMARY_COLOR ?? "#3b82f6",
} as const;

export type BrandingConfig = typeof BRANDING;
