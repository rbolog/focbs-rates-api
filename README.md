# focbs-rates-api
Federal Office for Customs and Border Security FOCBS Daily rates (exchange rates) as an API

## Purpose
This small project was used to demonstrate the use of Cloudflare workers as part of a quick and easy API implementation. The (real) example provides exchange rate data from the Swiss Federal Customs Office. The data is published as an xml once a day, which we transformed into a REST API

[Federal Office for Customs and Border Security FOCBS](https://www.rates.bazg.admin.ch/home)

## Project structure

### Cron worker

#### Purpose

Periodically extract data from the federal site, transform it, and store each element in a Cloudflare key/value store.

#### Project README

`./cron/README.md`

### API worker

#### Purpose

API implemention, using Cloudflare worker

#### Project README

`./api/README.md`

### Requests samples

```shell
#export URL='http://localhost:8787/'
export URL='https://ratesapi.ilab-dgnsi-vd.ch'

curl -s "${URL}/all" | jq
curl -s "${URL}/currency/eur" | jq
curl -s "${URL}/currency/exist/clp" | jq
curl -s "${URL}/rate/?to=usd&amount=100.50" | jq
curl -s "${URL}/rate/?from=usd&to=chf&amount=100" | jq
```

Notes:

1. [jq is a lightweight and flexible command-line JSON processor](https://jqlang.github.io/jq/)
1. The `https://ratesapi.ilab-dgnsi-vd.ch` url is currently restricted to Switzerland.
    a. This service is for demonstration purposes only. There is no guarantee of availability.    


## General information

The **wrangler.toml** configuration file is not included; you need to create one for each project. **wrangler.toml.sample** can be used as the base for each project. 
The KV base is shared, so you need the same **id** in both **wrangler.toml** configuration files.

```toml
[[kv_namespaces]]
binding = "KV_CURRENCIES_RATES"
id = ""
#preview_id = ""
```

### Minimum tools

A development environment with

* Cloudflare account
* nodejs, npm | see [nvm](https://github.com/nvm-sh/nvm) it may help
* [wrangler](https://developers.cloudflare.com/workers/wrangler/)
* Optionnal
    * Online [Postman](https://www.postman.com/kurdy/workspace/ilab-focbs-rates-api)
    * Offline and local [newman](https://www.npmjs.com/package/newman#newman-run-collection-file-source-options)


## Documentation

* [Cloudflare Workers](https://developers.cloudflare.com/workers/)

## Terms and conditions of use of the data
See Terms and conditions of use of the data from offical site: [https://www.rates.bazg.admin.ch/home](https://www.rates.bazg.admin.ch/home)

## License
The source code is covered by the "BSD-3-Clause" licence. See the file [LICENSE](https://github.com/rbolog/focbs-rates-api/raw/main/LICENSE)