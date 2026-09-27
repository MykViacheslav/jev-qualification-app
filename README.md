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

**Ważna uwaga:** dokładny kształt zapytania/odpowiedzi Jev/OpenRouter w
`src/jevClient.js` (endpoint `POST /api/v1/system-one`, pola `state`,
`questions`, `probabilities`, `confidence`) został odtworzony na podstawie
publicznej dokumentacji OpenRoutera — sandbox, w którym pisano ten kod, nie
miał dostępu sieciowego do `openrouter.ai`, więc nie dało się tego
zweryfikować na żywo. Jeśli pierwsze prawdziwe wywołanie zwróci błąd lub
nieoczekiwany kształt danych, zweryfikuj go względem
[dokumentacji Jev na OpenRouter](https://openrouter.ai/docs/guides/community/typesafe-sdk)
i popraw `buildRequestBody` / `parseResponse` w `src/jevClient.js` — cała
logika wywołania modelu jest odizolowana w tym jednym pliku.

## Struktura

```
server.js            — serwer Express, endpointy /api/categories i /api/qualify
src/jevClient.js      — cała logika wywołania Jev (lub mocka)
public/               — frontend (HTML/CSS/vanilla JS, bez frameworka)
```

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
