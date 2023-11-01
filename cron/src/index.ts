import {XMLParser} from 'fast-xml-parser'

export interface CurrencyI18n {
	lang : string;
	text : string;
}

export interface Currency {
	rate : number;
	amount : number;
	id : string;
}

export interface Env {
	RATES_REQUEST_URL : string;
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
			parseAndStore(await response.text());	
		} else {
			console.error(`cron fetch error: ${response.statusText})`);
		}	
	}
}


// https://www.npmjs.com/package/fast-xml-parser
async function parseAndStore(data:string): Promise<void> {

	const parser = new XMLParser();
	let jObj = parser.parse(data);

	console.log(JSON.stringify(jObj));
}
