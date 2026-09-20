# Fælles database – opsætning

Projektet er ændret, så MongoDB Atlas er **den eneste database** for øvelser, planer, logs, afsluttede træninger, aktiv træning og uploadede billeder.

## Hvad er ændret?

- `data/db.json` bruges ikke længere som fallback.
- IndexedDB/localStorage bruges ikke længere som alternativ database.
- Hvis MongoDB ikke kan nås, viser API'et en fejl i stedet for at gemme en separat lokal kopi.
- Alle enheder, der bruger samme deployment, læser og skriver derfor til samme MongoDB-database.
- Billeder gemmes også i MongoDB, så de ikke afhænger af en lokal serverdisk.

## Miljøvariabler

På den server/Worker der kører API'et skal disse være sat:

- `MONGODB_URI` – MongoDB Atlas connection string.
- `MONGODB_DB_NAME` – anbefalet: `workout_program`.

`MONGODB_URI` må aldrig ligge i frontend-kode eller pushes til GitHub.

## Det mangler fra dig før produktion kan færdiggøres

1. **Cloudflare-type**
   - Screenshot af Cloudflare-projektets Overview/Settings, så det kan afgøres om det er Pages eller Workers.
   - Gerne også Build settings (build command + output directory).

2. **MongoDB Atlas**
   - Screenshot af Atlas > Database/Clusters (uden password).
   - Screenshot af Atlas > Network Access.
   - Bekræft database-navnet du ønsker. Standard i koden er `workout_program`.

3. **Connection string**
   - Du behøver ikke sende database-password i chatten.
   - Connection string skal sættes som en secret/environment variable i Cloudflare.
   - Hvis du vil have hjælp trin-for-trin, send screenshot fra Atlas' “Connect > Drivers” hvor password kan være skjult.

4. **Nuværende data**
   - Beslut om de data, der ligger i `data/db.json` i den gamle version, skal importeres til MongoDB én gang.
   - Hvis ja, behold filen indtil migrationen er bekræftet. Den nye kode bruger den ikke automatisk.

5. **Adgang/login**
   - Beslut om systemet kun skal bruges af én person/familie, eller om flere brugere senere skal have hver deres data.
   - Ved flere separate brugere bør næste trin være login + `userId` på alle dokumenter.

## Test efter deployment

1. Åbn `/api/db-status` på den deployede adresse.
2. Den skal vise `type: mongodb` og `connected: true`.
3. Opret en testøvelse på computer.
4. Åbn appen på telefonen og bekræft, at den samme øvelse vises.
5. Redigér/slet fra den anden enhed og kontrollér, at ændringen kommer tilbage på computer.


## Vigtigt om den medfølgende ZIP

Den oprindelige `.env` er bevidst fjernet fra den nye ZIP, så secrets ikke bliver delt eller committed ved en fejl. Brug `.env.example` lokalt, og sæt de rigtige værdier som secrets/environment variables i hostingmiljøet.

Den gamle `data/db.json` er gemt som `_migration_backup/old-db.json`. Den bruges ikke af appen, men kan bruges til en engangsimport, hvis de gamle data skal bevares.
