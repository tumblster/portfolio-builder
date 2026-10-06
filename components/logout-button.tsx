"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  async function logout() {
    setLeaving(true);
    await fetch("/api/session", { method: "DELETE" }).catch(() => undefined);
    router.replace("/acceso");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={leaving}
      className="flex min-h-tap items-center px-2 text-sm font-semibold text-muted underline-offset-4 hover:text-ink hover:underline hover:decoration-accent hover:decoration-2 disabled:opacity-60"
    >
      {leaving ? "Saliendo…" : "Salir"}
    </button>
  );
}
