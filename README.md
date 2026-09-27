# jev-qualification-app

Testowy, jednoekranowy formularz kwalifikacyjny (jak Google Forms), oceniany
na żywo przez model **Jev** (TypeSafe AI), wywoływany przez **OpenRouter**.

- **70% ekranu (prawa strona):** formularz z trzema pytaniami.
- **30% ekranu (lewa strona):** panel administracyjny pokazujący, jak
  sklasyfikował zgłoszenie model Jev — prawdopodobieństwa dla czterech
  kategorii oraz pewność modelu.

Kategorie (od najlepszej do najgorszej): *bardzo dobrze zakwalifikowany*,
*zakwalifikowany*, *przeciętny*, *niezakwalifikowany*.

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
`Jev/Spam`, `Jev/Newsletter`, `Jev/Inne` — działa wyłącznie na Twojej
maszynie, bez żadnego pośrednictwa czatu.

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
