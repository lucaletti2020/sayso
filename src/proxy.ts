export { auth as proxy } from "@/auth";

export const config = {
  matcher: [
    "/home/:path*",
    "/dashboard/:path*",
    "/scenario/:path*",
  ],
};
