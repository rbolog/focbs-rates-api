import {XMLParser} from 'fast-xml-parser';
import {h32} from 'xxhashjs';
import { DateTime } from "luxon"; 
import {CurrencyI18n,CurrencyRate} from "../../commons/types" 

export interface Env {
	DISABLE_HASH : boolean;
	RATES_REQUEST_URL : string;
	KV_CURRENCIES_RATES: KVNamespace;
	KEY_PREFIX : string;
}

export default {
	// The scheduled handler is invoked at the interval set in our wrangler.toml's
	// [[triggers]] configuration.
	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
		// Source and informations https://www.rates.bazg.admin.ch/home
		// https://www.backend-rates.bazg.admin.ch/api/xmldaily?d=20230927&locale=en
		const now = new Date();
		const reqDate = `${now.getFullYear()}${(now.getMonth() +1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
		const request = `${env.RATES_REQUEST_URL}&d=${reqDate}`;
		console.debug(`request=${request}`);
		const response = await fetch(request);
		if(response.ok){
			const content = await response.text();
			if (!env.DISABLE_HASH) {
				const hash = h32( content, 0 ).toString();
				const previousHash = await env.KV_CURRENCIES_RATES.get('KEY_HASH');
				if (hash !== previousHash) {
					console.info('Update KV store');
					await parseAndStore(content,env);	
					await env.KV_CURRENCIES_RATES.put('KEY_HASH',hash,{
						metadata: { updated: now.toUTCString(),
						expirationTtl: 86400},
					});
				} else {
					console.info(`KV store is up-to-date. Hash: ${previousHash}`);
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
		const rateDateArray : string[]= jObj.wechselkurse.datum.split('.');	// <datum>03.11.2023</datum>
		const rateHourArray : string[]= jObj.wechselkurse.zeit.split(':'); 	// <zeit>03:05:01</zeit>
		const rateDt = DateTime.fromObject({
			year: Number.parseInt(rateDateArray[2]),
			month: Number.parseInt(rateDateArray[1]),
			day: Number.parseInt(rateDateArray[0]),
			hour: Number.parseInt(rateHourArray[0]),
			minute: Number.parseInt(rateHourArray[1]),
			second: Number.parseInt(rateHourArray[0])}, 
			{ zone: 'Europe/Zurich' });
		const validityDates : DateTime[]= jObj.wechselkurse.gueltigkeit.split(',').map((i:string) =>{
				const validityArray : string[]= i.split('.');
				return DateTime.fromObject({
					year: Number.parseInt(validityArray[2]),
					month: Number.parseInt(validityArray[1]),
					day: Number.parseInt(validityArray[0]),
					hour: 23,
					minute: 59,
					second: 59}, 
					{ zone: 'Europe/Zurich' });
			}); // weekends and public holidays there could be an array <gueltigkeit>04.11.2023,05.11.2023,06.11.2023</gueltigkeit>
		const validityDt = validityDates.reduce((a,c)=>{
			return a.valueOf() >= c.valueOf() ? a : c;
		});
		const currenciesRates : CurrencyRate[] = [...jObj.wechselkurse.devise.map((currency:any)=>toCurrencyRate(currency,rateDt,validityDt))]; 
		console.info(`${currenciesRates.length} currencies converted.`);
		const allRequests : Promise<void | null>[] = [];
		for (const c of currenciesRates) {
			allRequests.push(env.KV_CURRENCIES_RATES.put(`KEY_C_${c.code}`.toUpperCase(), `${JSON.stringify(c)}`,{
				expiration: validityDt.plus({hours:6}).valueOf() / 1000
			}));
			await Promise.all(allRequests);
		}
	} else {
		console.error(`Invalid data. ${data}`)
	}
}

function toCurrencyRate (currency : any,rateDt:DateTime,validityDt:DateTime) : CurrencyRate {
	/**
	 	<devise code="eur">
			<land_de>Europäische Währungsunion</land_de>
			<land_fr>Union monétaire européenne</land_fr>
			<land_it>Unione Monetaria Europea</land_it>
			<land_en>Euro Member</land_en>
			<waehrung>1 EUR</waehrung>
			<kurs>0.97213</kurs>
		</devise>
	*/
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