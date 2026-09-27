# PDF-import: 503-fix

Denne version gør ExorLive PDF-import mere robust på Cloudflare:

- API-kald prøves automatisk igen ved midlertidige 502/503/504-fejl.
- MongoDB-forbindelsen prøves én ekstra gang ved en kortvarig Atlas-forbindelsesfejl.
- Importdialogen viser hvilken øvelse der er ved at blive gemt, så en eventuel fejl kan lokaliseres.
- Selve PDF-læsningen er uændret; fundne øvelser og billeder beholdes i dialogen ved en gemmefejl.
