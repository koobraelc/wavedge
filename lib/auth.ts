import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Resend from "next-auth/providers/resend";
import { UserRepository } from "@/lib/db/user-repository";

export const authConfig: NextAuthConfig = {
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.RESEND_FROM_EMAIL || "noreply@wavedge.io",
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  pages: {
    signIn: "/login",
    verifyRequest: "/login/verify",
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      const userRepo = new UserRepository();
      await userRepo.findOrCreateByEmail(user.email);
      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const userRepo = new UserRepository();
        const dbUser = await userRepo.findByEmail(user.email);
        if (dbUser) {
          token.userId = dbUser.id;
          token.tier = dbUser.tier;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string;
        (session.user as unknown as Record<string, unknown>).tier = token.tier;
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
