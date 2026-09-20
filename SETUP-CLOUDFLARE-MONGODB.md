# Cloudflare Worker + MongoDB Atlas

Denne version er tilpasset det eksisterende Cloudflare-projekt `workoutprogram`.

## Arkitektur

- React/Vite frontend: Cloudflare Worker static assets
- API: samme Cloudflare Worker under `/api/*`
- Database: MongoDB Atlas
- MongoDB er eneste source of truth for træningsdata

## Cloudflare secrets

I Cloudflare skal følgende secret oprettes:

- `MONGODB_URI` = MongoDB Atlas connection string inkl. databasebruger og password

`MONGODB_DB_NAME` er som standard sat til `workout_program` i `wrangler.jsonc`.

VIGTIGT: Commit aldrig MongoDB URI/password til GitHub.

## MongoDB Atlas

Network Access skal tillade Workerens udgående forbindelse. Den nuværende `0.0.0.0/0` adgang gør dette muligt, men betyder også at databasen er netværksmæssigt tilgængelig fra alle IP'er. Adgang er stadig beskyttet af databasebruger/password. Brug en databasebruger med mindst mulige nødvendige rettigheder.

## Deploy

Cloudflare skal deploye via Wrangler, ikke kun uploade `dist` som statiske filer.

Build command:

    npm run build

Deploy command:

    npx wrangler deploy

Installer command:

    npm ci

Efter deploy skal denne URL returnere JSON med `connected: true`:

    https://workoutprogram.laurapoyner.workers.dev/api/health

## Første start

Hvis databasen er tom, vil frontend seede standardøvelser og standardplaner til MongoDB.

Hvis eksisterende data fra den gamle `db.json` skal bevares, importer dem før du bruger Reset/standard-seeding på den nye produktion.
