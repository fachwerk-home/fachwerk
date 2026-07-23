import { ApiFehler, type IchAntwort, type Scope } from "./api.ts";

export type AuthStatus =
  | { art: "laedt" }
  | { art: "login" }
  | { art: "bereit"; ich: IchAntwort };

export function hatScope(ich: IchAntwort | null, scope: Scope): boolean {
  return ich?.scopes.includes(scope) ?? false;
}

export function authFehlerText(error: unknown): string {
  if (error instanceof ApiFehler && error.status === 401) return "Anmeldung fehlgeschlagen";
  if (error instanceof ApiFehler && error.status === 429) return error.message || "Zu viele Anmeldeversuche. Bitte kurz warten.";
  return error instanceof Error ? error.message : String(error);
}

