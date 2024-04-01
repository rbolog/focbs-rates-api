# API worker

## Purpose

API implemention, using Cloudflare worker

## OpenAPI specification

* `api/openapi-focbs-rates-api.yaml`
* [Online Postman](https://www.postman.com/kurdy/workspace/ilab-focbs-rates-api/api/e3cd3b10-3a20-4210-bd41-cfa516514dab?action=share&creator=25110830)

## Dev

### Setup

`cd ./api`

If you have not already done so `npm install wrangler --save-dev`

`cp wrangler.toml.sample wrangler.toml`

Setup Id from cron wrangler `../cron/wrangler.toml`

```toml
[[kv_namespaces]]
binding = "KV_CURRENCIES_RATES"
id = "xxxx"
#preview_id = "yyy"
```

`npm install`

### run dev

Cron worker should be deployed and kv store should have data

`npx wrangler dev --remote`

## Deploy

`npx wrangler deploy`

## Tests

### Command line

```shell
export URL='http://localhost:8787/'
#export URL='https://ratesapi.ilab-dgnsi-vd.ch'

curl -s "${URL}/all" | jq
curl -s "${URL}/currency/eur" | jq
curl -s "${URL}/currency/exist/clp" | jq
curl -s "${URL}/rate/?to=usd&amount=100.50" | jq
curl -s "${URL}/rate/?from=usd&to=chf&amount=100" | jq
```

### Using newman

#### Test locally 
* Run local `newman run version\ 0.2.x.postman_collection.json -e CF-WRANGLER-DEV -e CF-WRANGLER-DEV.postman_environment.json`

## License
The source code is covered by the "BSD-3-Clause" licence. See the file [LICENSE](https://github.com/rbolog/focbs-rates-api/raw/main/LICENSE)