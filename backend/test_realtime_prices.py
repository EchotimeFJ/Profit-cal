import sys
import time

sys.path.insert(0, '/Users/frankjia/project/Profit_Cal/backend')

from services.price_fetcher import PriceFetcher


TEST_CASES = [
    ('000858.SZ', 'a_stock', 'A股-五粮液'),
    ('600519.SS', 'a_stock', 'A股-贵州茅台'),
    ('0700.HK', 'hk_stock', '港股-腾讯控股'),
    ('9988.HK', 'hk_stock', '港股-阿里巴巴'),
    ('AAPL', 'us_stock', '美股-Apple'),
    ('MSFT', 'us_stock', '美股-Microsoft'),
    ('BTC', 'crypto', '加密货币-BTC'),
    ('ETH', 'crypto', '加密货币-ETH'),
    ('GC=F', 'commodity', '黄金期货'),
    ('CL=F', 'commodity', 'WTI原油'),
    ('NG=F', 'commodity', '天然气'),
]


def main():
    print('=' * 80)
    print('实时价格源测试')
    print('=' * 80)

    success = 0
    failed = 0
    total_start = time.perf_counter()

    for symbol, asset_type, name in TEST_CASES:
        start = time.perf_counter()
        price_data = PriceFetcher.get_price(symbol, asset_type)
        elapsed = time.perf_counter() - start

        if price_data:
            success += 1
            print(
                f"✅ {name:16s} {symbol:10s} "
                f"{price_data['currency']:>4s} {price_data['current_price']:>12.4f} "
                f"prev={price_data['previous_close']:<12.4f} "
                f"source={price_data.get('source')} "
                f"time={price_data.get('quote_time')} "
                f"elapsed={elapsed:.2f}s"
            )
        else:
            failed += 1
            print(f"❌ {name:16s} {symbol:10s} 获取失败 elapsed={elapsed:.2f}s")

    total_elapsed = time.perf_counter() - total_start
    print('-' * 80)
    print(f"总计: ✅ {success} 成功, ❌ {failed} 失败, 总耗时 {total_elapsed:.2f}s")


if __name__ == '__main__':
    main()
