import { DateTime, Interval } from "luxon"
import {CurrencyI18n,CurrencyRate,PairRate,Error} from "../../commons/types" 
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
		}

		// Return a response to this request to avoid errors. When using a browser
		if (objectName === 'favicon.ico') {
			return new Response(null, {
				status: 204 
			});
		}

		// validate parameters
		const validationResponse = validateQuery(query);
		if (validationResponse instanceof Response) {
			const msg = {
				content : await validationResponse.clone().json(),
				info : info,
				}
			console.error(JSON.stringify(msg));
			return validationResponse;
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
			const focbsApi = new FocbsApi(query.split('&'),env);
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
 * Helper class that manage queries.
 * The possible queries are:
 * - ?all
 * - ?currency={code}
 * - ?currency={code}&currency_target={code}&amount={value}
 * - ?currency_target={code}&amount={value}
 * The query above uses the default parameter currency=CHF
 */
class FocbsApi {
	private amount : number | null = null;
	private currency : string | null = null;
	private currency_exist : string | null = null;
	private currency_target : string | null = null;
	private all : boolean = false;
	private response : Response | null;
	private headers : Headers | null;
	private env: Env | null;

	constructor(query:string[], env: Env) {
		this.env = env;
		query.forEach((i)=>{
			const p = i.split('=');
			if (p[0].toLowerCase() === 'amount') {
				this.amount = Number.parseFloat(p[1])
			} else if (p[0].toLowerCase() === 'currency') {
				this.currency = p[1].toUpperCase();
			} else if (p[0].toLowerCase() === 'currency_exist') {
				this.currency_exist = p[1].toUpperCase();
			} else if (p[0].toLowerCase() === 'currency_target') {
				this.currency_target = p[1].toUpperCase();
			} else if (p[0].toLowerCase() === 'all') {
				this.all = true;
			}
		});

		this.headers = new Headers();
		this.headers.append('content-type', 'text/json; charset=UTF-8');
		
	} // End of constructor

	public async process() : Promise<void> {
		if (this.all) {
			await this.getAll();
		} else if (this.currency_exist) {
			await this.isCurrencyExist();
		} else if (this.currency && !this.currency_target  && !this.amount) {
			await this.getCurrency();
		} else if (this.currency_target && this.amount) {
			await this.getPairRate();
		} else {
			this.response = buildErrorResponse('Bad request',400);	
		}
	}// End of process 

	public getResponse() : Response {
		return this.response instanceof Response ? this.response : buildErrorResponse('Bad request. code:0xFF',400);
	}// End of getResponse 

	private async getAll() : Promise<void>{
		const keys : any = await this.listKeys();
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
		const currencyRate : CurrencyRate | null = await this.getKv(this.currency);
		if (currencyRate) {
			const s_maxage = Interval.fromDateTimes(DateTime.now(),DateTime.fromISO(currencyRate.validity_date)).length('seconds');
			this.headers.append('Last-Modified', currencyRate.rate_date);
			this.headers.append('Cache-Control', `public,immutable,s-maxage=${s_maxage.toFixed()}`);
			this.response = new Response(JSON.stringify(currencyRate), {
				headers: this.headers,
				status: 200
			});
		} else {
			this.response = buildErrorResponse(`${this.currency} not found`,404);
		}
	}
	
	private async getPairRate (): Promise<void> {
		const defaultCurrency = 'CHF';
		const defaultRate: [number,number]  = [1.0,1.0];
		let value : number = this.amount;
		let validity : string = "Not determined";
		let usedRate = defaultRate;
		
		if (!this.currency) {
			this.currency = defaultCurrency;
		}
		
		if (this.currency !== this.currency_target) {
			const currencyRate: CurrencyRate | null = this.currency === defaultCurrency ? await this.getKv(this.currency_target) : await this.getKv(this.currency); 
			const isValid: boolean = currencyRate && this.currency && this.currency_target && (this.currency_target === defaultCurrency || this.currency === defaultCurrency);
		
			if (isValid) {
				const rate = this.currency_target === defaultCurrency ? 1.0 / currencyRate.rate : currencyRate.rate;
				value = currency_helper(currencyRate.amount * rate * this.amount); 
				validity = currencyRate.validity_date;
				usedRate = [rate,currencyRate.amount]; 
			} else {
				this.response = buildErrorResponse(`Currencies pair are invalid. From = ${this.currency} To = ${this.currency_target}.`,400);
				return;
			}
		} 
		
		if (!(this.response instanceof Response)) {
			const content: PairRate = {
			from: {
				currency: this.currency,
				amount: currency_helper(this.amount, currency_format).format(),
			},
			to: {
				currency: this.currency_target,
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
		const value = await this.getKv(this.currency_exist);
		const content = {
			currency_code : this.currency_exist,
			is_exist : value !== null,
		};
		this.response = new Response(JSON.stringify(content), {
			headers: this.headers,
			status: 200
		});
	}

	private getKv(key : string,noPrefix : boolean = false) : Promise<string | null> {
		const keyValue = noPrefix ? key : `${this.env.KEY_PREFIX}${key}`; 
		console.log(keyValue);
		return this.env.KV_CURRENCIES_RATES.get(keyValue,{ type: 'json' })
	}

	private listKeys() : Promise<any | null> {
		return this.env.KV_CURRENCIES_RATES.list({ prefix: this.env.KEY_PREFIX });;
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

const validateQuery = (query : string) : Response | null => {
	let response : Response | null = null
	// Avoid an huge request
	if (query.length > 100) {
		return buildErrorResponse('Bad request. code:0x00',400);
	}

	// Now check parameters
	const entries: string [] = query.split('&');
	if(entries.length > 3) {
		return buildErrorResponse('Bad request. code:0x01',400);
	}

	const regex = /^[A-Z]{3}$/;
	for (let i of entries) {
		const [key, value] = i.split('=');
		const lowerCaseKey = key.toLowerCase();

		if (lowerCaseKey === 'amount' && Number.isNaN(Number.parseFloat(value))) {
			return buildErrorResponse('Bad request. code:0x02',400);
		}
		
		if (lowerCaseKey === 'currency' && !value.toUpperCase().match(regex)) {
			return buildErrorResponse('Bad request. code:0x03',400);
		}
		
		if (lowerCaseKey === 'currency_target' && !value.toUpperCase().match(regex)) {
			return buildErrorResponse('Bad request. code:0x04',400);
		}
	}

	return null;
};

const currency_format = { precision: 2, decimal: '.',separator: '', pattern: '#' };