# ScanInbox — landing lapa

Produkta idejas validācijas lapa **ScanInbox** — inbox.lv pakalpojumam, kas
skenētos dokumentus nogādā tieši e-pastā, izmantojot inbox.lv SMTP.

Lapas vienīgais mērķis ir noskaidrot, **vai produkts ir vajadzīgs**: tā
paskaidro ideju un savāc priekšreģistrācijas pieteikumus ar signāliem, kas
mums vajadzīgi lēmumam (segments, ierīču skaits, ierīces modelis un cik
cilvēks būtu gatavs maksāt).

## Saturs

| Fails | Nozīme |
| --- | --- |
| `index.html` | Visa lapa — HTML, CSS un JS vienā failā. Vienīgais avots. |
| `build-artifact.ps1` | Ģenerē `dist/artifact.html` priekšskatīšanai kā Claude Artifact. |
| `serve.ps1` | Statisko failu serveris lokālai apskatei. Bez Node un Python. |
| `.claude/launch.json` | Ļauj Claude Code palaist `serve.ps1` ar preview rīku. |

Tehnoloģijas apzināti nav: nav build procesa, nav npm atkarību, nav
frameworka. Lapa ielādējas kā viens fails un strādā uz jebkura statiskā
hostinga, arī inbox.lv esošajā infrastruktūrā.

## Apskate lokāli

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```

Tad atver <http://localhost:8123/>. Cits ports: `-Port 9000`.

Var arī vienkārši atvērt `index.html` pārlūkā — viss strādā, izņemot formas
nosūtīšanu.

## Kur nonāk pieteikumi

Forma meklē backend divās vietās, šādā secībā:

1. **Claude Artifact `db`** — ja lapa darbojas kā Artifact, pieteikumi
   nonāk `leads` kolekcijā. Tas ir tikai ātrai iekšējai validācijai.
2. **`LEADS_ENDPOINT`** — konstante `index.html` skripta sākumā. Iestati to
   uz savu API ceļu, piemēram `"/api/leads"`, un forma sūtīs `POST` ar JSON.

Ja neviens nav pieejams, forma parāda godīgu kļūdas paziņojumu, nevis izliekas,
ka nosūtīja.

### Pieteikuma JSON

```json
{
  "email": "vards@inbox.lv",
  "name": "Vārds",
  "segment": "small",
  "devices": "2-5",
  "model": "Canon MF445dw",
  "priceBand": "2-5",
  "wantsBeta": true,
  "lang": "lv",
  "createdAt": "2026-09-04T09:14:22.481Z"
}
```

> **Publiskai kampaņai obligāti jāizmanto `LEADS_ENDPOINT`.** Artifact `db`
> ir organizācijas iekšējā glabātava — katrs, kas var atvērt lapu, var arī
> nolasīt iesniegtos pieteikumus. Reāliem klientu datiem tas nav piemērots.

## Publicēšana

Lapa ir statiska, tāpēc pietiek ar `index.html` nolikšanu uz web servera.

Pirms publiskas palaišanas:

- [ ] Iestatīt `LEADS_ENDPOINT` uz reālu inbox.lv API galapunktu
- [ ] Pārbaudīt SMTP piemēra vērtības sadaļā «Ierīces piekļuves dati»
- [ ] Pievienot privātuma politikas saiti pie piekrišanas lauka
- [ ] Pievienot analītiku, ja gribam mērīt konversiju
- [ ] Aizvietot `scaninbox.lv` adreses piemērus ar reālajām

## Lapas uzbūve

Latviešu teksts ir ierakstīts pašā HTML, angļu — `data-en` atribūtos, ko JS
apmaina pēc pieprasījuma. Tas nozīmē, ka lapa lasāma latviski arī tad, ja
JavaScript nestrādā.

Krāsas un tipogrāfija nāk no CSS mainīgajiem `:root` blokā. Tumšais režīms
pārdefinē tikai mainīgos, tāpēc jaunus komponentus var likt klāt, nedomājot
par abām tēmām atsevišķi.

## Atruna

Pakalpojums vēl nav pieejams. Lapa nedrīkst radīt iespaidu, ka kaut ko var
iegādāties — kājenē par to ir skaidra piezīme, kas jāsaglabā, kamēr produkts
nav palaists.
