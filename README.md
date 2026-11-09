# Rain at the GP

Eén vraag, één antwoord: gaat het regenen tijdens dit F1-raceweekend? Met de regenkans per sessie, en na afloop wat er echt gebeurde.

## Hoe het werkt

```
GitHub Actions (elk uur)
  ├─ F1-kalender                  → Jolpica F1 API
  ├─ weersverwachting per uur     → Open-Meteo
  ├─ uitkomst na elke sessie      → F1-weerstation op het circuit (live timing), anders het dichtstbijzijnde vliegveld (METAR)
  ├─ slaat verwachting + uitkomst op in data/history/  (commit in de repository)
  ├─ bouwt pagina's in 3 talen + deelafbeeldingen in dist/
  └─ zet alles online             → Cloudflare Pages
```

Er draait niets bij jou thuis. Er is geen database en geen server.

**Wat er gebouwd wordt**

| Pad | Inhoud |
|---|---|
| `/`, `/nl/`, `/es/` | Het huidige of eerstvolgende raceweekend |
| `/interlagos/`, `/nl/spa/`, `/es/zandvoort/` … | Vaste pagina per circuit en taal, elk jaar dezelfde URL |
| `/track-record/` (+ `/nl/`, `/es/`) | Hoe vaak de verwachting klopte |
| `/og/*.png` | Deelafbeelding per pagina en taal (voorvertoning in WhatsApp, X, Reddit…) |
| `/api/next.json` | Data van het huidige weekend (voor Home Assistant of socials) |
| `/sitemap.xml`, `/robots.txt` | Voor Google, met verwijzingen tussen de talen (hreflang) |

Het antwoord staat in de HTML zelf, in de `<title>`, de meta-omschrijving en de JSON-LD (SportsEvent), dus Google kan het lezen. JavaScript zorgt alleen voor de aftelklok, de regenanimatie, het kiezen van een sessie en het tonen van tijden in de tijdzone van de bezoeker.

**Regels die je kunt aanpassen** (`scripts/lib/config.mjs` en `src/shared.js`)
- Verwachting zichtbaar vanaf **7 dagen** voor de eerste sessie (`FORECAST_WINDOW_DAYS`).
- Antwoord: **Nee** onder 25%, **Misschien** 25–55%, **Ja** boven 55% (`verdict`).
- Banden: slicks onder 40%, inters 40–70%, wets boven 70% (`tyre`).
- Sessieduur: training/kwalificatie 60 min, sprintkwalificatie 45, race 120 (`SESSION_MIN`).

## Na afloop: uitkomst

Zodra een sessie voorbij is, toont de site wat er gebeurde: **Nat** of **Droog**, met de verwachting erbij.

**Nat = minstens 3 coureurs reden in die sessie op intermediates of regenbanden.** Dat komt uit de timingdata van de sessie zelf, via **OpenF1** (api.openf1.org, vanaf 2023), meestal binnen een à twee uur na afloop. Mat de sensor op het circuit wel regen maar bleef iedereen op slicks, dan telt de sessie als droog, met de vermelding "lichte regen gemeten, op slicks gereden".

Vliegveldmeldingen (METAR) dienen alleen als voorlopige indicatie ("Uitslag volgt… Voorlopig: vliegveld Congonhas meldde geen regen"). Ze tellen nergens mee. De zichtbare regengeschiedenis begint daarom in 2023.

### Handmatige correcties en uitgestelde sessies: `data/overrides.json`

```json
{
  "2025-interlagos": { "S": { "wet": true } },
  "2026-interlagos": { "Q": { "start": "2026-11-08T10:30:00Z" } }
}
```

- Sleutel = seizoen + circuit (de URL-naam), daarbinnen de sessie (`FP1`, `FP2`, `FP3`, `SQ`, `S`, `Q`, `R`).
- `"wet": true/false` overschrijft de gemeten uitkomst. De site vermeldt dan "handmatig gecorrigeerd".
- `"start"` (en eventueel `"end"`), in **UTC**, verplaatst een sessie, bijvoorbeeld als de kwalificatie naar zondag gaat. Na de volgende build (of *Run workflow*) kloppen de aftelklok, de radar en de verwachting voor het nieuwe tijdstip.

Een kortere vertraging hoef je niet in te voeren: de radar blijft na de geplande eindtijd zichtbaar tot de uitslag bevestigd is (maximaal 3 uur), en de sessie toont "Uitslag volgt". OpenF1 vindt ook uitgestelde sessies zelf terug.

## Live buienradar

Van 30 minuten vóór tot 15 minuten na elke sessie staat er onder het antwoord een kaart van het circuit met de buien van de afgelopen 2 uur (stappen van 10 minuten). Alles laadt in de browser van de bezoeker.

- **Bron:** [LibreWXR](https://github.com/JoshuaKimsey/LibreWXR), publieke server, data onder CC BY 4.0. Echte radar in Europa, Noord-Amerika, Japan en Zuidoost-Azië; elders een satellietschatting. Per circuit staat in `data/circuits.json` of er radar is (`radar: true/false`); bij `false` vermeldt de site dat het een satellietschatting is.
- **Achtergrondkaart:** OpenStreetMap, donker gemaakt met CSS, met bronvermelding. Alleen tijdens sessies geladen, dus licht gebruik.
- **Overstappen naar RainViewer:** pas in `src/app.js` bij `RADAR` het adres aan en zet `maxZoom` op 7. Let op: RainViewer is gratis alleen voor persoonlijk en educatief gebruik.
- **Testen buiten een sessie:** zet `?radar=1` achter een pagina, bijvoorbeeld `rainatthegp.com/nl/?radar=1`. Dat werkt alleen tijdens een raceweekend.

## Historie en trackrecord

- Per raceweekend komt er een bestand in `data/history/`, met per sessie de laatste verwachting van vóór de start en de uitkomst. De workflow slaat dit zelf op.
- Elke circuitpagina toont de **regengeschiedenis** van dat circuit, alleen met bevestigde sessies.
- Het **trackrecord** is intern. Je vindt het bij elke run van *Build & deploy*: open de run en kijk onder **Summary**. Daar staat een tabel voor races + sprints en voor alle sessies. Wil je het later weer openbaar maken, zet dan `PUBLIC_TRACK_RECORD` in `scripts/lib/config.mjs` op `true`. Dan telt alleen `TRACK_RECORD_SESSIONS` (race en sprint).

**Uitslagen.** Na elke sessie haalt de build de volledige uitslag op (OpenF1). Voor eerdere weekenden: zet bij de backfill het vinkje *results* aan. Dan komen de uitslagen van kwalificatie, sprintkwalificatie, sprint en race erbij (vanaf 2023).

**Oude seizoenen ophalen.** *Actions* → **Backfill rain history** → *Run workflow* (vanaf 2023, met *upgrade* aan). Daarna start hij zelf een nieuwe build.

## Mappen

```
data/circuits.json       URL-naam, tijdzone en weerstation per circuit
data/names.json          Namen van GP's en landen in NL en ES
data/history/            Verwachting + uitkomst per sessie (automatisch)
data/overrides.json      Handmatige correcties en verplaatste sessies
src/style.css            Vormgeving
src/shared.js            Teksten (EN/NL/ES) en opbouw van de pagina, gedeeld door build en browser
src/app.js               Browser: aftellen, regen, sessie kiezen
scripts/build.mjs        Hoofdscript: haalt data op en schrijft dist/
scripts/backfill.mjs     Eenmalig: oude seizoenen ophalen
scripts/lib/             Bronnen, historie, pagina's, vertalingen, deelafbeeldingen
scripts/serve.mjs        Lokale preview
fixtures/races.json      Testkalender voor offline bouwen
.github/workflows/       deploy.yml (elk uur) en backfill.yml (handmatig)
```

## Lokaal bekijken (optioneel)

Vereist [Node.js](https://nodejs.org) 20 of nieuwer.

```bash
npm ci                 # eenmalig: installeert de onderdelen voor de deelafbeeldingen
npm run build          # met echte data
npm run preview        # open http://localhost:8080
```

Zonder internet of om iets te testen: `npm run build:offline` (nepweer, testkalender).
Een ander moment simuleren: `NOW=2026-11-07T17:00:00Z npm run build:offline` (in PowerShell: `$env:NOW="2026-11-07T17:00:00Z"; npm run build:offline`).

---

## Live zetten, stap voor stap

Reken op ongeveer een half uur. Kosten: alleen het domein (~$10 per jaar).

### 1. Domein kopen bij Cloudflare
1. Maak een account op [dash.cloudflare.com](https://dash.cloudflare.com).
2. Ga naar **Domain Registration → Register Domains** en zoek `rainatthegp.com`.
3. Koop het. Het domein staat daarna meteen in je Cloudflare-account; aan DNS hoef je niets te doen.

Gebruik geen "F1" of "Formula 1" in de domeinnaam: dat zijn beschermde merken.

### 2. Code op GitHub zetten
1. Maak een account op [github.com](https://github.com) als je dat nog niet hebt.
2. Maak een nieuwe repository, bijvoorbeeld `rainatthegp`. Kies **Public**: dan zijn de minuten voor GitHub Actions gratis en onbeperkt. (Private kan ook, met 2.000 gratis minuten per maand; dit project gebruikt er ongeveer 500.)
3. Upload de inhoud van deze map. Het makkelijkst met [GitHub Desktop](https://desktop.github.com): *Add local repository* → deze map → *Publish*.
   Of via de website: *Add file → Upload files* en sleep alles erin. De map `.github` moet mee; zet in Verkenner *Verborgen items* aan als je hem niet ziet.

### 3. Cloudflare Pages-project maken
1. In Cloudflare: **Workers & Pages → Create → Pages → Upload assets** (dus níét "Connect to Git": GitHub doet het bouwen).
2. Projectnaam: `rainatthegp`. Dit moet exact overeenkomen met `--project-name` in `.github/workflows/deploy.yml`.
3. Upload eenmalig iets kleins, bijvoorbeeld de map `fixtures`, zodat het project bestaat. Dit wordt bij de eerste echte deploy overschreven.
4. Open het project → **Custom domains → Set up a custom domain** → `rainatthegp.com`. Doe hetzelfde voor `www.rainatthegp.com` als je dat wilt.

### 4. GitHub toegang geven tot Cloudflare
1. Cloudflare: **My Profile → API Tokens → Create Token → Custom token**.
   - Permission: **Account → Cloudflare Pages → Edit**
   - Account Resources: je eigen account
   - Kopieer de token (je ziet hem maar één keer).
2. Je **Account ID** vind je in Cloudflare onder **Workers & Pages**, in de rechterkolom.
3. GitHub-repository: **Settings → Secrets and variables → Actions**
   - *Secrets* → **New repository secret**: `CLOUDFLARE_API_TOKEN` = de token
   - *Secrets* → **New repository secret**: `CLOUDFLARE_ACCOUNT_ID` = het Account ID
   - *Variables* → **New repository variable**: `SITE_URL` = `https://rainatthegp.com` (alleen nodig als je een ander domein kiest)

### 5. Eerste keer draaien
1. GitHub: tab **Actions** → **Build & deploy** → **Run workflow**.
2. Na ongeveer een minuut is hij groen en staat de site live. Daarna draait hij elk uur vanzelf.
3. Gaat iets mis? Klik op de rode run, de foutmelding staat bij de stap die faalde. Als de weer- of kalender-API even niet bereikbaar is, faalt de build en blijft de vorige versie gewoon online.

### 6. Google laten weten dat de site bestaat
1. Ga naar [Google Search Console](https://search.google.com/search-console) → *Add property* → **Domain** → `rainatthegp.com`.
2. Verifieer via DNS: Cloudflare kan dat met één klik.
3. Onder **Sitemaps**: dien `sitemap.xml` in.

## Goed om te weten
- **GitHub pauzeert uurlijkse taken** in een repository waar 60 dagen geen commit is gedaan. Tijdens het seizoen gebeurt dat niet, want de historie wordt elk raceweekend opgeslagen. In de winterstop wel: je krijgt dan vooraf een mail, klik op *Keep workflow enabled*.
- **Open-Meteo** is gratis voor niet-commercieel gebruik. Ga je advertenties of affiliate-links plaatsen, neem dan een [Open-Meteo API-abonnement](https://open-meteo.com/en/pricing) en voeg de API-sleutel toe aan `loadWeather` in `scripts/lib/sources.mjs`.
- De bronvermelding (Open-Meteo, CC BY 4.0) staat onderaan elke pagina. Laat die staan.

## Home Assistant (optioneel)
De site levert `https://rainatthegp.com/api/next.json`. In `configuration.yaml`:

```yaml
rest:
  - resource: https://rainatthegp.com/api/next.json
    scan_interval: 1800
    sensor:
      - name: "GP regenkans"
        value_template: "{{ value_json.maxRain }}"
        unit_of_measurement: "%"
      - name: "GP regen antwoord"
        value_template: "{{ value_json.verdict }}"
```

Daarna kun je een automatisering maken die je een melding stuurt als de regenkans boven de 50% komt.

## Bezoekers meten
Zet **Cloudflare Web Analytics** aan: Cloudflare → *Workers & Pages* → **rainatthegp** → *Metrics* (of *Settings*) → **Web Analytics → Enable**. Gratis, zonder cookies (dus geen cookiebanner nodig), en Cloudflare voegt het script zelf toe. Google Search Console blijft de plek voor zoekwoorden en posities.

## Volgende stappen
1. Automatische posts op Bluesky in de raceweek.
2. Embed-badge voor fansites ("Regen bij de GP? 62%").
