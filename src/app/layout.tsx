import type { Metadata } from "next";
import { Fraunces, Karla } from "next/font/google";
import { Cabecera } from "@/componentes/cabecera";
import { PieDePagina } from "@/componentes/pie-de-pagina";
import "./globals.css";

/**
 * Fraunces para titulos y Karla para el texto. El contraste entre una serif
 * con caracter y una sans humanista es lo que da el tono calido sin recargar
 * la pantalla: la personalidad vive en los titulos, y el texto corrido se
 * mantiene neutro y legible, que es lo que se lee comparando muchas fichas
 * seguidas desde el movil.
 */
const fuenteTitulo = Fraunces({
  variable: "--fuente-titulo",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const fuenteTexto = Karla({
  variable: "--fuente-texto",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Portal inmobiliario",
  description: "Publica y encuentra propiedades en venta y en arriendo.",
};

/**
 * Un nonce de CSP es, por definicion, distinto en cada peticion: un HTML
 * generado durante el build no puede llevarlo.
 *
 * Sin esto, `next build` prerenderizaba /login, /panel, / y las demas a
 * .next/server/app/*.html y `next start` devolvia ese archivo tal cual
 * (comprobado: el HTML servido era byte a byte identico al del build).
 * app-render -- que es quien lee la CSP de la PETICION y le pone el nonce a
 * los <script> de Next -- no llegaba a ejecutarse. Y como la politica lleva
 * 'strict-dynamic', el navegador ignora 'self': esos <script> sin nonce
 * quedaban bloqueados y la pagina no hidrataba.
 *
 * force-dynamic en el layout raiz se propaga a todos los segmentos de abajo.
 * Se paga el prerender estatico: ese es el precio inevitable de un nonce por
 * peticion, no una limitacion de esta implementacion. Si el SP1 necesita
 * cachear el catalogo publico, la salida no es quitar el nonce sino servir esa
 * ruta con una politica propia sin 'strict-dynamic'.
 */
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${fuenteTitulo.variable} ${fuenteTexto.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Cabecera />
        <div className="flex-1 flex flex-col">{children}</div>
        <PieDePagina />
      </body>
    </html>
  );
}
