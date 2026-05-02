"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/sign-in" })}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors group"
    >
      <LogOut className="h-4 w-4 text-slate-400 group-hover:text-red-500 transition-colors" />
      Sign out
    </button>
  );
}
