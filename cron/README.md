# cron worker

## Purpose

Periodically extract data from the federal site, transform it, and store each element in a Cloudflare key/value store.

## Dev

### Setup

`cd ./cron`

If you have not already done so `npm install wrangler --save-dev`

`cp wrangler.jsonc.sample wrangler.jsonc`

`npm install`

#### Create key/value store

[documentation](https://developers.cloudflare.com/kv/get-started/)

`npx wrangler kv:namespace create KV_CURRENCIES_RATES`

Result: **copy id in wrangler.jsonc**

### run cron

`npx wrangler dev --test-scheduled`

Initiate an event

`curl "http://localhost:{port}/__scheduled?cron=*+*+*+*+*"`

### Deploy

`npx wrangler deploy  --env=""`

Result:

```text
⛅️ wrangler 4.73.0
───────────────────
Total Upload: 361.48 KiB / gzip: 75.18 KiB
Worker Startup Time: 2 ms
Your Worker has access to the following bindings:
Binding                                                                   Resource
env.KV_CURRENCIES_RATES (...)                KV Namespace
env.RATES_REQUEST_URL ("https://www.backend-rates.bazg.admin....")        Environment Variable
env.DISABLE_HASH (false)                                                  Environment Variable
env.KEY_PREFIX ("KEY_C_")                                                 Environment Variable

Uploaded focbs-rates-cron (14.64 sec)
Deployed focbs-rates-cron triggers (6.76 sec)
 https://focbs-rates-cron.i-lab-dgnsi-vd.workers.dev
 schedule: 15 12 * * *
 schedule: 0 2-6 * * *
Current Version ID: b2db8804-7698-4044-b9fc-..
```

## License
The source code is covered by the "BSD-3-Clause" licence. See the file [LICENSE](https://github.com/rbolog/focbs-rates-api/raw/main/LICENSE)
