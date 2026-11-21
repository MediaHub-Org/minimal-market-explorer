# Minimal Market Explorer

A small, fast, browser-only explorer for Kraken spot markets. No backend, no accounts, no API keys.

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # writes dist/index.html
```

The build is a single self-contained file: JS and CSS are inlined into `dist/index.html`. You can open it straight from disk (`file:///…/dist/index.html`) with no server. Kraken and CoinGecko both accept requests from `file://` pages. `dist/` is not committed, so run `npm run build` after pulling changes.

## Using it

- **Left:** tabs for Favorites (the default), Crypto, Stocks and ETFs. Search covers every asset type. Click a column header to sort; click it again to reverse, and a third time to go back to your own order.
- **Starter favorites:** the 10 largest cryptocurrencies (stablecoins excluded), the 30 largest companies, and 8 broad funds (S&P 500, Nasdaq-100, US total market, international, emerging markets, T-bills, gold, silver). They're chosen by size, not as investment advice. Edit `DEFAULT_FAVORITES` in [src/prefs.ts](src/prefs.ts) to change them.
- **Keyboard:** `/` search · `↑ ↓` move · `F` favorite · `Alt+↑ ↓` reorder favorites · `← →` inspect the chart.
- **Favorites:** star up to 50. Drag rows (or use `Alt+↑ ↓`) to reorder them.
- **Language:** English or Spanish (`EN`/`ES` button in the footer). It starts from the browser's language. Numbers and dates follow the chosen language.
- Favorites, list view, sort, selected asset, timeframe, theme and language are saved in `localStorage`. Opening the page from `file://` gives it separate storage from `localhost`, so settings saved in one don't appear in the other.

## Data

Prices and charts come from Kraken's public API, called from the browser:

| What                       | Source                                                                                                    |
|----------------------------|-----------------------------------------------------------------------------------------------------------|
| Asset list                 | REST `AssetPairs` (crypto) and `AssetPairs?aclass_base=tokenized_asset` (stocks, ETFs). One market per asset, preferring EUR, then USD, USDC, USDT, BTC, ETH. Cached for 12 h. |
| Live price and 24 h change | WebSocket v2 `ticker` (rolling 24 h), reconnects with backoff                                             |
| Charts                     | REST `OHLC`, at most 720 candles per request                                                              |

| Timeframe | Candle | Notes                                                                                  |
|-----------|--------|----------------------------------------------------------------------------------------|
| 1D        | 5 min  |                                                                                        |
| 1W        | 15 min |                                                                                        |
| 1M        | 4 h    |                                                                                        |
| 1Y        | 1 day  |                                                                                        |
| ALL       | 1 week | Covers about 13.8 years. If the 720-candle cap cuts off older data, the chart says so. |

If an asset was listed more recently than the timeframe covers, the chart shows the data that exists and says when it starts. Nothing is ever filled in with made-up prices.

### Statistics

| Statistic | Crypto | Stocks and ETFs |
|---|---|---|
| Market rank, market cap and dominance, global 24h volume, circulating and max supply, all-time high | CoinGecko (top 500 by market cap, cached 10 min) | not available |
| Launch date | CoinGecko `genesis_date`, when it has one (cached permanently) | first Kraken candle ("On Kraken since") |
| 24h range, 24h volume on Kraken | Kraken ticker | Kraken ticker |
| 1-year range | Kraken daily OHLC | Kraken daily OHLC |
| Highest price on Kraken | (CoinGecko's all-time high is shown instead) | Kraken daily OHLC, when its whole history fits in 720 days |

CoinGecko is matched by ticker symbol. A match is accepted only if CoinGecko's price agrees with Kraken's within 10 %, so a different coin with the same symbol is never shown. CoinGecko figures are in EUR. Extra requests only go out once you stay on an asset for 0.6 s. If CoinGecko is rate-limited or offline, those rows are hidden rather than estimated. "% of buys" and "24h volume change" aren't shown because no free public source provides them reliably.

### Stocks and ETFs

Kraken's stocks and ETFs are **xStocks**: tokens that track a share or fund, not the share itself. They trade only against USD, so they're priced in USD. Kraken's history for them starts in mid-2025, so 1Y and ALL charts are short, and the chart says when the data starts. Chart requests for them add `asset_class=tokenized_asset`. Which xStocks count as ETFs comes from the hand-kept `ETFS` list in [src/names.ts](src/names.ts), because Kraken doesn't label them.

Kraken does not publish asset names, so [src/names.ts](src/names.ts) maps common tickers to names. Any other asset is shown by its ticker.

## Code

```
src/types.ts    Market/Ticker/Provider types — the provider seam
src/kraken.ts   Kraken provider (REST + WebSocket, request spacing)
src/coingecko.ts Crypto fundamentals from CoinGecko (optional enrichment)
src/i18n.ts     English/Spanish strings
src/main.ts     UI state, list, details, statistics, events
src/chart.ts    Canvas line chart with crosshair
src/format.ts   Number/currency formatting
src/prefs.ts    localStorage preferences
src/style.css   Light/dark theme tokens and layout
```

To add another provider, implement `Provider` from `types.ts` and swap it in at the top of `main.ts`.
