# Fix: MongoDB requests hang in Cloudflare Workers

Denne version åbner en MongoDB-forbindelse pr. API-request og lukker den igen bagefter.

Årsag: Genbrug af en MongoClient/connection pool på tværs af Cloudflare Worker requests kan efterlade sockets bundet til en tidligere request-context. Det kan give Cloudflare-fejlen "The script will never generate a response".

## Deploy

1. Erstat filerne i GitHub med denne version.
2. Lad Cloudflare bygge med `bun run build`.
3. Deploy med `npx wrangler deploy`.
4. Behold secrets/variables:
   - `MONGODB_URI` som Secret
   - `MONGODB_DB_NAME=workout_program`
5. Test `/api/health`, `/api/exercises` og derefter gemning af en udført øvelse.

Bemærk: Denne løsning prioriterer stabilitet over maksimal performance. Hvis appen senere får mange brugere, kan backend-arkitekturen optimeres yderligere.
