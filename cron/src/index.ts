/**
 * Cloudflare Worker - FOCBS Currency Rates Cron Job
 *
 * Fetches daily currency exchange rates from the Federal Office for
 * Customs and Border Security (FOCBS/BAZG) XML API and stores them
 * in Cloudflare KV.
 *
 * Source: https://www.rates.bazg.admin.ch/home
 *
 * @license BSD-3-Clause
 */

import { XMLParser } from 'fast-xml-parser';
import { h32 } from 'xxhashjs';
import { DateTime } from 'luxon';
import { CurrencyI18n, CurrencyRate } from '../../commons/types';

/** Raw XML <devise> element shape produced by fast-xml-parser */
interface RawDevise {
	land_de?: string;
	land_fr?: string;
	land_it?: string;
	land_en?: string;
	waehrung: string;
	kurs: string | number;
}

/** Worker environment bindings defined in wrangler.toml */
export interface Env {
	/** When true, skip hash comparison and always update KV */
	DISABLE_HASH: boolean;
	/** FOCBS XML API endpoint for daily exchange rates */
	RATES_REQUEST_URL: string;
	/** KV namespace storing currency rate entries */
	KV_CURRENCIES_RATES: KVNamespace;
	/** Prefix used for KV keys (e.g. "KEY_C_") */
	KEY_PREFIX: string;
}

export default {
	/**
	 * Scheduled handler triggered by cron configuration.
	 *
	 * Workflow:
	 * 1. Build the request URL with today's date (YYYYMMDD format).
	 * 2. Fetch the XML feed from the FOCBS backend.
	 * 3. If hashing is enabled, compare the response hash with the
	 *    previously stored one to avoid redundant KV writes.
	 * 4. Parse the XML and persist each currency rate into KV.
	 */
	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
		// Format today's date as YYYYMMDD for the API query parameter
		const now = DateTime.now().setZone('Europe/Zurich');
		const reqDate = now.toFormat('yyyyMMdd');

		// Example: https://www.backend-rates.bazg.admin.ch/api/xmldaily?locale=en&d=20230927
		const requestUrl = `${env.RATES_REQUEST_URL}&d=${reqDate}`;

		let response: Response;
		try {
			response = await fetch(requestUrl);
		} catch (error) {
			console.error(`Cron fetch failed: ${error instanceof Error ? error.message : String(error)}`);
			return;
		}

		if (!response.ok) {
			console.error(`Cron fetch error: ${response.status} ${response.statusText}`);
			return;
		}

		const content = await response.text();

		if (!env.DISABLE_HASH) {
			// Compute a fast xxHash-32 digest of the response body
			const hash = h32(content, 0).toString();
			const previousHash = await env.KV_CURRENCIES_RATES.get('KEY_HASH');

			if (hash !== previousHash) {
				// Content changed since last run — update the KV store
				console.info('Update KV store');
				await parseAndStore(content, env);

				// Persist the new hash with a 24-hour TTL
				await env.KV_CURRENCIES_RATES.put('KEY_HASH', hash, {
					expirationTtl: 86400,
					metadata: { updated: now.toISO() },
				});
			} else {
				// No change detected — skip KV writes
				console.info(`KV store is up-to-date. Hash: ${previousHash}`);
			}
		} else {
			// Hash check disabled — always parse and store
			await parseAndStore(content, env);
		}
	},
};

/**
 * Parse the FOCBS XML response and persist each currency rate to KV.
 *
 * The XML structure looks like:
 * ```xml
 * <wechselkurse>
 *   <datum>03.11.2023</datum>
 *   <zeit>03:05:01</zeit>
 *   <gueltigkeit>04.11.2023,05.11.2023,06.11.2023</gueltigkeit>
 *   <devise code="eur">…</devise>
 *   …
 * </wechselkurse>
 * ```
 *
 * @see https://www.npmjs.com/package/fast-xml-parser
 */
async function parseAndStore(data: string, env: Env): Promise<void> {
	const parser = new XMLParser();
	const parsed = parser.parse(data);

	if (!parsed?.wechselkurse?.devise) {
		console.error(`Invalid data. ${data}`);
		return;
	}

	// --- Extract the rate publication date and time (Zurich timezone) ---
	// XML field <datum> uses DD.MM.YYYY format
	const rateDateArray: string[] = parsed.wechselkurse.datum.split('.');
	// XML field <zeit> uses HH:mm:ss format
	const rateHourArray: string[] = parsed.wechselkurse.zeit.split(':');

	const rateDt = DateTime.fromObject(
		{
			year: Number.parseInt(rateDateArray[2], 10),
			month: Number.parseInt(rateDateArray[1], 10),
			day: Number.parseInt(rateDateArray[0], 10),
			hour: Number.parseInt(rateHourArray[0], 10),
			minute: Number.parseInt(rateHourArray[1], 10),
			second: Number.parseInt(rateHourArray[2], 10),
		},
		{ zone: 'Europe/Zurich' },
	);

	// --- Determine the validity period ---
	// On weekends and public holidays the field <gueltigkeit> contains a
	// comma-separated list of dates (e.g. "04.11.2023,05.11.2023,06.11.2023").
	// We pick the latest date as the expiration boundary.
	const validityDates: DateTime[] = parsed.wechselkurse.gueltigkeit.split(',').map((i: string) => {
		const validityArray: string[] = i.split('.');
		return DateTime.fromObject(
			{
				year: Number.parseInt(validityArray[2], 10),
				month: Number.parseInt(validityArray[1], 10),
				day: Number.parseInt(validityArray[0], 10),
				hour: 23,
				minute: 59,
				second: 59,
			},
			{ zone: 'Europe/Zurich' },
		);
	});

	// Keep only the furthest validity date (max)
	const validityDt = validityDates.reduce((a, c) => {
		return a.valueOf() >= c.valueOf() ? a : c;
	});

	// --- Convert each XML <devise> element into a typed CurrencyRate ---
	const currenciesRates: CurrencyRate[] = parsed.wechselkurse.devise.map((currency: RawDevise) =>
		toCurrencyRate(currency, rateDt, validityDt),
	);
	console.info(`${currenciesRates.length} currencies converted.`);

	// --- Persist all rates to KV in parallel ---
	// Each key follows the pattern <PREFIX><CODE> (e.g. KEY_C_EUR).
	// Entries expire 6 hours after the last validity date to provide a
	// grace period before the next scheduled update.
	const kvExpiration = Math.floor(validityDt.plus({ hours: 6 }).valueOf() / 1000);
	const allRequests: Promise<void | null>[] = currenciesRates.map((c) =>
		env.KV_CURRENCIES_RATES.put(`${env.KEY_PREFIX}${c.code}`.toUpperCase(), JSON.stringify(c), {
			expiration: kvExpiration,
		}),
	);

	await Promise.all(allRequests);
}

/**
 * Map a raw XML <devise> element to a strongly-typed {@link CurrencyRate}.
 *
 * XML example:
 * ```xml
 * <devise code="eur">
 *   <land_de>Europäische Währungsunion</land_de>
 *   <land_fr>Union monétaire européenne</land_fr>
 *   <land_it>Unione Monetaria Europea</land_it>
 *   <land_en>Euro Member</land_en>
 *   <waehrung>1 EUR</waehrung>
 *   <kurs>0.97213</kurs>
 * </devise>
 * ```
 *
 * @param currency   - Raw parsed devise object from fast-xml-parser
 * @param rateDt     - DateTime when the rate was published
 * @param validityDt - DateTime until which the rate is valid
 * @returns A normalized CurrencyRate with i18n labels
 */
function toCurrencyRate(currency: RawDevise, rateDt: DateTime, validityDt: DateTime): CurrencyRate {
	// Build multilingual country/region labels with fallback defaults
	const i18nTexts: CurrencyI18n[] = [
		{
			code: 'de',
			text: currency.land_de || 'Unbestimmter Text für diese Währung.',
		},
		{
			code: 'fr',
			text: currency.land_fr || 'Texte indéfini pour cette devise.',
		},
		{
			code: 'it',
			text: currency.land_it || 'Testo indefinito per questa valuta.',
		},
		{
			code: 'en',
			text: currency.land_en || 'Undefined text for this currency.',
		},
	];

	// The <waehrung> field contains the unit amount and ISO currency code
	// separated by a space (e.g. "1 EUR", "100 JPY").
	const [rawAmount, currencyCode] = currency.waehrung.split(' ');

	return {
		i18n: i18nTexts,
		amount: Number.parseInt(rawAmount, 10) || 1,
		code: currencyCode || 'undefined',
		rate: Number.parseFloat(String(currency.kurs)) || 0.0,
		rate_date: rateDt.toISO() || 'undefined',
		validity_date: validityDt.toISO() || 'undefined',
	};
}
