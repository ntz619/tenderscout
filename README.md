# TenderScout

Dashboard: **https://ntz619.github.io/tenderscout/**  
Repository: **https://github.com/ntz619/tenderscout**  
Cloudflare-API: **https://tenderscout-api.niklasriemer98.workers.dev/api/tenders**

Die Oberfläche ist auf GitHub Pages veröffentlicht. Der Worker ist separat auf Cloudflare bereitgestellt. Die Live-Verbindung wird nach Einrichtung des unten beschriebenen n8n-Webhooks und der Secrets freigeschaltet.

## Dashboard

- Tabelle mit Short Summary, Prozentbewertung, Bewerbungsfrist und Quelllink. Begründung, Auftragswert, Publication ID, Status, Label und Zeitstempel sind in der Detailansicht enthalten.
- Standardmäßig nach `relevance_likelihood_percent` absteigend sortiert. Fehlende und ungültige Werte stehen separat am Ende.
- Feste linke Filterleiste für Suche, Relevanzfarben, Mindest-Relevanz, Frist, Status, Quelle und das n8n-Bewertungslabel.
- Ampel ausschließlich aus dem Prozentwert im Dashboard: **Rot < 50 %, Gelb ≥ 50 und < 70 %, Grün ≥ 70 %**. Zwei Regler ändern die Grenzen sofort; Einstellungen bleiben lokal gespeichert. Das Quellfeld `ampel` wird zur Einstufung ignoriert und vom Worker nicht ausgeliefert.
- CSV-Import mit UTF-8/Windows-1252, Export der gefilterten Auswahl, Pagination und mobile Ansicht.
- Aktualisierung manuell und alle fünf Minuten, solange das Live-Dashboard sichtbar geöffnet ist. Fehler erscheinen sichtbar; es gibt keinen stillen Wechsel von Live- zu Beispieldaten.

Die Datei `docs/sample-data.json` enthält die zwölf Einträge der bereitgestellten CSV einschließlich ihrer Begründungen. Sie ist im öffentlichen Repository und auf GitHub Pages öffentlich lesbar. Lokale CSV-Importe werden nur im Browser verarbeitet. Live-Daten werden mit `Cache-Control: no-store` geliefert.

## Trial-kompatible Architektur

Die öffentliche n8n-API ist im n8n-Cloud-Free-Trial nicht verfügbar. Deshalb nutzt die vorbereitete Konfiguration einen separaten Lese-Workflow:

```text
GitHub Pages Dashboard
  → Cloudflare Worker (DASHBOARD_TOKEN)
    → n8n GET-Webhook (N8N_WEBHOOK_TOKEN)
      → Data Table lesen → JSON-Antwort
```

GitHub Pages führt keine serverseitigen Functions aus. Der Cloudflare Worker übernimmt diesen Teil und hält den n8n-Webhook-Zugangscode vom Browser fern. CORS ist auf `https://ntz619.github.io` beschränkt; zusätzlich verlangt der Worker einen Dashboard-Zugangscode. Nur dieser separate Code wird im Dashboard eingegeben und im sessionStorage des jeweiligen Browser-Tabs gespeichert. Die n8n-Zugangsdaten gehören ausschließlich in Cloudflare-Secrets und die n8n-Credential.

Jede erfolgreiche Live-Aktualisierung führt den Lese-Workflow einmal aus und verbraucht damit eine n8n-Workflow-Ausführung. Der bestehende Bewertungsworkflow wird nicht verändert. Nach Ablauf des n8n-Trials hängt der Live-Zugriff vom Fortbestand deiner n8n-Instanz ab.

## 1. n8n-Workflow importieren

Datei: **`n8n/read-tenders-workflow.json`**

1. Öffne n8n in deinem bereits angemeldeten Browser und erstelle im **selben Projekt wie `rated_tenders`** einen neuen Workflow.
2. Workflow-Menü **… → Import from File** und die JSON-Datei auswählen. Alternativ die JSON kopieren und auf der leeren Workflow-Canvas einfügen.
3. Es erscheinen drei verbundene Nodes: **Dashboard Webhook → Read rated_tenders → Return tenders**.
4. **Dashboard Webhook** öffnen. Authentication ist bereits **Header Auth**. Erstelle dafür eine neue Credential:

| Credential-Feld | Eintrag |
| --- | --- |
| Name des HTTP-Headers | `X-TenderScout-Token` |
| Value des HTTP-Headers | Neuer zufälliger Zugangscode mit mindestens 32 Zeichen |

5. Die Credential speichern und im Webhook auswählen. Den Zugangscode sicher speichern: **genau derselbe Wert** wird gleich als Cloudflare-Secret `N8N_WEBHOOK_TOKEN` benötigt.
6. Im Node **Read rated_tenders** ist die Tabelle `nSw53udgNius49RS` bereits per ID eingestellt, Operation **Get**, **Return All** eingeschaltet. Bei Bedarf die Tabelle im Dropdown erneut auswählen.
7. Workflow speichern und **veröffentlichen / aktivieren**. Die Produktions-URL muss lauten:

```text
https://tenderautomation.app.n8n.cloud/webhook/tenderscout-read
```

Die Test-URL mit `/webhook-test/` ist nicht für das Dashboard geeignet. Ohne passende Header-Auth darf der Webhook keine Tabellendaten zurückgeben. Der Import ist absichtlich inaktiv und enthält keine Credential und keine Secrets.

## 2. Cloudflare-Secrets fertigstellen

Worker **tenderscout-api → Settings → Runtime variables and secrets → Production**.

Diese öffentlichen Variablen sind vorbereitet:

| Name | Wert |
| --- | --- |
| `N8N_BASE_URL` | `https://tenderautomation.app.n8n.cloud` |
| `N8N_TABLE_ID` | `nSw53udgNius49RS` |
| `N8N_WEBHOOK_URL` | `https://tenderautomation.app.n8n.cloud/webhook/tenderscout-read` |
| `ALLOWED_ORIGINS` | `https://ntz619.github.io` |

Zusätzlich zwei Werte als **Secret** hinterlegen und deployen:

| Name | Wert |
| --- | --- |
| `N8N_WEBHOOK_TOKEN` | Derselbe Wert wie in der n8n-Header-Auth-Credential |
| `DASHBOARD_TOKEN` | Ein anderer zufälliger Zugangscode mit mindestens 32 Zeichen |

**Für diesen Weg wird kein `N8N_API_KEY` benötigt.** Die Werte nicht im Repository oder im Chat speichern. Beide Codes im Passwortmanager aufbewahren.

## 3. Dashboard verbinden

1. **https://ntz619.github.io/tenderscout/** öffnen.
2. **Datenquelle** wählen. Die Worker-URL ist bereits eingetragen: `https://tenderscout-api.niklasriemer98.workers.dev`.
3. **Nur `DASHBOARD_TOKEN`** eingeben und **Verbinden** klicken.
4. Als Datenquelle muss jetzt **Live · n8n Data Table** erscheinen. Neue Tabellenzeilen werden beim nächsten Refresh eingelesen.

Die zwölf CSV-Beispieldaten allein bestätigen noch keine erfolgreiche Live-Verbindung. Die importierten n8n-Nodes müssen in deiner Instanz einmal erfolgreich ausgeführt werden.

## Fehlerhilfe

| Meldung | Prüfen |
| --- | --- |
| Worker-Konfiguration unvollständig | Beide Secret-Werte mit mindestens 32 Zeichen und `N8N_WEBHOOK_URL` speichern und deployen |
| Dashboard-Zugangscode ungültig | Dashboard-Eingabe muss exakt `DASHBOARD_TOKEN` entsprechen |
| Webhook lehnt Zugangscode ab | n8n-Header `X-TenderScout-Token` und Value mit `N8N_WEBHOOK_TOKEN` abgleichen |
| Webhook nicht aktiv | Workflow veröffentlichen/aktivieren und Produktions-URL statt Test-URL verwenden |
| Webhook liefert keine gültigen Tabellendaten | Data-Table-Node und Return-tenders-Node in n8n prüfen |
| Verbindung nicht möglich | Worker-URL sowie `ALLOWED_ORIGINS=https://ntz619.github.io` prüfen |

Der Worker gibt maximal 10.000 Zeilen zurück und meldet größere Datenmengen als Fehler. Er filtert die Antwort auf die erwarteten Tender-Felder. Die Ampelfarbe stammt stets aus der Berechnung im Browser. Jede n8n-Zeile bleibt ein eigener Datensatz; es wird nicht automatisch dedupliziert.

## GitHub Pages erneut deployen

In **Settings → Pages** ist **GitHub Actions** als Source eingestellt. `.github/workflows/pages.yml` veröffentlicht ausschließlich `docs/`, automatisch nach Änderungen in diesem Ordner auf `main`. Alternativ lässt sich der Workflow manuell starten.

## Lokal entwickeln

Node.js 20+ und Python 3. Die Tests benötigen keine Paketinstallation:

```powershell
npm test
npm run dev
```

Dann **http://localhost:4173** öffnen. Für lokale Live-Tests die localhost-Origin in `ALLOWED_ORIGINS` ergänzen. Nicht per `file://` starten, da das Dashboard ES-Module und JSON lädt.

Zum Deployment des Workers per CLI:

```powershell
npm install
npx wrangler login
npx wrangler secret put N8N_WEBHOOK_TOKEN --config worker/wrangler.jsonc
npx wrangler secret put DASHBOARD_TOKEN --config worker/wrangler.jsonc
npm run worker:deploy
```

`docs/config.js` enthält nur die öffentliche Worker-URL. Keine Zugangscodes dort eintragen. `worker/wrangler.jsonc` enthält ebenfalls nur öffentliche Variablen; die Secret-Befehle fragen ihre Werte separat ab.

Die Tests prüfen Ampelgrenzen, fehlende Werte, Sortierung, Fristen und Zeitzonen, CSV-Parsing, die zwölf realen Beispieldatensätze, sichere Links/Exporte sowie Worker-Authentifizierung, CORS, API-Pagination, den Trial-Webhook-Weg, leere Tabellen und Fehlerfälle. Mock-Tests ersetzen keinen Live-Test in n8n.

Deutsche Fristen ohne Uhrzeit gelten bis 23:59:59 Europe/Berlin. Berlin, Paris und feste UTC-Offsets der gelieferten Daten werden unterstützt. Unklare Angaben bleiben unverändert in der Detailansicht sichtbar.

## Optional: öffentliche API nach einem Upgrade

Der Worker unterstützt weiterhin den direkten API-Weg. Dafür `N8N_WEBHOOK_URL` entfernen und `N8N_API_KEY` als Cloudflare-Secret hinterlegen. Er liest dann `/api/v1/data-tables/nSw53udgNius49RS/rows` mit Cursor-Pagination. Dieser Weg steht im n8n-Free-Trial nicht zur Verfügung.

## Quellen

- [n8n API und Trial-Einschränkung](https://docs.n8n.io/connect/n8n-api/)
- [n8n Webhook und Header-Authentifizierung](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)
- [n8n Data Table: Get rows](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.datatable/rows/)
- [Cloudflare Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
