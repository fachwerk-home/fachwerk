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

USER node
ENTRYPOINT ["node", "cli/src/main.ts"]
CMD ["version"]
