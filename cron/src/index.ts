import {XMLParser} from 'fast-xml-parser';
import {h32} from 'xxhashjs';
import { DateTime } from "luxon"; 

export interface CurrencyI18n {
	code : string;
	text : string;
}

export interface CurrencyRate {
	i18n : CurrencyI18n[];
	rate : number;
	amount : number;
	code : string;
	rate_date: string;
	validity_date: string; 
}

export interface Env {
	DISABLE_HASH : boolean;
	RATES_REQUEST_URL : string;
	KV_CURRENCIES_RATES: KVNamespace;
}

export default {
	// The scheduled handler is invoked at the interval set in our wrangler.toml's
	// [[triggers]] configuration.
	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
		// Source and informations https://www.rates.bazg.admin.ch/home
		// https://www.backend-rates.bazg.admin.ch/api/xmldaily?d=20230927&locale=en
		const now = new Date();
		//const keys = [...(await env.KV_CURRENCIES_RATES.list()).keys];
		//console.log(`List (${keys.length}): ${JSON.stringify(keys)}`);
		//await env.KV_CURRENCIES_RATES.delete('key_last_request');
		const date = `${now.getFullYear()}${(now.getMonth() +1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
		const response = await fetch(`${env.RATES_REQUEST_URL}&d=${date}`);
		if(response.ok){
			const content = await response.text();
			if (!env.DISABLE_HASH) {
				const hash = h32( content, 0 ).toString();
				const previousHash = await env.KV_CURRENCIES_RATES.get('key_hash');
				if (hash !== previousHash) {
					console.log('Update KV store');
					await parseAndStore(content,env);	
					await env.KV_CURRENCIES_RATES.put('k',hash,{
						metadata: { updated: now.toUTCString() },
					});
				} else {
					console.log(`KV store is up-to-date. Hash: ${previousHash}`);
				}
			} else {
				await parseAndStore(content,env);
			}
		} else {
			console.error(`cron fetch error: ${response.statusText})`);
		}	
	}
}


// https://www.npmjs.com/package/fast-xml-parser
async function parseAndStore(data:string,env: Env): Promise<void> {

	const parser = new XMLParser();
	const jObj = parser.parse(data);

	if (jObj && jObj.wechselkurse && jObj.wechselkurse.devise) {
		const rateDateArray : string[]= jObj.wechselkurse.datum.split('.');
		const rateHourArray : string[]= jObj.wechselkurse.zeit.split(':');
		const validityArray : string[]= jObj.wechselkurse.gueltigkeit.split('.');
		const rateDt = DateTime.fromObject({
			year: Number.parseInt(rateDateArray[2]),
			month: Number.parseInt(rateDateArray[1]),
			day: Number.parseInt(rateDateArray[0]),
			hour: Number.parseInt(rateHourArray[0]),
			minute: Number.parseInt(rateHourArray[1]),
			second: Number.parseInt(rateHourArray[0])}, { zone: 'Europe/Zurich' });
		const validityDt = DateTime.fromObject({
			year: Number.parseInt(validityArray[2]),
			month: Number.parseInt(validityArray[1]),
			day: Number.parseInt(validityArray[0]),
			hour: 23,
			minute: 59,
		  	second: 59 }, { zone: 'Europe/Zurich' });
		const currenciesRates : CurrencyRate[] = [...jObj.wechselkurse.devise.map((currency:any)=>toCurrencyRate(currency,rateDt,validityDt))]; 
		console.log(`${currenciesRates.length} currencies converted.`);
		for (const c of currenciesRates) {
			await env.KV_CURRENCIES_RATES.put(`key_${c.code}`, `${JSON.stringify(c)}`,{
				expiration: validityDt.plus({hours:12}).valueOf() / 1000
			});
		}
		//console.log(`${JSON.stringify((await env.KV_CURRENCIES_RATES.list()).keys)}`);
		console.log(await env.KV_CURRENCIES_RATES.get('key_EUR'));
	} else {
		console.error(`Invalid data. ${data}`)
	}
}

function toCurrencyRate (currency : any,rateDt:DateTime,validityDt:DateTime) : CurrencyRate {
	const i18nTexts : CurrencyI18n[] = [];
			i18nTexts.push(
				{
					code : 'de',
					text : currency.land_de || 'Unbestimmter Text für diese Währung.',
				}
			);
			i18nTexts.push(
				{
					code : 'fr',
					text : currency.land_fr || 'Texte indéfini pour cette devise.',
				}
			);
			i18nTexts.push(
				{
					code : 'it',
					text : currency.land_it || 'Testo indefinito per questa valuta.'
				}
			);
			i18nTexts.push(
				{
					code : 'en',
					text : currency.land_en || 'Testo indefinito per questa valuta.'
				}
			);
			return {
				i18n : i18nTexts,
				amount : Number.parseInt(currency.waehrung.split(' ')[0]) || 1,
				code : currency.waehrung.split(' ')[1] || 'undefined',
				rate : Number.parseFloat(currency.kurs) || 0.0,
				rate_date: rateDt.toISO() || 'undefined',
				validity_date: validityDt.toISO() || 'undefined',
			}
}