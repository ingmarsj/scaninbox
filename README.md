# ScanInbox — landing lapa

Produkta idejas validācijas lapa **ScanInbox** — inbox.lv pakalpojumam, kas
skenētos dokumentus nogādā tieši e-pastā, izmantojot inbox.lv SMTP.

Lapas vienīgais mērķis ir noskaidrot, **vai produkts ir vajadzīgs**: tā
paskaidro ideju un savāc priekšreģistrācijas pieteikumus ar signāliem, kas
mums vajadzīgi lēmumam — segments, ierīču skaits, ierīces modelis un cik
cilvēks būtu gatavs maksāt.

## Prasības

Node.js 22.5 vai jaunāks. Nekas cits. **Nav npm atkarību** — SQLite nāk no
Node iebūvētā `node:sqlite` moduļa.

```powershell
node --version    # v24.19.0 vai jaunāka
```

## Palaišana

```powershell
node server.js
```

Tad atver <http://localhost:8123/>. Cits ports: `node server.js --port 9000`.

Serveris pasniedz lapu un pieņem pieteikumus. Datubāze tiek izveidota
automātiski pirmajā startā (`data/scaninbox.db`), un shēma tiek piemērota
katrā startā — tā ir idempotenta, tāpēc migrācijas nav vajadzīgas.

## Saturs

| Fails | Nozīme |
| --- | --- |
| `index.html` | Visa lapa — HTML, CSS un JS vienā failā. Vienīgais avots. |
| `server.js` | Statiskā lapa + pieteikumu API. Bez atkarībām. |
| `db/schema.sql` | Datubāzes shēma, uzmeklēšanas tabulas un skati. |
| `leads.js` | Pieteikumu atskaite terminālī. |
| `build-artifact.ps1` | Ģenerē `dist/artifact.html` priekšskatīšanai kā Claude Artifact. |
| `data/` | SQLite datubāze. **Nav git repozitorijā** — tie ir dati, ne kods. |

## Pieteikumu apskate

Ātrākais ceļš, bez servera un bez pilnvaras:

```powershell
node leads.js           # kopsavilkums: cenu joslas, segmenti, iekārtas
node leads.js --list    # visi pieteikumi
node leads.js --csv     # eksports
```

## API

| Metode | Ceļš | Piekļuve |
| --- | --- | --- |
| `POST` | `/api/leads` | atvērts — šeit sūta forma |
| `GET` | `/api/health` | atvērts |
| `GET` | `/api/leads` | pilnvara |
| `GET` | `/api/leads.csv` | pilnvara |
| `GET` | `/api/stats` | pilnvara |

Lasīšanas galapunkti ir **slēgti, kamēr nav uzstādīta pilnvara**. Tā ir
apzināta noklusējuma vērtība: pieteikumi ir personas dati, un tie nedrīkst būt
publiski pieejami tikai tāpēc, ka serveris darbojas.

```powershell
$env:SCANINBOX_ADMIN_TOKEN = "kada-gara-nejauna-virkne"
node server.js
```

```bash
curl -H "Authorization: Bearer kada-gara-nejauna-virkne" http://localhost:8123/api/stats
```

### Vides mainīgie

| Mainīgais | Nozīme |
| --- | --- |
| `SCANINBOX_DB` | datubāzes fails (noklusējums `./data/scaninbox.db`) |
| `SCANINBOX_ADMIN_TOKEN` | atver lasīšanas galapunktus |
| `SCANINBOX_ALLOW_ORIGIN` | CORS izcelsme, ja lapa hostēta atsevišķi |
| `PORT` | ports |

## Datu modelis

`leads` — viena rinda uz e-pastu. Atkārtots pieteikums ar to pašu adresi
**atjauno atbildes**, nevis rada dublikātu; e-pasts tiek salīdzināts mazajos
burtos. Lapa tādā gadījumā parāda «Atbildes atjaunotas», nevis «Esi sarakstā».

`lead_events` — audita pēdas. Katrs iesniegums saglabājas kā saņemtais JSON,
tāpēc redzams, ja kāds maina atbildi, un var pateikt, vai cena mainījās pēc
tam, kad cilvēks izlasīja lapu otrreiz.

`segments`, `device_bands`, `price_bands` — uzmeklēšanas tabulas ar etiķetēm
latviski un angliski. Serveris derīgos kodus lasa no datubāzes, nevis no otras
kopijas JS pusē, un nezināmu kodu klusi izmet kā `NULL`.

Skati `v_leads`, `v_price_demand`, `v_segment_demand`, `v_device_models`
atbild uz lēmuma jautājumiem tieši SQL līmenī.

### Ko datubāzē apzināti NAV

IP adreses un user-agent. Lapa lietotājam apsola glabāt tikai e-pastu un
formas atbildes, tāpēc neko citu arī neglabājam. IP tiek izmantots tikai
servera atmiņā ātruma ierobežošanai (5 iesniegumi 10 minūtēs) un nekur
nenonāk.

## Kur nonāk pieteikumi

`index.html` skripta sākumā ir `LEADS_ENDPOINT`, pēc noklusējuma
`/api/leads`. Forma meklē backend divās vietās:

1. **Claude Artifact `db`** — ja lapa darbojas kā Artifact. Publicētā lapa
   nevar sasniegt serveri uz tava datora, tāpēc priekšskatījumam ir sava
   glabātava.
2. **`LEADS_ENDPOINT`** — `server.js` un SQLite. Uz inbox.lv infrastruktūras
   norādi to uz reālo API ceļu.

> Publiskai kampaņai jāizmanto `LEADS_ENDPOINT`, nevis Artifact `db`.
> Artifact glabātava ir organizācijas iekšēja — katrs, kas var atvērt lapu,
> var arī nolasīt iesniegtos pieteikumus.

## Pirms publiskas palaišanas

- [ ] Uzlikt `SCANINBOX_ADMIN_TOKEN` ar garu nejaušu virkni
- [ ] Novietot serveri aiz HTTPS (SQLite fails ārpus web saknes)
- [ ] Pārbaudīt SMTP piemēra vērtības sadaļā «Ierīces piekļuves dati»
- [ ] Pievienot privātuma politikas saiti pie piekrišanas lauka
- [ ] Aizvietot `scaninbox.lv` adreses piemērus ar reālajām
- [ ] Iestatīt `data/` dublēšanu
- [ ] Pievienot analītiku, ja gribam mērīt konversiju

## Lapas uzbūve

Latviešu teksts ir ierakstīts pašā HTML, angļu — `data-en` atribūtos, ko JS
apmaina pēc pieprasījuma. Lapa lasāma latviski arī tad, ja JavaScript
nestrādā.

Krāsas un tipogrāfija nāk no CSS mainīgajiem `:root` blokā. Tumšais režīms
pārdefinē tikai mainīgos, tāpēc jaunus komponentus var likt klāt, nedomājot
par abām tēmām atsevišķi.

Vizuālais reģistrs ir biroja tehnikas dokumentācija: blīvas specifikāciju
tabulas, monospace vērtības, attēlu paraksti un viens tumšs «ierīces»
panelis.

## Atruna

Pakalpojums vēl nav pieejams. Lapa nedrīkst radīt iespaidu, ka kaut ko var
iegādāties — kājenē par to ir skaidra piezīme, kas jāsaglabā, kamēr produkts
nav palaists.
