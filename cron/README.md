# cron worker

## Dev

### Setup

`npm install wrangler@latest`

`cp wrangler.toml.sample wrangler.toml`


#### cron dependencies

`npm install xxhashjs`

`npm install --save-dev @types/xxhashjs`



## run cron

`npx wrangler dev --test-scheduled`

Initiate an event 

`curl "http://localhost:{port}/__scheduled?cron=*+*+*+*+*"`

## Setup and deploy

`cd cron`

`npx wrangler kv:namespace create KV_CURRENCIES_RATES`

Result: copy id in wrangler.toml
```text
⛅️ wrangler 3.35.0
-------------------
🌀 Creating namespace with title "focbs-rates-cron-KV_CURRENCIES_RATES"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "KV_CURRENCIES_RATES", id = "0187f7b692f44e43bcb0100a242b9b44" }
```
`npx wrangler deploy`

Result:

```text
⛅️ wrangler 3.35.0
-------------------
Your worker has access to the following bindings:
- KV Namespaces:
  - KV_CURRENCIES_RATES: 0f0617c49f3f47e48772003ba2ee8b3f
- Vars:
  - RATES_REQUEST_URL: "https://www.backend-rates.bazg.admin...."
  - DISABLE_HASH: false
  - KEY_PREFIX: "KEY_C_"
Total Upload: 327.26 KiB / gzip: 65.71 KiB
Uploaded focbs-rates-cron (4.47 sec)
Published focbs-rates-cron (2.90 sec)
  https://focbs-rates-cron.i-lab-dgnsi-vd.workers.dev
  schedule: 0 2-6 * * *
Current Deployment ID: fc6b684d-4dc5-xxxx-xxxx-yyyyyyyy
```

## License
The source code is covered by the "BSD-3-Clause" licence. See the file [LICENSE](https://github.com/rbolog/focbs-rates-api/raw/main/LICENSE)