import { DateTime, Interval } from "luxon"
import {CurrencyRate,PairRate,Error} from "../../commons/types" 
import currency from "currency.js";

const currency_helper = currency;

/**
 * Environment variable set in wrangler.toml
 */
export interface Env {
	KV_CURRENCIES_RATES: KVNamespace; // Key Value cloudflare name space
	KEY_PREFIX : string; // Key prefix use to filter currency
}

/**
 * Entry point
 * Manage favicon, cache, GET method and queries 
 * See https://developers.cloudflare.com/workers/runtime-apis/cache/
 */

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const requestHeaders = request.clone().headers;
		const objectName = url.pathname.slice(1);
		const query : string = url.search.slice(1);
		const info = {
			cf_ipcountry : requestHeaders.get("cf-ipcountry"),
			x_real_ip : requestHeaders.get("x-real-ip"),
			mf_original_url : requestHeaders.get("mf-original-url"),
			timestamp : Date.now()
		}

		// First level of request validation.
		if (query.length > 50) {
			console.error(JSON.stringify(info));
			return buildErrorResponse('Bad request. code:0x00',400);
		}
		if (objectName.length > 25) {
			console.error(JSON.stringify(info));
			return buildErrorResponse('Bad request. code:0x01',400);
		}
		if (objectName.split('/').length > 4) {
			console.error(JSON.stringify(info));
			return buildErrorResponse('Bad request. code:0x02',400);
		}

		// Return a response to this request to avoid errors. When using a browser
		if (objectName === 'favicon.ico') {
			return new Response(null, {
				status: 204 
			});
		}

		// Construct the cache key from the URL
		const cacheKey = request.clone();
		const cache = caches.default;
		// Check whether the value is already available in the cache
		// if not, you will need to fetch it from origin, and store it in the cache
		const cacheResponse = await cache.match(cacheKey);
		if (cacheResponse) {
			return cacheResponse;
		}

		// The Api accept only GET
		if (request.method === 'GET') {
			// Create Helper that need request and CloudFlare Env
			const focbsApi = new FocbsApi(objectName, query.split('&'),env);
			// Handles the request
			await focbsApi.process();
			// read the response
			const rsp = focbsApi.getResponse();
			// Log some informations about request that generate error 
			if (rsp.status >= 400) {
				const msg = {
					content : await rsp.clone().json(),
					info : info,
				}
				console.error(JSON.stringify(msg));
			} else {
				// Put response in cache
				ctx.waitUntil(cache.put(cacheKey, rsp.clone()));	
			}
			// Return the response
			return rsp;
		}

		return new Response(`${request.method} Method Not Allowed`, {
			status: 405
		});
	}
}

/**
 * Helper class that manage requests.
 */
class FocbsApi {
	private objectName : string | null;
	private amount : number | null = null;
	private from : string | null = null;
	private to : string | null = null;
	private code : string | null = null;
	private response : Response | null;
	private headers : Headers | null;
	private env: Env | null;


	constructor(objectName: string,query:string[], env: Env) {
		this.env = env;
		this.objectName = objectName.toLowerCase();
		query.forEach((i)=>{
			const p = i.split('=');
			if (p[0].toLowerCase() === 'amount') {
				this.amount = Number.parseFloat(p[1])
			} else if (p[0].toLowerCase() === 'from') {
				this.from = p[1].toUpperCase();
			} else if (p[0].toLowerCase() === 'to') {
				this.to = p[1].toUpperCase();
			}
		});

		this.headers = new Headers();
		this.headers.append('content-type', 'text/json; charset=UTF-8');
		
	} // End of constructor

	public async process() : Promise<void> {
		const objectNameItems = this.objectName.toLowerCase().split('/');
		const regex = /^[A-Z]{3}$/;

		// Parameters validation
		if (!this.amount && this.to) {
			this.response = buildErrorResponse('Bad request. amount is not a number',400);
			return;
		}
		
		if (this.from && !this.from.toUpperCase().match(regex)) {
			this.response = buildErrorResponse('Bad request. Invalid from',400);
			return;
		}
		
		if (this.to && !this.to.toUpperCase().match(regex)) {
			this.response = buildErrorResponse('Bad request. Invalid to',400);
			return;
		}

		if (this.code && !this.code.toUpperCase().match(regex)) {
			this.response = buildErrorResponse('Bad request. Invalid code',400);
			return;
		}

		if (objectNameItems[0] === 'all') {
			await this.getAll();
		} else if(objectNameItems[0] === 'currency' && objectNameItems[1] === 'exist') {
			this.code = objectNameItems[2].toUpperCase();
			await this.isCurrencyExist();
		} else if(objectNameItems[0] === 'currency') {
			this.code = objectNameItems[1].toUpperCase();
			await this.getCurrency();
		} else if(objectNameItems[0] === 'rate') {
			await this.getPairRate();
		} else {
			this.response = buildErrorResponse('Bad request',400);	
		}
	}// End of process 

	public getResponse() : Response {
		return this.response instanceof Response ? this.response : buildErrorResponse('Bad request. code:0xFF',400);
	}// End of getResponse 

	private async getAll() : Promise<void>{
		const keys = await this.listKeys();
		if (keys.list_complete) {
			const allRequests : Promise<string | null>[] = [];
			for (const k of keys.keys) {
				allRequests.push(this.getKv(k.name,true));
			}
			const currencies : CurrencyRate[] = await Promise.all(allRequests);
			const eTag = await this.getKv('KEY_HASH',true);
			this.headers.append('ETag', eTag);
			this.headers.append('Cache-Control', 'public,immutable,s-maxage=3600');
			this.response = new Response(JSON.stringify(currencies), {
				headers: this.headers,
				status: 200
			});	
		} else {
			this.response = buildErrorResponse('Incomplete list.',500);
		}
	}
	
	private async getCurrency() : Promise<void> {
		const currencyRate : CurrencyRate | null = await this.getKv(this.code);
		if (currencyRate) {
			const s_maxage = Interval.fromDateTimes(DateTime.now(),DateTime.fromISO(currencyRate.validity_date)).length('seconds');
			this.headers.append('Last-Modified', currencyRate.rate_date);
			this.headers.append('Cache-Control', `public,immutable,s-maxage=${s_maxage.toFixed()}`);
			this.response = new Response(JSON.stringify(currencyRate), {
				headers: this.headers,
				status: 200
			});
		} else {
			this.response = buildErrorResponse(`${this.code} not found`,404);
		}
	}
	
	private async getPairRate (): Promise<void> {
		const defaultCurrency = 'CHF';
		const defaultRate: [number,number]  = [1.0,1.0];
		let value : number = this.amount;
		let validity : string = "Not determined";
		let usedRate = defaultRate;
		
		if (!this.from) {
			this.from = defaultCurrency;
		}
		
		if (this.from !== this.to) {
			const currencyRate: CurrencyRate | null = this.from === defaultCurrency ? await this.getKv(this.to) : await this.getKv(this.from); 
			const isValid: boolean = currencyRate && this.from && this.to && (this.to === defaultCurrency || this.from === defaultCurrency);
		
			if (isValid) {
				const rate = this.to === defaultCurrency ? 1.0 / currencyRate.rate : currencyRate.rate;
				const rateAmount = this.to === defaultCurrency ? 1.0 / currencyRate.amount : currencyRate.amount;
				value = currency_helper(rateAmount * rate * this.amount); 
				validity = currencyRate.validity_date;
				usedRate = [rate,rateAmount]; 
			} else {
				this.response = buildErrorResponse(`Currencies pair are invalid. From = ${this.from} To = ${this.to}.`,400);
				return;
			}
		} 
		
		if (!(this.response instanceof Response)) {
			const content: PairRate = {
			from: {
				currency: this.from,
				amount: currency_helper(this.amount, currency_format).format(),
			},
			to: {
				currency: this.to,
				amount: currency_helper(value, currency_format).format(),
			},
			validity: {
				request_date: DateTime.now().setZone('Europe/Zurich').toISO(),
				validity_date: validity,
			},
			rate: usedRate,
			};
			
			this.response = new Response(JSON.stringify(content), {
			headers: this.headers,
			status: 200
			});	
		}
	}

	private async isCurrencyExist () : Promise<void> {
		const value = await this.getKv(this.code);
		const content = {
			currency_code : this.code,
			is_exist : value !== null,
		};
		this.response = new Response(JSON.stringify(content), {
			headers: this.headers,
			status: 200
		});
	}

	private getKv(key : string,noPrefix : boolean = false) : Promise<string | null> {
		const keyValue = noPrefix ? key : `${this.env.KEY_PREFIX}${key}`; 
		return this.env.KV_CURRENCIES_RATES.get(keyValue,{ type: 'json' })
	}

	private listKeys() : Promise<unknown | null> {
		return this.env.KV_CURRENCIES_RATES.list({ prefix: this.env.KEY_PREFIX });
	}
}


/**
 * Some helpers
 */

const buildErrorResponse = (msg : string = "Undefined. 😖", status : number = 418) : Response => {
	const content : Error = {
		error_date : DateTime.now().setZone('Europe/Zurich').toISO(),
		error_msg : msg,
	};
	return new Response(JSON.stringify(content), {
		status: status});
} 

const currency_format = { precision: 2, decimal: '.',separator: '', pattern: '#' };