export interface CurrencyI18n {
	code : string;
	text : string;
}

export interface CurrencyRate {
	i18n : CurrencyI18n[];
	rate : number;
	amount : number;
	code : string;
	rate_date: string;
	validity_date: string; 
}