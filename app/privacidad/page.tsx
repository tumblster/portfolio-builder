import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de privacidad · Supercreador",
  description:
    "Cómo Supercreador recoge, usa y protege tus datos: correo, contenido de tu portafolio y métricas de vistas.",
};

/* Página autocontenida con estilos inline: no depende del sistema visual de ninguna rama. */
const page: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f5f5e7",
  padding: "40px 16px",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  color: "#0e110b",
};
const card: React.CSSProperties = {
  maxWidth: 680,
  margin: "0 auto",
  background: "#ffffff",
  border: "2px solid #0e110b",
  borderRadius: 24,
  padding: "32px clamp(20px, 5vw, 44px)",
  boxShadow: "4px 4px 0 0 #0e110b",
};
const h1: React.CSSProperties = { fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", margin: "8px 0 0" };
const eyebrow: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "#3f4236",
};
const updated: React.CSSProperties = { fontSize: 14, color: "#3f4236", marginTop: 8 };
const h2: React.CSSProperties = { fontSize: 19, fontWeight: 800, letterSpacing: "-0.01em", marginTop: 32 };
const p: React.CSSProperties = { fontSize: 15, lineHeight: 1.65, color: "#3f4236", marginTop: 12 };
const ul: React.CSSProperties = {
  fontSize: 15,
  lineHeight: 1.65,
  color: "#3f4236",
  marginTop: 12,
  paddingLeft: 20,
};
const li: React.CSSProperties = { marginBottom: 8 };
const strong: React.CSSProperties = { color: "#0e110b" };
const btn: React.CSSProperties = {
  display: "inline-block",
  marginTop: 32,
  padding: "12px 22px",
  background: "#0e110b",
  color: "#f5f5e7",
  fontWeight: 700,
  borderRadius: 12,
  textDecoration: "none",
  border: "2px solid #0e110b",
  boxShadow: "3px 3px 0 0 #0e110b",
};

export default function PrivacidadPage() {
  return (
    <main style={page}>
      <article style={card}>
        <p style={eyebrow}>Supercreador</p>
        <h1 style={h1}>Política de privacidad</h1>
        <p style={updated}>Última actualización: 2 de octubre de 2026</p>

        <p style={p}>
          Supercreador (en adelante, &ldquo;nosotros&rdquo;) ofrece herramientas para que
          creadoras y creadores de contenido armen su portafolio profesional y lo
          compartan con marcas. Esta política explica, en lenguaje simple, qué
          datos recogemos, para qué los usamos y qué control tienes sobre ellos.
        </p>

        <h2 style={h2}>Qué datos recogemos</h2>
        <ul style={ul}>
          <li style={li}>
            <strong style={strong}>Correo electrónico.</strong> Es tu cuenta: con
            él te enviamos links mágicos de acceso (sin contraseña), avisos sobre
            tu portafolio (por ejemplo, antes de archivarlo por inactividad) y
            celebraciones de hitos de vistas.
          </li>
          <li style={li}>
            <strong style={strong}>Contenido de tu portafolio.</strong> Las fotos,
            videos, textos, nichos y servicios que tú eliges mostrar, incluyendo
            contenido público que importas desde tu Instagram o TikTok.
          </li>
          <li style={li}>
            <strong style={strong}>Métricas de vistas.</strong> Contamos cuántas
            personas ven tu portafolio (una vista por persona al día). No guardamos
            direcciones IP ni identificamos a tus visitantes.
          </li>
          <li style={li}>
            <strong style={strong}>Datos técnicos mínimos.</strong> Las cookies
            estrictamente necesarias para que tu sesión funcione.
          </li>
        </ul>

        <h2 style={h2}>Para qué los usamos</h2>
        <ul style={ul}>
          <li style={li}>Crear, mostrar y mantener tu portafolio en su link público.</li>
          <li style={li}>Darte acceso a tu cuenta mediante links mágicos (nunca te pedimos contraseña).</li>
          <li style={li}>Avisarte de eventos importantes: archivado por inactividad y metas de vistas.</li>
          <li style={li}>Mejorar el producto con estadísticas agregadas y anónimas.</li>
        </ul>
        <p style={p}>
          No vendemos tus datos. No los compartimos con terceros con fines
          publicitarios.
        </p>

        <h2 style={h2}>Tu contenido es público por link</h2>
        <p style={p}>
          Todo lo que pongas en tu portafolio puede verlo cualquier persona que
          tenga el link, porque esa es su función: que las marcas te conozcan. No
          publiques nada que no quieras que sea público. Puedes archivar tu
          portafolio cuando quieras desde tu cuenta.
        </p>

        <h2 style={h2}>Tus derechos</h2>
        <p style={p}>
          Puedes pedirnos en cualquier momento una copia de tus datos, corregirlos
          o eliminarlos por completo (incluido tu portafolio y tu cuenta).
          Escríbenos a{" "}
          <a style={{ color: "#0e110b", fontWeight: 700 }} href="mailto:hola@supercreador.tech">
            hola@supercreador.tech
          </a>{" "}
          y lo resolvemos.
        </p>

        <h2 style={h2}>Eliminación de tus datos</h2>
        <p style={p}>
          Si quieres que borremos todo lo que tenemos sobre ti: escríbenos a{" "}
          <a style={{ color: "#0e110b", fontWeight: 700 }} href="mailto:hola@supercreador.tech">
            hola@supercreador.tech
          </a>{" "}
          con el asunto &ldquo;Eliminar mis datos&rdquo; desde el correo de tu cuenta.
          Borramos tu cuenta, tu(s) portafolio(s) y tu correo de nuestros
          registros. Los portafolios públicos dejan de estar disponibles de
          inmediato.
        </p>

        <h2 style={h2}>Cambios a esta política</h2>
        <p style={p}>
          Si cambiamos algo relevante, actualizaremos esta página e indicaremos la
          nueva fecha arriba.
        </p>

        <Link style={btn} href="/">
          ← Volver al inicio
        </Link>
      </article>
    </main>
  );
}
