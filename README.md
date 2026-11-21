# Minimal Market Explorer

A small, fast, browser-only explorer for spot markets on Kraken, Binance or Coinbase. No backend, no accounts, no API keys.

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # writes dist/index.html
```

The build is a single self-contained file: JS and CSS are inlined into `dist/index.html`. You can open it straight from disk (`file:///…/dist/index.html`) with no server. Every API it uses accepts requests from `file://` pages. `dist/` is not committed, so run `npm run build` after pulling changes.

**Online:** every push to `main` builds the app and publishes `dist/` to GitHub Pages ([.github/workflows/pages.yml](.github/workflows/pages.yml)): https://mediahub-org.github.io/minimal-market-explorer/

## Using it

- **Exchange:** pick Kraken, Binance or Coinbase at the top of the sidebar. The whole app (list, live prices, charts) uses that one exchange. Its name is shown on every detail page, with a "Trade on …" link. Prices are never compared across exchanges.
- **Currency:** the EUR/USD toggle shows each asset in that currency when the exchange has that market, otherwise in the next best one (EUR → USD → USDC → USDT → BTC → ETH, and the reverse for USD). The price's currency symbol and the detail page show which market is used. On Binance, USD means USDT, because its USD pairs barely trade.
- **Lists:** tabs for Favorites (the default), Crypto, and, on Kraken only, Stocks and ETFs. Search covers everything. Columns: price, 24h change and 24h volume (in the quote currency, on the chosen exchange). Click a column header to sort; click it again to reverse, and a third time to return to the default order.
- **Favorites** (up to 50) are pinned to the top of every list, above a thin line. Drag rows (or use `Alt+↑ ↓`) to reorder them in the Favorites tab. Favorites belong to the asset, not the exchange, so BTC stays a favorite on all three. Assets an exchange doesn't list are just hidden there.
- **Starter favorites:** the 10 largest cryptocurrencies (stablecoins excluded), the 30 largest companies, and 8 broad funds (S&P 500, Nasdaq-100, US total market, international, emerging markets, T-bills, gold, silver). They're chosen by size, not as investment advice. Edit `DEFAULT_FAVORITES` in [src/prefs.ts](src/prefs.ts) to change them.
- **Compare:** "+ Compare" on the chart overlays up to 5 other assets on the selected one (6 lines in all). Each line is rescaled to its first point in the period and shown as % change, so assets with very different prices can be compared. The "ALL" range uses a log scale, because long-run gains differ by orders of magnitude. Legend chips show each asset's change, follow the cursor, and have a × to remove the asset. Assets that start later in the period start from 0 % at their own first point. The comparison is remembered and kept when you select another asset.
- **Keyboard:** `/` search · `↑ ↓` move · `F` favorite · `Alt+↑ ↓` reorder favorites · `← →` inspect the chart.
- **Language:** English or Spanish (`EN`/`ES` in the footer). It starts from the browser's language. Numbers and dates follow it.
- Every setting is saved in `localStorage`. Opening the page from `file://` gives it separate storage from `localhost`, so settings saved in one don't appear in the other.

Spot markets only. Perpetual futures were left out: they're out of scope (no leverage or derivatives), and Kraken Futures blocks browser requests, so they would need a server.

## Data

| What | Kraken | Binance | Coinbase |
|---|---|---|---|
| Asset list (cached 12 h) | REST `AssetPairs` (+ `aclass_base=tokenized_asset` for stocks/ETFs) | REST `exchangeInfo` | REST `products` |
| Live price, 24h change and volume | WebSocket v2 `ticker` | REST `ticker/24hr` snapshot, then WebSocket `!miniTicker@arr` | WebSocket `ticker` (sends the latest on subscribe) |
| Charts | `OHLC`, max 720 candles | `klines`, max 1000 | `candles`, max 300 per request, fetched in pages |
| Rate limit we keep to | 1 request/s | 10 requests/s | ~7 requests/s |

All WebSockets reconnect with backoff and treat 15 s of silence as a dead connection.

| Timeframe | Kraken | Binance | Coinbase |
|---|---|---|---|
| 1D | 5 min | 5 min | 5 min |
| 1W | 15 min | 15 min | 1 h |
| 1M | 4 h | 4 h | 6 h |
| 1Y | 1 day | 1 day | 1 day (2 requests) |
| ALL | 1 week (≈13.8 years max) | 1 week (≈19 years max) | 1 day (up to 20 requests) |

If an asset was listed more recently than the timeframe covers, the chart shows the data that exists and says when it starts. Nothing is ever filled in with made-up prices.

### Statistics

| Statistic | Crypto | Stocks and ETFs (Kraken) |
|---|---|---|
| Market rank, market cap and dominance, global 24h volume, circulating and max supply, all-time high | CoinGecko (top 250 by market cap, in EUR or USD to match the toggle, cached 10 min) | not available |
| Launch date | CoinGecko `genesis_date`, when it has one (cached permanently) | first candle ("On Kraken since") |
| 24h range, 24h volume on the exchange | exchange ticker | exchange ticker |
| 1-year range | exchange daily candles | exchange daily candles |
| Highest price on the exchange | (CoinGecko's all-time high is shown instead) | when the whole history fits in one request |

CoinGecko is matched by ticker symbol. A match is accepted only if CoinGecko's price agrees with the exchange's within 10 % (prices are converted with CoinGecko's own Tether and Euro Coin prices). That way a different coin with the same symbol is never shown. Extra requests only go out once you stay on an asset for 0.6 s. If CoinGecko is rate-limited (its free API allows only a few requests a minute) or offline, those rows are hidden rather than estimated, and come back after a minute. "% of buys" and "24h volume change" aren't shown because no free public source provides them reliably.

### Stocks and ETFs

Kraken's stocks and ETFs are **xStocks**: tokens that track a share or fund, not the share itself. They trade only against USD, so they're priced in USD. Kraken's history for them starts in mid-2025, so 1Y and ALL charts are short, and the chart says when the data starts. Chart requests for them add `asset_class=tokenized_asset`. Which xStocks count as ETFs comes from the hand-kept `ETFS` list in [src/names.ts](src/names.ts), because Kraken doesn't label them.

Exchanges don't publish asset names, so [src/names.ts](src/names.ts) maps common tickers to names. Any other asset is shown by its ticker.

## Code

```
src/types.ts               Market/Ticker/Provider types — the provider seam
src/providers/common.ts    Shared helpers: reconnecting WebSocket, request spacing, candles → chart/stats
src/providers/kraken.ts    Kraken (crypto + tokenized stocks/ETFs)
src/providers/binance.ts   Binance
src/providers/coinbase.ts  Coinbase Exchange
src/coingecko.ts           Crypto fundamentals from CoinGecko (optional enrichment)
src/i18n.ts                English/Spanish strings
src/main.ts                UI state, list, details, statistics, exchange/currency switching
src/chart.ts               Canvas line chart with crosshair
src/format.ts              Number/currency formatting
src/prefs.ts               localStorage preferences
src/style.css              Light/dark theme tokens and layout
vite.config.ts             Inlines JS/CSS into one dist/index.html
```

To add an exchange, implement `Provider` from `types.ts` and register it in `PROVIDERS` at the top of `main.ts` and in the sidebar's exchange selector in `index.html`.
