ASSET_TYPE_CURRENCY = {
    'a_stock': 'CNY',
    'hk_stock': 'HKD',
    'us_stock': 'USD',
    'crypto': 'USD',
    'commodity': 'USD',
    'otc_fund': 'CNY',
}


def currency_for_asset_type(asset_type):
    return ASSET_TYPE_CURRENCY.get(asset_type, 'USD')
