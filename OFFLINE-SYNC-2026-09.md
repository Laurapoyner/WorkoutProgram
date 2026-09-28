# Offline-sikker træningsregistrering

Denne version gør almindelig træningsregistrering offline-first.

## Sådan virker det

- Træningsdata gemmes straks lokalt i browserens IndexedDB.
- Hvis IndexedDB ikke er tilgængelig, bruges localStorage som en lille fallback.
- Ændringer lægges i en lokal synkroniseringskø og sendes til MongoDB via Cloudflare, når forbindelsen er tilgængelig.
- Kladder samles, så mange små ændringer ikke giver et API-kald hver gang. Den nyeste version af kladden er den, der synkroniseres.
- Appen viser, når den er offline, og hvor mange ændringer der venter på synkronisering.
- Der er en manuel "Synkroniser nu"-funktion.
- Ved genåbning/fokus hentes seneste serverdata, når lokale ændringer først er synkroniseret.

## Cloudflare-forbrug

Den gamle 12-sekunders polling er fjernet. Appen synkroniserer i stedet ved:

- opstart
- når appen igen bliver synlig
- når internetforbindelsen vender tilbage
- manuel synkronisering
- baggrundssynk af lokale ændringer

Kladder sendes højst samlet efter et interval i stedet for for hvert lille input/timer-tick.

## PDF og billeder

PDF- og billedupload er fortsat online-only. Det er bevidst, fordi disse handlinger er sjældne og tunge. Almindelig træningsregistrering er ikke afhængig af dem.
