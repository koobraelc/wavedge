export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/settings/:path*",
    "/billing/:path*",
    "/admin/:path*",
    "/api/alerts/:path*",
    "/api/digest/:path*",
    "/api/admin/:path*",
  ],
};
