# focbs-rates-cron
Federal Office for Customs and Border Security FOCBS Daily rates (exchange rates) as an API

## Purpose
This small project was used to demonstrate the use of Cloudflare workers as part of a quick and easy API implementation. The (real) example provides exchange rate data from the Swiss Federal Customs Office. The data is published as an xml once a day, which we transformed into a REST API
[Federal Office for Customs and Border Security FOCBS](https://www.rates.bazg.admin.ch/home)

## Dev

### Setup

`npm install wrangler@latest`


### Documentation

* [Cloudflare Workers](https://developers.cloudflare.com/workers/)


## Terms and conditions of use of the data
See Terms and conditions of use of the data from offical site: [https://www.rates.bazg.admin.ch/home](https://www.rates.bazg.admin.ch/home)

## License
The source code is covered by the "BSD-3-Clause" licence. See the file [LICENSE](https://github.com/rbolog/focbs-rates-api/raw/main/LICENSE)