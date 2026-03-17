import createMiddleware from "next-intl/middleware";
import { locales, defaultLocale } from "@/i18n/config";

export default createMiddleware({
  locales,
  defaultLocale,
  localePrefix: "always",
});

export const config = {
  matcher: [
    // Match all pathnames except API routes, Next.js internals, and static files
    "/((?!api|_next|.*\\..*).*)",
  ],
};
