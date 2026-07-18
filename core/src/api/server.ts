/**
 * HTTP-Server (P5-2): dünne Transportschicht über `beantworte()` — plus
 * Auslieferung der statischen UI (ADR-0013 U-4: ein Port, ein Prozess).
 * Keine Fremdbibliothek (Null-Dependency-Linie wie KNX/MQTT).
 *
 * Auth (DEV-Niveau): optionales Bearer-Token. Ist FACHWERK_API_TOKEN gesetzt,
 * MUSS jede /api-Anfrage es mitbringen. Volle Scopes: ADR-0009 A-3 / P5-12.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { beantworte, type ApiKontext } from "./handler.ts";

export interface ServerOptionen {
  port: number;
  /** Verzeichnis mit der gebauten UI (optional — fehlt sie, läuft nur /api). */
  uiVerzeichnis?: string;
  /** Wenn gesetzt: Bearer-Token-Pflicht für /api. */
  token?: string;
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

function json(res: ServerResponse, status: number, koerper: unknown): void {
  const text = JSON.stringify(koerper);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(text);
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
    "cache-control": datei.endsWith("index.html") ? "no-store" : "public, max-age=3600",
  });
  createReadStream(datei).pipe(res);
  return true;
}

export class ApiServer {
  readonly #ktx: ApiKontext;
  readonly #opts: ServerOptionen;
  #server: Server | null = null;
  /** Zusätzliche Upgrade-Behandlung (WebSocket, P5-3). */
  #upgrade: ((req: IncomingMessage, socket: import("node:net").Socket) => void) | null = null;

  constructor(ktx: ApiKontext, opts: ServerOptionen) {
    this.#ktx = ktx;
    this.#opts = opts;
  }

  /** Registriert den WebSocket-Handler (P5-3 hängt sich hier ein). */
  setzeUpgrade(fn: (req: IncomingMessage, socket: import("node:net").Socket) => void): void {
    this.#upgrade = fn;
  }

  starte(): Promise<void> {
    const server = createServer((req, res) => this.#behandle(req, res));
    server.on("upgrade", (req, socket) => {
      if (this.#upgrade) this.#upgrade(req, socket as import("node:net").Socket);
      else socket.destroy();
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
        if (this.#opts.token) {
          const auth = req.headers.authorization ?? "";
          if (auth !== `Bearer ${this.#opts.token}`) {
            json(res, 401, { fehler: "Token fehlt oder falsch" });
            return;
          }
        }
        const antwort = beantworte(this.#ktx, req.method ?? "GET", pfad, url.searchParams);
        json(res, antwort.status, antwort.koerper);
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

  stoppe(): void {
    this.#server?.close();
    this.#server = null;
  }
}
