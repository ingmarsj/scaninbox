# CLAUDE.md

Šis fails ir Claude Code darba atmiņa par šo projektu. Tajā ir tas, ko **nevar
izlasīt no koda** — lēmumi, iemesli un slazdi. Visu pārējo skaties `README.md`,
kas ir rakstīts cilvēkiem un ir aktuāls.

## Kas šis ir

Validācijas landing lapa **ScanInbox** — iecerētam inbox.eu pakalpojumam, kas
biroja skenerim vai daudzfunkciju printerim iedod savus SMTP piekļuves datus, lai
iekārtas poga «Scan to E-mail» beidzot strādātu.

**Lapas vienīgais mērķis ir savākt e-pastu pieteikumus.** Produkta nav. Lēmumi
par saturu tiek pieņemti par labu pieteikumu skaitam, ne pilnībai.

Trīs kolēģi taisa pa savai versijai vienai un tai pašai idejai un pēc tam salīdzina
([nimda5](https://nimda5.github.io/sendscan/), [achelnov](https://achelnov.github.io/IoTMail/index.html)).
No viņu lapām ir aizgūts vairāk nekā tikai idejas — skat. «Pārņemts 1:1».

## Zelta likumi

1. **`index.html` ir vienīgais avots.** Viss — HTML, CSS, JS, animācija — ir
   vienā failā bez atkarībām. Nesadali to. Tas ir apzināti: lapu publicē kā vienu
   statisku failu, un to var atvērt arī no diska.
2. **Nulle npm atkarību.** SQLite nāk no Node iebūvētā `node:sqlite` (vajag
   Node 22.5+). Neieviesi `package.json`.
3. **Tekstu maina caur `tools/i18n.js`** — skat. zemāk. Ja to izlaidīsi, lapa
   klusi rādīs latviešu teikumus vācu versijā.
4. **Nemergo bez atļaujas.** Push uz `main` publicē lapu internetā.

## Tulkojumi — vienīgā vieta, kur var kļūdīties klusi

Piecas valodas: lv, en, it, fr, de. Latviešu teksts ir **pašā `index.html`** uz
elementiem ar `data-i18n="atslēga"`. Pārējās četras ir `i18n/<lang>.json`, un tās
iemontē lapā kā `window.SCANINBOX_I18N` bloku.

Mainot jebkuru tekstu:

```bash
node tools/i18n.js extract      # atjauno i18n/lv.json no lapas
git diff i18n/lv.json           # redzi, kuras atslēgas jātulko
# izlabo tās pašas atslēgas i18n/en|it|fr|de.json
node tools/i18n.js merge        # ieliek vārdnīcas atpakaļ lapā
node --test
```

`i18n/lv.json` ir **ģenerēts** — to raksta `extract`, nevis cilvēks. Tas pastāv
tikai tāpēc, lai `git diff` parādītu, kas mainījies.

Slazdi, kas jau vienreiz iekoduši:

- **Atslēga atslēgā.** `data-i18n` elements iekšā citam `data-i18n` elementam
  tiek iznīcināts, pārslēdzot valodu. Nedari tā.
- **Marķējums.** Tulkojumā jābūt tiem pašiem tagiem un entītijām. `tools/i18n.js
  check` to pārbauda, un tas ir piesiets pie `node --test`.
- **Kodi pret etiķetēm.** Pogas `data-v` ir datubāzes kods (`6-20` ar defisi),
  redzamais teksts ir tipogrāfisks (`6–20` ar domuzīmi). Reiz tie bija vienādi,
  un serveris klusi izmeta katru atbildi.
- **`<code id="modal-mail">`** un tamlīdzīgi id tulkojumā jāsaglabā — JS tos
  meklē pēc pārslēgšanas.

## Valodas noteikšana un adreses

Publicētajā versijā katrai valodai ir sava lapa: `/lv/ /en/ /it/ /fr/ /de/`. Tās
saliek `.github/build-site.js` no viena `index.html`. Sakne pāradresē.

Secība: **adrese → `?lang=` → sīkdatne `scaninbox_lang` → pārlūka valoda →
laika josla → angļu.**

Divas lietas, kas izskatās pēc kļūdas, bet nav:

- **Pārlūks stāv pirms laika joslas.** Otrādi bija, un tas nozīmēja, ka Latvijā
  visi dabūja latviešu valodu, arī angļu pārlūki. Reklāmai tas ir slikti: vācietim
  bez `?lang=` saitē jāatveras vācu versijai.
- **Laika josla, nevis IP ģeolokācija.** Lapa pie formas apsola IP neglabāt, tāpēc
  sūtīt to uz svešu geo-IP servisu būtu pretrunā ar pašas tekstu. Laika josla ir
  bezmaksas, tūlītēja un neprasa atļauju.

Lokāli valodu ceļu nav (marķieri ieliek CI), tāpēc lokāli slēdzis maina tekstu uz
vietas un pāradresācijas nenotiek. Viens fails, kas strādā abos režīmos.

## Priekšskatījuma režīms — izskatās pēc kļūdas, bet ir apzināts

GitHub Pages ir statisks hostings, tur API nav. Lapa to pamana: ja `/api/leads`
atbild ar **404 vai 405**, forma iziet cauri līdz galam — apstiprinājums un
papildjautājumi — bet **neko nesūta**, un rinda zem formas saka, ka adrese netika
saglabāta.

Tas attiecas tikai uz 404/405. Pārtrūcis savienojums joprojām ir kļūda ar
iespēju mēģināt vēlreiz, citādi cilvēks ar sliktu signālu dabūtu «paldies» un
pazustu.

To prasīja pasūtītājs, lai lapa būtu salīdzināma ar kolēģu versijām, kuras
**neko nesaglabā vispār** un par to neko nesaka. Godīgā rinda ir atslēga
`msg.savedDemo`.

## Pārņemts 1:1 no kolēģa lapas

Sadaļa «Kā tas strādā» — virsraksts, ievads, visi četri soļi, ikonas, bultiņu
josla un tabula — ir **burtiski nokopēta** no nimda5 versijas pēc tiešas
pasūtītāja prasības, kas atkārtota divreiz.

**Tāpēc lapa sola AI printera atpazīšanu no bildes, kā ScanInbox nav.** Tā ir
nimda produkta ideja. Validācijas lapai tas ir pieļaujams tests (kājenē skaidri
rakstīts, ka pakalpojums nav pieejams), bet, ja kāds prasa to noņemt vai maina
produkta apjomu, sākt vajag no šīs sadaļas.

## Citi apzināti lēmumi, ko nevajag «salabot»

- **`noindex, nofollow`** ir vietā ar nodomu, kamēr lapa ir pārskatīšanai.
- **`price_bands` tabula paliek**, lai gan forma cenu vairs nejautā — tur ir
  pirmās iterācijas atbildes. `leads.js` to rāda tikai, ja kaut kas ir.
- **`COALESCE` atjaunošanā.** Viens pieteikums aiziet kā vairāki pieprasījumi
  (e-pasts, tad pa vienam uz katru atbildi), tāpēc vēlāks iesniegums ar mazāk
  atbildēm jau saglabātās nedrīkst nodzēst. Zīmoli ir izņēmums: ja lauks ir klāt,
  tas aizstāj kopu pilnībā, lai atzīmēto varētu noņemt.
- **`/api/health` neatgriež pieteikumu skaitu.** Tas ir gan konkurenta mērījums,
  gan veids pierādīt, ka «pirmie 10» jau aizņemti, kamēr lapa to vēl sola.
- **Sargtests** `test/api.test.js` pārbauda, ka lapā ir tieši viens `fetch` un
  nav otras glabātavas. Ja tas nokrīt, **nemaini testu** pirms nesaproti, kas
  lapā sūta datus otrā vietā.
- **Divi privātuma testi** `test/schema.test.js` neļauj shēmā parādīties `ip` vai
  `user_agent` kolonnai. Tie sargā solījumu, ne kodu.

## Animācija

Hero figūra iet pa **vienu pulksteni** — `--cycle` mainīgais `:root` blokā (9 s).
Visas keyframes ir procentos pret to, tāpēc takti nevar aizpeldēt.

Takti: skenē 5–27 % → sūta 33–53 % → nolaižas 54–60 % → atmaksa 60–88 % →
atiestate 88–100 %. Mainot vienu, jāpārbauda kaimiņi.

Pārbaudīt var, pauzējot un skrollējot animāciju:

```js
document.getAnimations()
  .filter(a => a.effect && document.getElementById('anim').contains(a.effect.target))
  .forEach(a => { a.pause(); a.currentTime = 9000 * 0.44; });
```

Divas lietas, kas jau bija salauztas un var atkārtoties:

- **`IntersectionObserver` ieraksti pienāk ar nobīdi**, un pēdējais uzliktais
  uzvar arī tad, kad tas vairs neatbilst patiesībai. Tāpēc `syncFigure()` un
  `syncDock()` nolasa elementa **reālo pozīciju**, nevis tic notikumam. Neatgriez
  to atpakaļ uz `entry.isIntersecting`.
- **`prefers-reduced-motion`** blokam jāparāda **viens saskanīgs kadrs** (lapa
  noskenēta, vēstule nolaidusies), nevis sasaldēts vidus. Pievienojot jaunu
  animāciju, pievieno arī tās beigu stāvokli tur.

## Palaišana

```bash
node server.js                  # lapa + API uz http://localhost:8123
node --test                     # 128 testi
node leads.js --list            # pieteikumi terminālī
node tools/i18n.js check        # tulkojumu parītāte
SITE_URL=... node .github/build-site.js   # kā CI saliek _site
```

Datubāze ir `data/`, git-ā nav. Ja `lang` kolonnas `CHECK` saraksts mainās,
vecā datubāze jāizdzēš — SQLite `CHECK` ar `ALTER TABLE` nemaina.

## Kas bloķē palaišanu

Nav kods, bet jāzina:

1. **Nav vietas, kur darbināt `server.js`.** Kamēr tās nav, lapa savāc nulli
   pieteikumu. Vajag Node 22.5+, **pastāvīgu disku** (PaaS ar pagaidu failu
   sistēmu datubāzi pazaudēs) un HTTPS. Tad `SCANINBOX_API` GitHub mainīgajos un
   `SCANINBOX_ALLOW_ORIGIN` serverī — koda maiņa nav vajadzīga.
2. **Nav privātuma paziņojuma.** VDAR 13. pants prasa pārzini, tiesības un
   kontaktu. Bez tā formu nedrīkst laist reālā apritē.
3. **Nav kontaktadreses.** BUJ tāpēc saka «atbildi uz mūsu vēstuli», nevis
   «raksti mums».
4. **Nav `og:image`.** Pārējie dalīšanās tagi ir.
5. **Nav analītikas.** Bez tās uzzināsim pieteikumu skaitu, bet ne konversiju un
   ne to, kura valoda pelna.

Pilns saraksts ar atzīmēm — `README.md`, sadaļa «Pirms publiskas palaišanas».

## Tirgus konteksts (no izpētes, kas nav repozitorijā)

- Pieprasījumu rada **Microsoft, nevis papīra kultūra**: kopš 2020. gada janvāra
  jaunajiem Microsoft 365 nomniekiem SMTP AUTH ir izslēgts pēc noklusējuma, un
  2026. gada decembra beigās tas tiks izslēgts arī esošajiem. Tas ir asākais
  arguments lapā un tāpēc ir atsevišķs lietojuma stāsts un BUJ ieraksts. **Šie
  datumi jāpārbauda** — Microsoft grafiku jau ir pārcēlis trīs reizes.
- **Cenu grīda ir tuvu nullei**: neviens SMTP serviss nemaksā par ierīci. 10 €
  gadā (0,83 €/mēn.) ir uz konkurences līnijas; par ierīci *mēnesī* būtu miris.
- **Itālija** ir strukturāli spēcīgākais tirgus (zemākais IT speciālistu īpatsvars
  ES), **Vācija un Francija** — lielākie pēc apjoma. Tāpēc tulkots uz šīm trim.
- **Latvija viena ir par mazu** (~484 tūkst. € gadā pat pie 100 % tirgus daļas).
