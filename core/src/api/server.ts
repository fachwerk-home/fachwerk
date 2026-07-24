/**
 * HTTP-Server (P5-2): dünne Transportschicht über `beantworte()` — plus
 * Auslieferung der statischen UI (ADR-0013 U-4: ein Port, ein Prozess).
 * Keine Fremdbibliothek (Null-Dependency-Linie wie KNX/MQTT).
 *
 * Auth (P5-12, DEV-Niveau, ADR-0009 A-3/A-4): Der Server ist die Stelle, die
 * aus einer nackten HTTP-Anfrage eine `Identitaet` macht — Bearer-Token oder
 * Sitzungs-Cookie. Was diese Identitaet dann DARF, entscheidet allein der
 * Handler anhand der Scopes. Transport und Berechtigung bleiben getrennt.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { ANONYM, type Identitaet } from "./auth.ts";
import { beantworte, type ApiKontext } from "./handler.ts";

/** Was der Server von der Anmeldung braucht (Umsetzung: AuthDienst). */
export interface ServerAuth {
  /** Ist ueberhaupt etwas konfiguriert? Sonst laeuft die API anonym-lesend. */
  readonly aktiv: boolean;
  identifiziere(roh: string | undefined): Identitaet | null;
}

/** Name des Sitzungs-Cookies (HttpOnly — die UI sieht das Token nie). */
export const SITZUNGS_COOKIE = "fachwerk_sitzung";

export interface ServerOptionen {
  port: number;
  /** Verzeichnis mit der gebauten UI (optional — fehlt sie, läuft nur /api). */
  uiVerzeichnis?: string;
  /** Wenn gesetzt: Bearer-Token-Pflicht für /api. */
  token?: string;
  /** Auth-Dienst (P5-12); fehlt er, gilt jede Anfrage als anonym (nur lesend). */
  auth?: ServerAuth;
  /** Cookie mit Secure-Flag ausliefern (nur hinter TLS sinnvoll). */
  cookieSecure?: boolean;
  onMeldung?: (m: string) => void;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

/**
 * Header, die auf JEDER Antwort stehen (P5-12 Haertung). Bewusst KEIN
 * Access-Control-Allow-Origin: UI und API liegen auf derselben Origin, also
 * braucht niemand CORS — und was nicht da ist, kann nicht falsch konfiguriert
 * werden. `frame-ancestors 'none'` (plus das alte X-Frame-Options) verhindert
 * Clickjacking auf Bedienelemente einer Gebaeudesteuerung.
 */
const SICHERHEITS_HEADER: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
};

/**
 * CSP fuer die eigene UI. `style-src` braucht 'unsafe-inline', weil Preact
 * style-Attribute setzt; Skripte kommen ausschliesslich als eigene Dateien.
 * `connect-src` erlaubt zusaetzlich ws:/wss: fuer den Live-Kanal (P5-3).
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' ws: wss:",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

function json(
  res: ServerResponse,
  status: number,
  koerper: unknown,
  extra?: Record<string, string>,
): void {
  const text = JSON.stringify(koerper);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...SICHERHEITS_HEADER,
    ...extra,
  });
  res.end(text);
}

/** Einen benannten Cookie aus dem Cookie-Header ziehen. */
function ausCookie(kopf: string | undefined, name: string): string | undefined {
  if (!kopf) return undefined;
  for (const stueck of kopf.split(";")) {
    const trenner = stueck.indexOf("=");
    if (trenner < 0) continue;
    if (stueck.slice(0, trenner).trim() === name) {
      return decodeURIComponent(stueck.slice(trenner + 1).trim());
    }
  }
  return undefined;
}

/**
 * Rohes Token aus der Anfrage: Bearer-Header hat Vorrang (Agenten), sonst
 * Cookie (Browser — der kann bei WebSockets keine Header setzen).
 */
function rohesToken(req: IncomingMessage): string | undefined {
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) return auth.slice(7);
  return ausCookie(req.headers.cookie, SITZUNGS_COOKIE);
}

/**
 * CSRF-Schutz fuer zustandsaendernde Anfragen: Ein Browser haengt das
 * Sitzungs-Cookie automatisch an — SameSite=Lax deckt den Normalfall ab,
 * aber ein zweiter Riegel kostet nichts. Kommt ein Origin-Header und passt
 * er nicht zum Host, ist die Anfrage fremdgesteuert. Fehlt der Header ganz
 * (curl, Agenten), wird nicht geblockt: die tragen ihr Token bewusst selbst.
 */
function fremdeOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (typeof origin !== "string" || origin === "" || origin === "null") return false;
  const host = req.headers.host;
  if (typeof host !== "string" || host === "") return true;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

/** Statische Datei ausliefern; SPA-Fallback auf index.html. */
function statisch(res: ServerResponse, wurzel: string, pfad: string): boolean {
  // Pfad-Traversal ausschließen: normalisieren und Wurzel erzwingen.
  const rel = normalize(decodeURIComponent(pfad)).replace(/^(\.\.[/\\])+/, "");
  let datei = resolve(join(wurzel, rel === "/" ? "index.html" : rel));
  if (!datei.startsWith(resolve(wurzel))) return false;
  if (!existsSync(datei) || statSync(datei).isDirectory()) {
    const index = resolve(join(wurzel, "index.html")); // SPA-Fallback
    if (!existsSync(index)) return false;
    datei = index;
  }
  res.writeHead(200, {
    "content-type": MIME[extname(datei).toLowerCase()] ?? "application/octet-stream",
    // JEDE HTML-Einstiegsseite ungecacht ausliefern, nicht nur index.html:
    // die Seiten verweisen auf gehashte Bundles. Eine gecachte visu.html zeigt
    // nach einem Update auf Dateinamen, die es nicht mehr gibt.
    "cache-control": datei.endsWith(".html") ? "no-store" : "public, max-age=3600",
    ...SICHERHEITS_HEADER,
    "content-security-policy": CSP,
  });
  createReadStream(datei).pipe(res);
  return true;
}

export class ApiServer {
  readonly #ktx: ApiKontext;
  readonly #opts: ServerOptionen;
  #server: Server | null = null;
  /** Zusätzliche Upgrade-Behandlung (WebSocket, P5-3). */
  #upgrade:
    | ((
        req: IncomingMessage,
        socket: import("node:net").Socket,
        identitaet: Identitaet,
      ) => void)
    | null = null;

  constructor(ktx: ApiKontext, opts: ServerOptionen) {
    this.#ktx = ktx;
    this.#opts = opts;
  }

  /** Registriert den WebSocket-Handler (P5-3 hängt sich hier ein). */
  setzeUpgrade(
    fn: (
      req: IncomingMessage,
      socket: import("node:net").Socket,
      identitaet: Identitaet,
    ) => void,
  ): void {
    this.#upgrade = fn;
  }

  starte(): Promise<void> {
    const server = createServer((req, res) => this.#behandle(req, res));
    server.on("upgrade", (req, socket) => {
      const netz = socket as import("node:net").Socket;
      // Der Live-Kanal ist ein Lesekanal — also braucht er `read` wie jedes
      // GET. Ohne gueltigen Nachweis gibt es kein Upgrade, nur einen Abbruch:
      // ein 401 im WebSocket-Handshake liest ohnehin kein Browser-Client.
      const anfrager = this.#identifiziere(req);
      if (!this.#upgrade || !anfrager || !anfrager.identitaet.scopes.includes("read")) {
        netz.destroy();
        return;
      }
      this.#upgrade(req, netz, anfrager.identitaet);
    });
    this.#server = server;
    return new Promise((resolve_, reject) => {
      server.once("error", reject);
      server.listen(this.#opts.port, () => {
        server.off("error", reject);
        resolve_();
      });
    });
  }

  #behandle(req: IncomingMessage, res: ServerResponse): void {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const pfad = url.pathname;

      if (pfad.startsWith("/api")) {
        const methode = req.method ?? "GET";

        // Fremde Origin darf keine Zustandsaenderung ausloesen (CSRF).
        if (methode !== "GET" && fremdeOrigin(req)) {
          json(res, 403, { fehler: "fremde Origin" });
          return;
        }

        const anfrager = this.#identifiziere(req);
        if (anfrager === null) {
          // Kein gueltiger Nachweis, obwohl Auth scharf ist. Der Login selbst
          // bleibt erreichbar — sonst kaeme man nie an eine Identitaet.
          if (!(methode === "POST" && pfad === "/api/login")) {
            json(res, 401, { fehler: "Anmeldung erforderlich" });
            return;
          }
        }

        if (methode === "GET") {
          const antwort = beantworte(
            this.#ktx,
            methode,
            pfad,
            url.searchParams,
            undefined,
            anfrager ?? undefined,
          );
          json(res, antwort.status, antwort.koerper);
          return;
        }
        // Schreibpfad (P5-8): Body einsammeln, dann dieselbe reine Funktion.
        this.#liesKoerper(req, (fehler, koerper) => {
          if (fehler !== null) {
            json(res, fehler === "zu gross" ? 413 : 400, {
              angenommen: false,
              fehler: fehler === "zu gross" ? "Body zu gross" : "Body ist kein gueltiges JSON",
            });
            return;
          }
          const antwort = beantworte(
            this.#ktx,
            methode,
            pfad,
            url.searchParams,
            koerper,
            anfrager ?? {
              // Login ohne Nachweis: die IP zaehlt trotzdem (Rate-Limit).
              identitaet: ANONYM,
              ...(this.#ip(req) !== undefined ? { ip: this.#ip(req)! } : {}),
            },
          );
          json(res, antwort.status, antwort.koerper, this.#cookieKopf(pfad, antwort));
        });
        return;
      }

      if (this.#opts.uiVerzeichnis && statisch(res, this.#opts.uiVerzeichnis, pfad)) return;

      json(res, 404, {
        fehler: "nicht gefunden",
        hinweis: this.#opts.uiVerzeichnis ? undefined : "UI nicht gebaut — /api/status geht",
      });
    } catch (e) {
      // Ein kaputter Request darf den Dienst nie beenden.
      this.#opts.onMeldung?.(`HTTP-Fehler: ${e instanceof Error ? e.message : String(e)}`);
      if (!res.headersSent) json(res, 500, { fehler: "interner Fehler" });
      else res.end();
    }
  }

  /** Absender-IP (Rate-Limit-Schluessel beim Login). */
  #ip(req: IncomingMessage): string | undefined {
    return req.socket.remoteAddress ?? undefined;
  }

  /**
   * Anfrage → Anfrager. `null` heisst: Auth ist scharf, aber es liegt kein
   * gueltiger Nachweis vor. Ist nichts konfiguriert, gilt jeder als anonym —
   * und anonym kann ausschliesslich lesen.
   */
  #identifiziere(req: IncomingMessage): { identitaet: Identitaet; ip?: string } | null {
    const ip = this.#ip(req);
    const mitIp = (identitaet: Identitaet): { identitaet: Identitaet; ip?: string } => ({
      identitaet,
      ...(ip !== undefined ? { ip } : {}),
    });
    const auth = this.#opts.auth;
    if (auth) {
      if (!auth.aktiv) return mitIp(ANONYM);
      const identitaet = auth.identifiziere(rohesToken(req));
      return identitaet ? mitIp(identitaet) : null;
    }
    // Ohne Auth-Dienst bleibt der alte Weg (P5-2): reines Bearer-Token.
    if (this.#opts.token) {
      const kopf = req.headers.authorization ?? "";
      if (kopf !== `Bearer ${this.#opts.token}`) return null;
      return mitIp({ name: "token", art: "token", scopes: ["read", "operate"] });
    }
    return mitIp(ANONYM);
  }

  /**
   * Nach erfolgreichem Login das Sitzungs-Cookie setzen — HttpOnly, damit
   * kein Skript im Browser es lesen kann, und SameSite=Lax gegen CSRF.
   * `Secure` nur, wenn der Betreiber TLS davor hat: sonst wuerde der Browser
   * das Cookie im normalen LAN-/VPN-Betrieb still verwerfen.
   */
  #cookieKopf(pfad: string, antwort: { status: number; koerper: unknown }): Record<string, string> {
    if (pfad === "/api/logout") {
      return { "set-cookie": `${SITZUNGS_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0` };
    }
    if (pfad !== "/api/login" || antwort.status !== 200) return {};
    const k = antwort.koerper as { token?: unknown; ablauf?: unknown };
    if (typeof k?.token !== "string") return {};
    const maxAge = Math.max(
      0,
      Math.round(((typeof k.ablauf === "number" ? k.ablauf : 0) - Date.now()) / 1000),
    );
    return {
      "set-cookie":
        `${SITZUNGS_COOKIE}=${encodeURIComponent(k.token)}; HttpOnly; SameSite=Lax; Path=/; ` +
        `Max-Age=${maxAge}${this.#opts.cookieSecure ? "; Secure" : ""}`,
    };
  }

  /**
   * Body einsammeln — mit hartem Deckel. Ein Client, der endlos sendet, darf
   * den Speicher nicht auffressen (Prozessgrenze); 64 KB reichen fuer
   * {"wert": …} um Groessenordnungen.
   */
  #liesKoerper(
    req: IncomingMessage,
    fertig: (fehler: "zu gross" | "kaputt" | null, koerper?: unknown) => void,
  ): void {
    const MAX = 64 * 1024;
    let text = "";
    let abgebrochen = false;
    req.setEncoding("utf8");
    req.on("data", (stueck: string) => {
      if (abgebrochen) return;
      text += stueck;
      if (text.length > MAX) {
        abgebrochen = true;
        fertig("zu gross");
        req.destroy();
      }
    });
    req.on("end", () => {
      if (abgebrochen) return;
      try {
        fertig(null, text === "" ? undefined : JSON.parse(text));
      } catch {
        fertig("kaputt");
      }
    });
    req.on("error", () => {
      if (!abgebrochen) {
        abgebrochen = true;
        fertig("kaputt");
      }
    });
  }

  /** Tatsaechlich belegter Port (Tests binden auf 0 und fragen hier nach). */
  get port(): number {
    const adresse = this.#server?.address();
    return typeof adresse === "object" && adresse !== null ? adresse.port : this.#opts.port;
  }

  stoppe(): void {
    this.#server?.close();
    this.#server = null;
  }
}
