# jev-qualification-app

Testowy, jednoekranowy formularz kwalifikacyjny (jak Google Forms), oceniany
na żywo przez model **Jev** (TypeSafe AI), wywoływany przez **OpenRouter**.

- **70% ekranu (prawa strona):** formularz z trzema pytaniami.
- **30% ekranu (lewa strona):** panel administracyjny pokazujący, jak
  sklasyfikował zgłoszenie model Jev — prawdopodobieństwa dla czterech
  kategorii oraz pewność modelu.

Kategorie (od najlepszej do najgorszej): *bardzo dobrze zakwalifikowany*,
*zakwalifikowany*, *przeciętny*, *niezakwalifikowany*.

## AI Hub — etap 2

`config/ai-hub.json` jest jednym miejscem, gdzie ustawiamy trasę dla każdego
obszaru: model, poziom rozumowania i typ wywołania. Obecnie:

- rutynowe zadania: Jev Router + niski poziom rozumowania;
- analiza: Jev Router + średni poziom rozumowania;
- kontrola zasad: Jev 1.13 przez endpoint Decisions.

Hub tylko przygotowuje bezpieczny plan. Nie przesyła danych, nie składa zleceń
i nie wysyła wiadomości. Sprawdzenie planu, bez użycia API i bez kosztu:

```bash
npm run inspect-ai-plan -- investments create_report
```

Przykład zabronionej akcji (`place_order`) zakończy się blokadą zgodną z
`config/ai-policy.json`.

## Dane do raportu inwestycyjnego — etap 3

Raport działa wyłącznie w trybie odczytu. Przyjmuje zrzut danych w JSON oraz
Twoją listę TradingView, wybiera tylko sytuacje wymagające uwagi i wyraźnie
oznacza brakujące lub nieaktualne dane. Nie wywołuje AI, nie składa zleceń i
nie zmienia watchlisty.

Przykładowe sprawdzenie na bezpiecznych danych testowych:

```powershell
npm run build-morning-report -- --snapshot test/fixtures/investment-snapshot.json --watchlist "C:\Users\mykyt\Downloads\Lista Obserwowanych_7ae55.txt"
```

`config/investment-sources.json` zawiera stan źródeł. TradingView jest gotowy
do lokalnego importu JSON; CoinGlass i Gmail inwestycyjny pozostają jeszcze
niepodłączone.

### Lokalny automat plikowy

Wrzuć rzeczywisty zrzut JSON do `data/investments/inbox/`. Automat wybiera
najnowszy według pola `asOf`, a raport zapisuje tylko lokalnie w
`data/investments/reports/` (te pliki są wykluczone z gita).

```powershell
npm run run-morning-report -- --watchlist "C:\Users\mykyt\Downloads\Lista Obserwowanych_7ae55.txt"
```

Do bezpiecznej próby bez prawdziwych danych użyj folderu z przykładem jako
wejścia. Po sprawdzeniu usuwasz parametr `--input-dir` i korzystasz z folderu
`inbox`.

```powershell
npm run run-morning-report -- --input-dir data/investments/examples --watchlist "C:\Users\mykyt\Downloads\Lista Obserwowanych_7ae55.txt"
```

Skrypt `scripts/install-morning-report-task.ps1` dopiero po ręcznym uruchomieniu
utworzy codzienne zadanie Windows. Nie instaluje go sam i nie nadpisuje
istniejącego zadania o tej samej nazwie.

### Automatyczny odbiór alertów TradingView

Aplikacja ma teraz odbiornik `POST /api/investments/tradingview/<token>`. Po
otrzymaniu prawidłowego alertu Spot Compass zapisuje on JSON do folderu `inbox`.
`<token>` jest sekretem ustawianym wyłącznie lokalnie w
`TRADINGVIEW_WEBHOOK_TOKEN`; nie wklejaj go do rozmowy ani do Pine Script.

TradingView musi dostać publiczny adres tej aplikacji, na przykład:

```text
https://twoja-domena.example/api/investments/tradingview/TWÓJ_SEKRETNY_TOKEN
```

W oknie alertu wybierz warunek Spot Compass, a nie zwykłą pozycję `Cena`.
Obecny format alertów skanera jest przyjmowany automatycznie. Pojedynczy alert
zawiera tylko fragment danych, więc raport oznaczy brak interwałów 1D/12H/6H
zamiast udawać pełną analizę.

## Szybki start

```bash
npm install
cp .env.example .env
npm start
```

Otwórz `http://localhost:3000`.

Domyślnie `.env.example` ustawia `USE_MOCK_JEV=true`, więc aplikacja od razu
działa i zwraca losową (ale prawdopodobną) klasyfikację — bez klucza API. To
pozwala budować i testować UI zanim podepniesz prawdziwy model.

## Podłączenie prawdziwego modelu Jev

1. Utwórz klucz API na [openrouter.ai/keys](https://openrouter.ai/keys).
2. W `.env` ustaw:
   ```
   OPENROUTER_API_KEY=twój_klucz
   USE_MOCK_JEV=false
   JEV_MODEL=typesafe/jev-router
   ```
3. Zrestartuj serwer (`npm start`).

Jev wywoływany jest przez standardowy endpoint OpenRouter
`POST https://openrouter.ai/api/v1/chat/completions` (zweryfikowane na żywo),
z `response_format: {"type": "json_object"}` — model proszony jest o zwrot
samych prawdopodobieństw w JSON. Cała logika jest w jednym pliku:
`src/jevClient.js` (`buildRequestBody` / `parseResponse`), więc łatwo to
poprawić, gdyby format odpowiedzi się zmienił.

## Struktura

```
server.js                       — serwer Express, endpointy /api/categories i /api/qualify
src/jevClient.js                 — logika wywołania Jev dla formularza kwalifikacyjnego (lub mocka)
public/                          — frontend (HTML/CSS/vanilla JS, bez frameworka)
scripts/classify-mail.js         — jednorazowa klasyfikacja ręcznie zebranej paczki e-maili
scripts/gmail-jev-classifier.js  — pełna automatyzacja: Gmail API + Jev, bez udziału Claude
```

## Pełna automatyzacja Gmail + Jev (bez Claude w pętli)

`scripts/gmail-jev-classifier.js` samodzielnie czyta pocztę z Gmaila,
klasyfikuje ją przez Jev i nakłada etykiety `Jev/Pilne`, `Jev/Klient`,
`Jev/XTB`, `Jev/Inwestycje`, `Jev/Spam`, `Jev/Newsletter`, `Jev/Inne` —
działa wyłącznie na Twojej maszynie, bez żadnego pośrednictwa czatu.

Wiadomości dotyczące XTB mają pierwszeństwo przed pozostałymi kategoriami
inwestycyjnymi; alerty i materiały inwestycyjne innych nadawców trafiają do
`Jev/Inwestycje`.

### Jednorazowa konfiguracja OAuth (5–10 min)

1. Wejdź na [Google Cloud Console](https://console.cloud.google.com/) →
   utwórz projekt (albo użyj istniejącego).
2. **APIs & Services → Library** → wyszukaj **Gmail API** → **Enable**.
3. **APIs & Services → OAuth consent screen** → typ **External** (jeśli to
   konto prywatne Gmail) → wypełnij nazwę aplikacji i e-mail → zapisz. Na
   ekranie "Test users" dodaj swój adres Gmail.
4. **APIs & Services → Credentials** → **Create Credentials → OAuth client ID**
   → typ aplikacji: **Desktop app** → nazwij dowolnie → **Create**.
5. Pobierz plik JSON (przycisk **Download JSON**) i zapisz go jako
   `scripts/credentials.json` w tym repozytorium (plik jest w `.gitignore`,
   nigdy nie trafi do gita).

### Uruchomienie

```bash
npm install
npm run classify-gmail
```

Przed uruchomieniem ustaw w `.env` prawdziwy `OPENROUTER_API_KEY` oraz
`JEV_MODEL=typesafe/jev-router`. Bez klucza skrypt się zatrzyma.

Przy pierwszym uruchomieniu skrypt wypisze link — otwórz go w przeglądarce,
zaloguj się i zaakceptuj dostęp. Token zapisze się w `scripts/token.json`
(też w `.gitignore`) — kolejne uruchomienia nie będą już wymagać logowania.

Domyślnie skrypt przetwarza do 500 nieoznakowanych wiadomości z lat 2025–2026
na raz, z całej poczty (limit `GMAIL_MAX_MESSAGES` w `.env`). Zakres można
zmienić przez `GMAIL_DATE_FROM` i `GMAIL_DATE_BEFORE` w formacie `RRRR/MM/DD`;
data końcowa jest wyłączna. Ustaw `GMAIL_DAYS_BACK=30`, żeby dodatkowo
ograniczyć wyszukiwanie do ostatnich 30 dni. Uruchamiaj skrypt ponownie, aż przetworzy wszystko —
już oznakowane wiadomości są pomijane automatycznie, więc uruchamianie
wielokrotnie jest bezpieczne.

## Deploy na Hostinger

To wdrożenie testowe, więc najprostsza ścieżka:

1. W hPanel Hostingera wybierz hosting z obsługą **Node.js** (Website → Node.js).
2. Wgraj repozytorium (Git deploy z tego repo albo upload plików, bez `node_modules`).
3. Ustaw plik startowy na `server.js` i zainstaluj zależności (`npm install`)
   z poziomu panelu Node.js.
4. W sekcji zmiennych środowiskowych Node.js ustaw `OPENROUTER_API_KEY`,
   `JEV_MODEL`, `USE_MOCK_JEV=false` (lub `true`, jeśli chcesz na razie
   pokazać tylko UI).
5. Uruchom aplikację z panelu — Hostinger sam ustawia `PORT`.
