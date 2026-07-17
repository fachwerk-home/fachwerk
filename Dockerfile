# Fachwerk Laufzeit-Image — Walking Skeleton (Phase 3).
# Node 24 führt TypeScript nativ aus (Type-Stripping): kein Build-Schritt,
# Quelle = Laufzeit. Konfiguration kommt über Env/Volumes, nie aus dem Image.
FROM node:24-alpine

WORKDIR /app
RUN corepack enable

# Erst Manifeste (Docker-Layer-Cache), dann Quellen.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY schema/package.json schema/
COPY core/package.json core/
COPY cli/package.json cli/
COPY drivers/knx/package.json drivers/knx/
RUN pnpm install --frozen-lockfile --prod

COPY schema/ schema/
COPY core/ core/
COPY cli/ cli/
COPY drivers/ drivers/
# Beispiel-Gewerke gehoeren zum Projekt (versioniert mit dem Code) und machen
# den ersten Start ohne Volume moeglich. ECHTE Gewerke kommen weiterhin per
# Volume — Nutzerdaten gehoeren nie ins Image.
COPY examples/ examples/

# Zustands-Verzeichnis gehört dem Laufzeit-User (Named Volumes erben das).
RUN mkdir -p /daten && chown node:node /daten
# Sinnvoller Default IM Image: sonst landet der Zustand in ./daten unter /app,
# das dem node-User nicht gehört (EACCES). Per Env überschreibbar.
ENV FACHWERK_DATEN_DIR=/daten

USER node
ENTRYPOINT ["node", "cli/src/main.ts"]
CMD ["version"]
