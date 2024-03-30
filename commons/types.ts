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

export interface Error {
	error_date : string;
	error_message: string;
}

export interface PairRate {
	from : {
		currency : string;
		amount : string;
	};
	to : {
		currency : string;
		amount : string;
	};
	validity : {
		request_date : string;
		rate_validity : string;
	};
	rate : [number,number];
}