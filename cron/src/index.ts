import {XMLParser} from 'fast-xml-parser';
import { DateTime } from "luxon"; 
//import type {  } from '@types/luxon';

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
	RATES_REQUEST_URL : string;
	KV_CURRENCIES_RATES: KVNamespace;
	// Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
	// MY_KV_NAMESPACE: KVNamespace;
	//
	// Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
	// MY_DURABLE_OBJECT: DurableObjectNamespace;
	//
	// Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
	// MY_BUCKET: R2Bucket;
	//
	// Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
	// MY_SERVICE: Fetcher;
	//
	// Example binding to a Queue. Learn more at https://developers.cloudflare.com/queues/javascript-apis/
	// MY_QUEUE: Queue;
	//
	// Example binding to a D1 Database. Learn more at https://developers.cloudflare.com/workers/platform/bindings/#d1-database-bindings
	// DB: D1Database
}

export default {
	// The scheduled handler is invoked at the interval set in our wrangler.toml's
	// [[triggers]] configuration.
	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
		// Source and informations https://www.rates.bazg.admin.ch/home
		// https://www.backend-rates.bazg.admin.ch/api/xmldaily?d=20230927&locale=en
		const now = new Date();
		const date = `${now.getFullYear()}${(now.getMonth() +1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
		const response = await fetch(`${env.RATES_REQUEST_URL}&d=${date}`);
		if(response.ok){
			parseAndStore(await response.text(),env);	
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
		// jObj.wechselkurse.devise.forEach((object : any) => {
		for (const object of jObj.wechselkurse.devise) {
			const i18nTexts : CurrencyI18n[] = [];
			i18nTexts.push(
				{
					code : 'de',
					text : object.land_de || 'Unbestimmter Text für diese Währung.',
				}
			);
			i18nTexts.push(
				{
					code : 'fr',
					text : object.land_fr || 'Texte indéfini pour cette devise.',
				}
			);
			i18nTexts.push(
				{
					code : 'it',
					text : object.land_it || 'Testo indefinito per questa valuta.'
				}
			);
			i18nTexts.push(
				{
					code : 'en',
					text : object.land_en || 'Testo indefinito per questa valuta.'
				}
			);
			const item : CurrencyRate = {
				i18n : i18nTexts,
				amount : Number.parseInt(object.waehrung.split(' ')[0]) || 1,
				code : object.waehrung.split(' ')[1] || 'undefined',
				rate : Number.parseFloat(object.kurs) || 0.0,
				rate_date: rateDt.toISO() || 'undefined',
				validity_date: validityDt.toISO() || 'undefined',
			};
			
			await env.KV_CURRENCIES_RATES.put(`key_${item.code}`, `${JSON.stringify(item)}`, {
				expiration: validityDt.plus({ days: 1 }).toJSDate().getMilliseconds()
			});

			//console.log(`---> put key_${item.code}`);
			
		};

	} else {
		console.error(`Invalid data. ${data}`)
	}
}
