# TenderScout

Ein statisches Ausschreibungsdashboard für **ntz619/tenderscout** mit einem separaten, nur lesenden Cloudflare Worker für die n8n Cloud Data Table.

## Enthalten

- Tabelle mit Short Summary, Prozentbewertung, Bewerbungsfrist und Quelllink; alle weiteren Felder in der Detailansicht.
- Standardmäßig absteigend nach `relevance_likelihood_percent` sortiert.
- Feste linke Filterleiste: Volltext, Ampel, Mindest-Relevanz, Frist, Status, Quelle und n8n-Bewertungslabel.
- Zwei Regler für die Ampel: **Rot < 50 %, Gelb ≥ 50 und < 70 %, Grün ≥ 70 %**. Änderungen werden lokal gespeichert und wirken sofort auf Farben, Zähler und Filter. Das Quellfeld `ampel` wird niemals zur Einstufung verwendet; der Worker liefert es nicht aus.
- Unbewertete oder ungültige Prozentwerte werden separat angezeigt und ans Ende sortiert.
- CSV-Import (UTF-8 und Windows-1252), Export der gefilterten Auswahl, Pagination, mobile Ansicht.
- Live-Aktualisierung alle 5 Minuten bei geöffnetem, sichtbarem Dashboard; manueller Refresh.
- Fehler werden sichtbar angezeigt, der letzte geladene Stand bleibt erhalten. Kein stiller Wechsel zu Beispieldaten bei Live-Fehlern.

## Architektur

```text
Browser → GitHub Pages (docs/)
        → Cloudflare Worker /api/tenders
          → n8n Public API → Data Table
```

GitHub Pages hostet die Oberfläche. Die serverseitige Function läuft als eigenständiger Cloudflare Worker, weil GitHub Pages keine Functions ausführt. Der n8n-API-Schlüssel liegt nur als Cloudflare-Secret vor. Ein separater, nur für dieses Dashboard geltender Zugangscode schützt die Lese-API; CORS alleine wäre kein Zugriffsschutz. Der Code wird im Dashboard eingegeben und nur im sessionStorage dieses Browser-Tabs gespeichert. Es gibt keine Schreib-, Update- oder Löschrouten.

Die bereitgestellte `docs/sample-data.json` enthält die zwölf Einträge der gelieferten CSV einschließlich der Begründungen. Diese Datei ist auf der veröffentlichten Website und im öffentlichen Repository öffentlich lesbar. Lokale CSV-Importe werden ausschließlich im Browser verarbeitet und nicht hochgeladen. Live-Daten werden vom Worker mit `Cache-Control: no-store` geliefert.

## Bereits eingetragene n8n-Verbindung

| Einstellung | Wert |
| --- | --- |
| Instanz | `https://tenderautomation.app.n8n.cloud` |
| Data Table | `nSw53udgNius49RS` |
| Projekt | `V5Bw7SyNLptfnXjC` |
| Vorhandener Bewertungsworkflow | `NaUpkSwN8iEJie29` (wird nicht verändert) |
| Lesender Endpunkt | `/api/v1/data-tables/nSw53udgNius49RS/rows` |

Die öffentliche Data-Table-API muss in deiner n8n-Version und deinem Tarif verfügbar sein. Der Worker nutzt Cursor-Pagination mit jeweils 250 Zeilen. Bei mehr als 10.000 Zeilen oder API-Fehlern wird eine Fehlermeldung statt einer unvollständigen Tabelle zurückgegeben. Es wird nicht dedupliziert: jede n8n-Zeile bleibt als eigener Datensatz erhalten.

## 1. GitHub Pages

Repository **Settings → Pages → Build and deployment**:

- Einfacher Weg: **Deploy from a branch**, Branch `main`, Ordner **`/docs`**, **Save**.
- Alternativ: Source **GitHub Actions** wählen und den mitgelieferten Workflow `Deploy dashboard to GitHub Pages` manuell ausführen. Dieser veröffentlicht ausschließlich `docs/`.

Geplante URL: **https://ntz619.github.io/tenderscout/**. Erst ein erfolgreiches Pages-Deployment bestätigt die Veröffentlichung.

## 2. Cloudflare Worker einrichten

### Ohne lokale Installation im Cloudflare-Dashboard

1. **Workers & Pages → Create application → Worker** öffnen und einen Worker namens `tenderscout-api` erstellen. Ein Hello-World-Starter genügt.
2. **Edit code** öffnen. Den Inhalt von `worker/index.js` als Worker-Code einsetzen und deployen (ES-Module-Format mit `export default`).
3. In **Settings → Variables and Secrets** die folgenden Variablen hinterlegen:

| Typ | Name | Wert |
| --- | --- | --- |
| Variable | `N8N_BASE_URL` | `https://tenderautomation.app.n8n.cloud` |
| Variable | `N8N_TABLE_ID` | `nSw53udgNius49RS` |
| Variable | `ALLOWED_ORIGINS` | `https://ntz619.github.io` |
| Secret | `N8N_API_KEY` | Dein n8n-API-Schlüssel |
| Secret | `DASHBOARD_TOKEN` | Separater zufälliger Zugangscode mit mindestens 32 Zeichen |

4. Änderungen deployen. Die Worker-URL sieht etwa so aus: `https://tenderscout-api.<deine-subdomain>.workers.dev`.
5. Im TenderScout-Dashboard **Datenquelle** öffnen, Worker-URL und **DASHBOARD_TOKEN** eingeben. Niemals den n8n-API-Schlüssel im Dashboard eingeben.

Den n8n-API-Schlüssel erstellst du im n8n-Editor unter **Settings → n8n API**. Nutze nach Möglichkeit einen auf das Lesen der Data Table beschränkten Schlüssel und ein Ablaufdatum. API-Schlüssel, Cloudflare-Tokens und der Dashboard-Zugangscode gehören nicht ins GitHub-Repository.

### Alternativ mit Wrangler

Im Projektordner:

```powershell
npm install
npx wrangler login
npx wrangler secret put N8N_API_KEY --config worker/wrangler.jsonc
npx wrangler secret put DASHBOARD_TOKEN --config worker/wrangler.jsonc
npm run worker:deploy
```

Die `secret put`-Befehle fragen die Werte verdeckt ab. Ein Dashboard-Token kann beispielsweise in einem Passwortmanager erzeugt werden (mindestens 32 zufällige Zeichen). `worker/wrangler.jsonc` ist bereits auf diese n8n-Tabelle und die GitHub-Pages-Origin eingestellt. Die zusätzlich erlaubten localhost-Origins können vor der produktiven Bereitstellung entfernt werden.

Für eine feste Worker-URL im Dashboard `docs/config.js` bearbeiten: `workerUrl: 'https://…workers.dev'`. Dieses Feld ist öffentlich und darf nur die URL enthalten. Alternativ merkt sich jeder Browser die unter Datenquelle eingegebene URL.

## Lokal ansehen und prüfen

Node.js 20+ und Python 3 verwenden. Für die Tests werden keine Pakete benötigt.

```powershell
npm test
npm run dev
```

Dann `http://localhost:4173` öffnen. Nicht per Doppelklick über `file://` starten, da ES-Module und JSON geladen werden.

Die Tests prüfen Ampelgrenzen, ungültige Werte, Sortierung, Fristfilter mit Zeitzonen, die reale CSV, CSV-Parsing, Link- und Exportbehandlung, Worker-Authentifizierung, CORS, Pagination und Fehlerfälle. Ein erfolgreicher Mock-Test ersetzt keinen Test mit deinen n8n-Zugangsdaten.

Datumsangaben ohne Uhrzeit gelten bis 23:59:59 Uhr Europe/Berlin. Deutsche Angaben mit `Europe/Berlin`, `Europe/Paris` oder festem `UTC+01:00`-Offset werden berücksichtigt; unklare Originalangaben bleiben in der Detailansicht sichtbar. Fristen werden in der Tabelle in Europe/Berlin angezeigt.

## Quellen

- [n8n Data Table API](https://docs.n8n.io/connect/n8n-api/data-table/)
- [n8n API-Authentifizierung](https://docs.n8n.io/connect/n8n-api/authentication/)
- [Cloudflare Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [GitHub Pages mit Workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
