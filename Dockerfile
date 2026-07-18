# Fachwerk Laufzeit-Image.
# Node 24 führt TypeScript nativ aus (Type-Stripping): fuer den KERN kein
# Build-Schritt, Quelle = Laufzeit. Nur die UI wird gebaut (ADR-0013) — in
# einer eigenen Stufe, damit die Build-Werkzeuge nicht ins Laufzeit-Image
# gelangen. Konfiguration kommt über Env/Volumes, nie aus dem Image.

# ---- Stufe 1: UI bauen (Vite/Preact) ----------------------------------------
FROM node:24-alpine AS ui
WORKDIR /app
RUN corepack enable
# tsconfig.base.json mitnehmen: ui/tsconfig.json erbt davon (sonst bricht Vite).
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY ui/package.json ui/
RUN pnpm install --frozen-lockfile --filter @fachwerk/ui
COPY ui/ ui/
RUN pnpm --filter @fachwerk/ui build

# ---- Stufe 2: Laufzeit ------------------------------------------------------
FROM node:24-alpine

WORKDIR /app
# tzdata: sonst wirkt TZ=Europe/Berlin nicht (Zeit-Bausteine/Uhr-Dienst).
RUN corepack enable && apk add --no-cache tzdata

# Erst Manifeste (Docker-Layer-Cache), dann Quellen.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY schema/package.json schema/
COPY core/package.json core/
COPY cli/package.json cli/
COPY importer/package.json importer/
COPY drivers/knx/package.json drivers/knx/
COPY drivers/mqtt/package.json drivers/mqtt/
RUN pnpm install --frozen-lockfile --prod

COPY schema/ schema/
COPY core/ core/
COPY cli/ cli/
COPY importer/ importer/
COPY drivers/ drivers/
# Beispiel-Gewerke gehoeren zum Projekt (versioniert mit dem Code) und machen
# den ersten Start ohne Volume moeglich. ECHTE Gewerke kommen weiterhin per
# Volume — Nutzerdaten gehoeren nie ins Image.
COPY examples/ examples/
# Gebaute UI (statisch, wird vom API-Server mit ausgeliefert — ein Port).
COPY --from=ui /app/ui/dist ./ui

# Zustands-Verzeichnis gehört dem Laufzeit-User (Named Volumes erben das).
RUN mkdir -p /daten && chown node:node /daten
# Sinnvolle Defaults IM Image: Zustand nach /daten (sonst EACCES unter /app),
# UI-Verzeichnis dorthin, wo Stufe 1 sie abgelegt hat.
ENV FACHWERK_DATEN_DIR=/daten \
    FACHWERK_UI_DIR=/app/ui

USER node
ENTRYPOINT ["node", "cli/src/main.ts"]
CMD ["version"]
