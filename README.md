# Minimal Market Explorer

A small, fast, browser-only explorer for Kraken spot markets. No backend, no accounts, no API keys.

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # static files in dist/
```

## Using it

- **Left:** tabs for Favorites (the default), Crypto, Stocks and ETFs. Search covers every asset type. Click a column header to sort; click it again to reverse, and a third time to go back to your own order.
- **Starter favorites:** the 10 largest cryptocurrencies (stablecoins excluded), the 30 largest companies, and 8 broad funds (S&P 500, Nasdaq-100, US total market, international, emerging markets, T-bills, gold, silver). They're chosen by size, not as investment advice. Edit `DEFAULT_FAVORITES` in [src/prefs.ts](src/prefs.ts) to change them.
- **Keyboard:** `/` search · `↑ ↓` move · `F` favorite · `Alt+↑ ↓` reorder favorites · `← →` inspect the chart.
- **Favorites:** star up to 50. Drag rows (or use `Alt+↑ ↓`) to reorder them.
- Favorites, list view, sort, selected asset, timeframe and theme are saved in `localStorage`.

## Data

All data comes from Kraken's public API, called from the browser (Kraken allows CORS):

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

### Stocks and ETFs

Kraken's stocks and ETFs are **xStocks**: tokens that track a share or fund, not the share itself. They trade only against USD, so they're priced in USD. Kraken's history for them starts in mid-2025, so 1Y and ALL charts are short, and the chart says when the data starts. Chart requests for them add `asset_class=tokenized_asset`. Which xStocks count as ETFs comes from the hand-kept `ETFS` list in [src/names.ts](src/names.ts), because Kraken doesn't label them.

Kraken does not publish asset names, so [src/names.ts](src/names.ts) maps common tickers to names. Any other asset is shown by its ticker.

## Code

```
src/types.ts    Market/Ticker/Provider types — the provider seam
src/kraken.ts   Kraken provider (REST + WebSocket, request spacing)
src/main.ts     UI state, list, details, events
src/chart.ts    Canvas line chart with crosshair
src/format.ts   Number/currency formatting
src/prefs.ts    localStorage preferences
src/style.css   Light/dark theme tokens and layout
```

To add another provider, implement `Provider` from `types.ts` and swap it in at the top of `main.ts`.
