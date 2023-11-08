import { DateTime, Interval } from "luxon"
import {CurrencyI18n,CurrencyRate} from "../../commons/types" 
import currency from "currency.js";

const currency_helper = currency;


export interface Env {
	KV_CURRENCIES_RATES: KVNamespace;
	KEY_PREFIX : string;
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
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const objectName = url.pathname.slice(1);

		// Construct the cache key from the URL
		const cacheKey = new Request(url.toString(), request);
		const cache = caches.default;
		// Check whether the value is already available in the cache
		// if not, you will need to fetch it from origin, and store it in the cache
		const cacheResponse = await cache.match(cacheKey);
		if (cacheResponse) {
			return cacheResponse;
		}

		if (objectName === 'favicon.ico') {
			return new Response(null, {
				status: 204
			});
		}

		if (request.method === 'GET') {
			// Allowed parameters
			let amount : number | null = null;
			let currency : string | null = null;
			let currency_target : string | null = null;
			let all : boolean = false;
			// Extract parameters
			const queryString = url.search.slice(1).split('&').forEach((i)=>{
				const p = i.split('=');
				if (p[0].toLowerCase() === 'amount') {
					amount = Number.parseFloat(p[1])
				} else if (p[0].toLowerCase() === 'currency') {
					currency = p[1].toUpperCase();
				} else if (p[0].toLowerCase() === 'currency_target') {
					currency_target = p[1].toUpperCase();
				} else if (p[0].toLowerCase() === 'all') {
					all = true;
				}
			});

			const headers = new Headers();
			headers.append('content-type', 'text/json; charset=UTF-8');
			const eTag = await env.KV_CURRENCIES_RATES.get('KEY_HASH');

			if (eTag) {
				headers.append('ETag', eTag);
			}

			if (all) {
				const kv_list = await env.KV_CURRENCIES_RATES.list({ prefix: env.KEY_PREFIX });
				const currencies : CurrencyRate[] = [];
				if (kv_list.list_complete) {
					for (const k of kv_list.keys) {
						const c : CurrencyRate | null = await env.KV_CURRENCIES_RATES.get(k.name,{ type: 'json' });
						if (c) {
							currencies.push(c);
						}
					}
					headers.append('Cache-Control', 'public,immutable,s-maxage=3600');
					const response = new Response(JSON.stringify(currencies), {
						headers,
						status: 200
					});
					// Put response in cache
					ctx.waitUntil(cache.put(cacheKey, response.clone()));
					return response;
				}
			} else if (currency && !currency_target  && !amount) {
				const currencyRate : CurrencyRate | null = await env.KV_CURRENCIES_RATES.get(`${env.KEY_PREFIX}${currency}`,{ type: 'json' });
				if (currencyRate) {
					const s_maxage = Interval.fromDateTimes(DateTime.now(),DateTime.fromISO(currencyRate.validity_date)).length('seconds');
					headers.append('Last-Modified', currencyRate.rate_date);
					headers.append('Cache-Control', `public,immutable,s-maxage=${s_maxage.toFixed()}`);
					const response = new Response(JSON.stringify(currencyRate), {
						headers,
						status: 200
					});
					// Put response in cache
					ctx.waitUntil(cache.put(cacheKey, response.clone()));
					return response;
				} else {
					return new Response(`${currency} not found`, {
						status: 404
					});
				}
			} else if (currency && currency_target && amount) {
				const tCHF = currency_target === 'CHF' ? true : false; 
				const currencyRate : CurrencyRate | null = await env.KV_CURRENCIES_RATES.get(`${env.KEY_PREFIX}${tCHF ? currency : currency_target}`,{ type: 'json' });
				if (currencyRate ) {
					const rate : number = tCHF ? 1.0 / currencyRate.rate : currencyRate.rate;
					//const value = currency_calculator(currencyRate.amount).multiply(rate).multiply(amount) ;
					const value = currency_helper(currencyRate.amount * rate * amount);
					const response = new Response(`{"from" : {"currency": "${currency}","amount" : ${currency_helper(amount)}},"to" : {"currency": "${currency_target}","amount" : ${value}}}`, {
						headers,
						status: 200
					});
					// Put response in cache
					ctx.waitUntil(cache.put(cacheKey, response.clone()));
					return response;
				} else {
					return new Response(`${tCHF ? currency : currency_target} not found`, {
						status: 404});	
				}
			}
		}

		// Finally it isn't a valid request
		return new Response(`Invalid request. ${JSON.stringify(request)}`, {
			status: 400
		});

	},
};
