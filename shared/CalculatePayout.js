const FIELDS = {
    AUTHOR_GOLOS: 'author_golos_payout_value',
    AUTHOR_GBG: 'author_gbg_payout_value',
    AUTHOR_GESTS: 'author_gests_payout_value',
    BENEF_GESTS: 'beneficiary_gests_payout_value',
    BENEF_GBG: 'beneficiary_payout_value',
    CURAT_GESTS: 'curator_gests_payout_value',
    CURAT_GBG: 'curator_payout_value',
    TOTAL_GBG: 'total_payout_value',
};

const FIELDS_PENDING = {
    AUTHOR_GOLOS: 'pending_author_payout_golos_value',
    AUTHOR_GBG: 'pending_author_payout_gbg_value',
    AUTHOR_GESTS: 'pending_author_payout_gests_value',
    BENEF_GESTS: 'pending_benefactor_payout_gests_value',
    BENEF_GBG: 'pending_benefactor_payout_value',
    CURAT_GESTS: 'pending_curator_payout_gests_value',
    CURAT_GBG: 'pending_curator_payout_value',
    TOTAL_GBG: 'total_pending_payout_value',
};

const zeroedPayout = {
    isPending: false,
    total: 0,
    totalGbg: 0,
    overallTotal: 0,
    limitedOverallTotal: 0,
    author: 0,
    authorGbg: 0,
    curator: 0,
    benefactor: 0,
    isLimit: false,
    isDeclined: false,
};

function calculateGolosPerGbg() {
    //if (!result.isPending) {
    //    const dateRates = rates.dates.get(result.lastPayout);

    //    if (dateRates) {
    //        return dateRates.GBG.GOLOS;
    //    } else {
    //        result.needLoadRatesForDate = result.lastPayout;
    //    }
    //}
    // TODO Браты GBG с внутреннего рынка
    const gbgPerGolos = 0.53

    return 1 / gbgPerGolos;
}

function extractFields(data, fieldsList) {
    const extract = field => parseFloat(data.get(field, 0));

    return {
        benefGests: extract(fieldsList.BENEF_GESTS),
        benefGbg: extract(fieldsList.BENEF_GBG),
        curatGests: extract(fieldsList.CURAT_GESTS),
        curatGbg: extract(fieldsList.CURAT_GBG),
        authorGbg: extract(fieldsList.AUTHOR_GBG),
        authorGolos: extract(fieldsList.AUTHOR_GOLOS),
        authorGests: extract(fieldsList.AUTHOR_GESTS),
    };
}


export default function (data) {

  const result = { ...zeroedPayout };

  result.lastPayout = data.get('last_payout');
  const max = parseFloat(data.get('max_accepted_payout', 0));

  // Date may be "1970-01-01..." or "1969-12-31..." in case of pending payout
  result.isPending = !result.lastPayout || result.lastPayout.startsWith('19');
  result.isDeclined = max === 0;

  const fieldsList = result.isPending ? FIELDS_PENDING : FIELDS;
  const totalGbg = parseFloat(data.get(fieldsList.TOTAL_GBG, 0));

  result.isLimit = max != null && totalGbg > max;
  result.cashoutTime = data.get('cashout_time');

  if (totalGbg === 0 || result.isDeclined) {
      return result;
  }

  const fields = extractFields(data, fieldsList);

  const authorTotalGbg = totalGbg - fields.benefGbg;

  // percent_steem_dollars stores in format like 10000, it's mean 100.00%.
  // We divide on 10000 for converting to multiplier. (100.00% = 1)
  const payoutPercent = data.get('percent_steem_dollars') / 10000;
  const golosPowerFraction = payoutPercent / 2;

  let golosPerGbg =
      fields.authorGolos / (authorTotalGbg * golosPowerFraction - fields.authorGbg);

  if (!golosPerGbg) {
      golosPerGbg = calculateGolosPerGbg();
  }

  let gestsPerGolos;

  if (fields.authorGests) {
      gestsPerGolos =
          fields.authorGests / (authorTotalGbg * golosPerGbg * (1 - golosPowerFraction));
  } else {
      let gestsPerGbg;

      if (fields.curatGests) {
          gestsPerGbg = fields.curatGests / fields.curatGbg;
      } else if (fields.benefGests) {
          gestsPerGbg = fields.benefGests / fields.benefGbg;
      }

      if (!gestsPerGbg) {
          // Not enough values for calculation, it means what values are 0
          return result;
      }

      gestsPerGolos = gestsPerGbg / golosPerGbg;
  }

  result.author = fields.authorGolos + fields.authorGests / gestsPerGolos;
  result.authorGbg = fields.authorGbg;
  result.curator = fields.curatGests / gestsPerGolos;
  result.benefactor = fields.benefGests / gestsPerGolos;
  result.total = result.author + result.curator + result.benefactor;
  result.totalGbg = fields.authorGbg;
  result.overallTotal = result.total + result.totalGbg * golosPerGbg;
  result.limitedOverallTotal = result.isLimit ? max * golosPerGbg : result.overallTotal;

  return result;
}
