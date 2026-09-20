# Nye funktioner – september 2026

Denne version udvider træningssystemet uden at ændre Cloudflare/MongoDB-arkitekturen.

## 1. Flere uafsluttede træninger på samme tid
- Hvert program har sin egen kladde i MongoDB (`draft-<planId>`).
- Du kan skifte til et andet program uden at afslutte det første.
- Uafsluttede pas vises neutralt som kladder og kan fortsættes senere.
- Når et pas afsluttes eller nulstilles, slettes kun kladden for det pågældende program.

## 2. Redigering og oprettelse af øvelser
- Øvelser kan redigeres direkte fra øvelsesbiblioteket.
- Under oprettelse/redigering af et program kan en manglende øvelse oprettes direkte og tilføjes til programmet med det samme.
- Manglende billede vises neutralt i UI i stedet for at få et automatisk anatomibillede.

## 3. To registreringstyper
Standard er fortsat `Sæt / gentagelser / kg`.

Derudover findes `Tid / forsøg / score`, med:
- sekunder pr. runde
- antal runder/forsøg
- pause mellem runder
- valgfri score-enhed (fx cm, hop, fejl)
- score pr. runde
- score pr. venstre/højre side
- mulighed for at markere at lavere score er bedst
- historik og LSI/symmetri-graf

## 4. ACL LSI-testprotokol + historiske resultater
Ved første opstart efter deployment kaldes en idempotent engangsmigration (`/api/migrations/rehab-2026`). Den:
- opretter de fem LSI-testøvelser
- opretter programmet `ACL Return-to-Sport LSI Testprotokol`
- indsætter de historiske testserier 11-12-2025, 25-03-2026 og 20-05-2026
- opdaterer de 12 eksisterende ExorLive-øvelser med illustrationer fra den vedhæftede PDF

Migrationen gemmer et migrations-id i MongoDB, så data ikke indsættes igen ved hver opstart.

## 5. ExorLive PDF-import
I programeditoren findes `Importer ExorLive PDF`.

Importen forsøger at:
- finde nummererede øvelser
- læse navn, beskrivelse, sæt, gentagelser og evt. vægt
- udtrække/beskære øvelsesillustrationen fra PDF-siden
- genbruge en eksisterende øvelse med samme navn eller oprette en ny i biblioteket
- oprette et samlet træningsprogram med øvelserne

Den importerede plan og øvelser kan redigeres normalt bagefter.

## Deployment
Cloudflare:
- Build command: `bun run build`
- Deploy command: `npx wrangler deploy`
- Secret: `MONGODB_URI`
- Variable: `MONGODB_DB_NAME=workout_program`

Efter deployment: åbn appen én gang. `StorageService.init()` sørger for engangsmigrationen.

## Privatliv
Appens API har på nuværende tidspunkt ikke bruger-login/adgangskontrol i koden. Hvis `workers.dev`-adressen er offentligt tilgængelig, kan personlige trænings-/rehabdata potentielt hentes via API'et. Til personlige historiske data bør Worker'en beskyttes med login eller Cloudflare Access.
