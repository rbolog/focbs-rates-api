#!/bin/bash

test -z $1 && URL='http://localhost:8787/' || URL=$1

OK='\033[0;32m\t😎 OK\033[0m'
NOK='\033[0;31m\t😱 NOK\033[0m'

test $(curl -s "${URL}?all" | jq '. | length') -eq 74 && echo -e "1)$OK" || echo -e "1)$NOK ?all"
#74

test $(curl -s "${URL}?currency=EUR" | jq '. | length') -eq 6 && echo -e "2)$OK" || echo -e "2)$NOK ?currency=EUR"
#6

test $(curl -s "${URL}?currency=EUR" | jq -r '.code') = 'EUR' && echo -e "3)$OK" || echo -e "3)$NOK ?currency=EUR .code"
#"EUR"

test $(bc <<< $(curl -s "${URL}?currency=EUR" | jq '.rate')'>0.8')  -ne 0 && echo -e "4)$OK" || echo -e "4)$NOK ?currency=EUR .rate"
#0.97574

test $(date -d $(curl -s "${URL}?currency=EUR" | jq -r '.rate_date') +%s) -gt 1709247600 && echo -e "5)$OK" || echo -e "5)$NOK ?currency=EUR .rate_date"
#"2024-03-20T03:05:03.000+01:00"

test $(curl -s "${URL}?currency=CHF&currency_target=CLP&amount=1000" | jq '. | length') -eq 4 && echo -e "6)$OK" || echo -e "6)$NOK ?currency=CHF&currency_target=CLP&amount=1000"
#2

test $(curl -s "${URL}?currency=CHF&currency_target=CLP&amount=1000" | jq -r '.from.currency') = 'CHF' && echo -e "7)$OK" || echo -e "7)$NOK ?currency=CHF&currency_target=CLP&amount=1000 .from.currency"
#"CHF"

test $(curl -s "${URL}?currency=CHF&currency_target=CLP&amount=1000" | jq -r '.to.currency') = 'CLP' && echo -e "8)$OK" || echo -e "8)$NOK ?currency=CHF&currency_target=CLP&amount=1000 .to.currency"
#"CLP"

test $(curl -s "${URL}?currency=CHF&currency_target=CLP&amount=1000" | jq '.from.amount')  = '1000.00' && echo -e "9)$OK" || echo -e "9)$NOK ?currency=CHF&currency_target=CLP&amount=1000 .from.amount"
#1000.00

test $(bc <<< $(curl -s "${URL}?currency=CHF&currency_target=CLP&amount=1000" | jq '.to.amount')'>500000.0') -ne 0 && echo -e "10)$OK" || echo -e "10)$NOK ?currency=CHF&currency_target=CLP&amount=1000 .to.amount"
#929200.00

test $(bc <<< $(curl -s "${URL}?currency=EUR&currency_target=EUR&amount=1" | jq '.to.amount')'==1.0') -ne 0 && echo -e "11)$OK" || echo -e "11)$NOK ?currency=EUR&currency_target=EUR&amount=1  .to.amount"
#{"from" : {"currency": "EUR","amount" : 1.00},"to" : {"currency": "EUR","amount" : 0.98}}