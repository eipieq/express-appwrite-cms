const rawLogo = process.env.NEXT_PUBLIC_LOGO_URL ?? "/express-appwrite-cms-full-width.svg";
const resolvedLogo =
  rawLogo.startsWith("http://") ||
  rawLogo.startsWith("https://") ||
  rawLogo.startsWith("/")
    ? rawLogo
    : `/${rawLogo.replace(/^\/+/, "")}`;

export const BRANDING = {
  name: process.env.NEXT_PUBLIC_APP_NAME ?? "Express Appwrite CMS",
  logo: resolvedLogo,
  primaryColor: process.env.NEXT_PUBLIC_PRIMARY_COLOR ?? "#3b82f6",
} as const;

export type BrandingConfig = typeof BRANDING;
