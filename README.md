# Rain at the GP

Eén vraag, één antwoord: gaat het regenen tijdens dit F1-raceweekend? Met de regenkans per sessie.

## Hoe het werkt

```
GitHub Actions (elk uur)
  ├─ haalt de F1-kalender op      → Jolpica F1 API (gratis, geen sleutel)
  ├─ haalt de weersverwachting op → Open-Meteo (gratis, geen sleutel)
  ├─ berekent per sessie de hoogste regenkans tijdens dat tijdvak
  ├─ bouwt statische pagina's in dist/
  └─ zet ze online                → Cloudflare Pages
```

Er draait niets bij jou thuis. Er is geen database en geen server.

**Wat er gebouwd wordt**

| Pad | Inhoud |
|---|---|
| `/` | Het eerstvolgende (of huidige) raceweekend |
| `/interlagos/`, `/spa/`, `/zandvoort/` … | Vaste pagina per circuit, voor elk jaar dezelfde URL |
| `/api/next.json` | Data van het huidige weekend (handig voor Home Assistant of socials) |
| `/sitemap.xml`, `/robots.txt` | Voor Google |

Het antwoord staat in de HTML zelf, in de `<title>`, de meta-omschrijving en de JSON-LD (SportsEvent), dus Google kan het lezen. JavaScript zorgt alleen voor de aftelklok, de regenanimatie, de NL/EN-knop en het tonen van tijden in de tijdzone van de bezoeker.

**Regels die je kunt aanpassen** (bovenaan `scripts/build.mjs` en in `src/shared.js`)
- Verwachting zichtbaar vanaf **7 dagen** voor de eerste sessie (`FORECAST_WINDOW_DAYS`).
- Antwoord: **Nee** onder 25%, **Misschien** 25–55%, **Ja** boven 55% (`verdict`).
- Banden: slicks onder 40%, inters 40–70%, wets boven 70% (`tyre`).
- Sessieduur: training/kwalificatie 60 min, sprintkwalificatie 45, race 120 (`SESSION_MIN`).

## Mappen

```
data/circuits.json       URL-naam + tijdzone per circuit (nieuw circuit? voeg hier toe)
src/style.css            Vormgeving
src/shared.js            Teksten (EN/NL) en het opbouwen van de pagina, gedeeld door build en browser
src/app.js               Browser: aftellen, regen, taalwissel, sessie kiezen
scripts/build.mjs        Haalt data op en schrijft dist/
scripts/serve.mjs        Lokale preview
fixtures/races.json      Testkalender voor offline bouwen
.github/workflows/       De uurlijkse taak
```

## Lokaal bekijken (optioneel)

Vereist [Node.js](https://nodejs.org) 20 of nieuwer.

```bash
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
- **GitHub pauzeert uurlijkse taken** in een repository waar 60 dagen geen commit is gedaan. Je krijgt vooraf een mail; klik dan op *Keep workflow enabled*, of doe af en toe een kleine commit.
- **Open-Meteo** is gratis voor niet-commercieel gebruik. Ga je advertenties of affiliate-links plaatsen, neem dan een [Open-Meteo API-abonnement](https://open-meteo.com/en/pricing) en voeg de API-sleutel toe aan `loadWeather` in `scripts/build.mjs`.
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

## Volgende stappen
1. Regenhistorie per circuit ("hoe vaak regende het hier tijdens de race?"), voor zoekverkeer buiten de raceweek.
2. Automatische deelafbeelding (og:image) per pagina met het actuele antwoord.
3. Nederlandse pagina's onder `/nl/` met hreflang.
4. Automatische posts voor socials in de raceweek.
