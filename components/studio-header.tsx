import { LandingHeader } from "@/components/landing/landing-chrome";
import { LogoutButton } from "@/components/logout-button";

/** Header del studio con el branding actual (spec 11.10): el de la landing, con "Salir" si hay sesión. */
export function StudioHeader({ showLogout }: { showLogout: boolean }) {
  return (
    <LandingHeader
      base="/"
      nav={
        showLogout ? (
          <nav aria-label="Studio" className="flex items-center">
            <LogoutButton />
          </nav>
        ) : null
      }
    />
  );
}
