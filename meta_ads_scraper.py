#!/usr/bin/env python3
"""
Meta Ad Library API 스크래핑 스크립트
- Meta Marketing API 사용 (스크래핑 대신 공식 API)
- GitHub Actions에서 실행
- 결과를 Vercel KV에 저장
"""

import os
import sys
import json
import urllib.request
import urllib.parse
import urllib.error
import argparse
import logging
from datetime import datetime, timezone, timedelta

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

# 환경 변수
VERCEL_KV_URL = os.getenv("KV_REST_API_URL")
VERCEL_KV_TOKEN = os.getenv("KV_REST_API_TOKEN")
META_ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN")

# Meta Ad Library API 설정
META_API_VERSION = "v21.0"
META_API_BASE_URL = f"https://graph.facebook.com/{META_API_VERSION}"


def save_to_vercel_kv(key: str, data: dict, ttl: int = 3600):
    """Vercel KV에 데이터 저장 (TTL: 1시간)"""
    if not VERCEL_KV_URL or not VERCEL_KV_TOKEN:
        logger.warning("⚠️ Vercel KV 환경변수가 설정되지 않았습니다.")
        return False

    try:
        # Vercel KV REST API 형식으로 수정
        url = f"{VERCEL_KV_URL}/set/{key}"
        payload = json.dumps(data).encode('utf-8')

        # EX 옵션을 URL에 포함
        url_with_ttl = f"{url}?ex={ttl}"

        req = urllib.request.Request(
            url_with_ttl,
            data=payload,
            headers={
                'Authorization': f'Bearer {VERCEL_KV_TOKEN}',
                'Content-Type': 'application/json'
            },
            method='POST'
        )

        with urllib.request.urlopen(req, timeout=30) as response:
            if response.status == 200:
                logger.info(f"✅ Vercel KV 저장 완료: {key}")
                return True
            else:
                logger.error(f"❌ Vercel KV 저장 실패: HTTP {response.status}")
                return False
    except Exception as e:
        logger.error(f"❌ Vercel KV 저장 오류: {e}")
        return False


def fetch_meta_ads(search_query: str, access_token: str, limit: int = 100, country: str = "KR"):
    """
    Meta Ad Library API를 사용하여 광고 데이터 조회

    API 문서: https://developers.facebook.com/docs/marketing-api/reference/ads_archive/
    """
    logger.info(f"🔍 검색어: {search_query}")
    logger.info(f"🌍 국가: {country}")

    all_ads = []
    next_page_url = None
    page_count = 0
    max_pages = 10  # 최대 페이지 수 제한

    # 기본 API 파라미터 (Ad Library API 형식)
    # ad_reached_countries는 JSON 배열 형식으로 전달
    base_params = {
        'access_token': access_token,
        'search_terms': search_query,
        'ad_reached_countries': f'["{country}"]',
        'ad_active_status': 'ACTIVE',
        'ad_type': 'ALL',
        'fields': ','.join([
            'id',
            'ad_creation_time',
            'ad_creative_bodies',
            'ad_creative_link_captions',
            'ad_creative_link_descriptions',
            'ad_creative_link_titles',
            'ad_delivery_start_time',
            'ad_snapshot_url',
            'bylines',
            'languages',
            'page_id',
            'page_name',
            'publisher_platforms'
        ]),
        'limit': str(limit)
    }

    # 첫 번째 요청 URL 구성
    query_string = urllib.parse.urlencode(base_params, safe='[]"')
    url = f"{META_API_BASE_URL}/ads_archive?{query_string}"

    while url and page_count < max_pages:
        page_count += 1
        logger.info(f"📄 페이지 {page_count} 조회 중...")

        try:
            req = urllib.request.Request(url, method='GET')
            req.add_header('User-Agent', 'Mozilla/5.0')

            with urllib.request.urlopen(req, timeout=60) as response:
                data = json.loads(response.read().decode('utf-8'))

                ads = data.get('data', [])
                all_ads.extend(ads)
                logger.info(f"   → {len(ads)}개 광고 수집 (총 {len(all_ads)}개)")

                # 다음 페이지 URL
                paging = data.get('paging', {})
                url = paging.get('next')

                if not ads:
                    logger.info("📭 더 이상 광고가 없습니다.")
                    break

        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8')
            logger.error(f"❌ API 오류 (HTTP {e.code}): {error_body}")

            # 에러 상세 분석
            try:
                error_data = json.loads(error_body)
                error_msg = error_data.get('error', {}).get('message', '')
                error_code = error_data.get('error', {}).get('code', '')
                logger.error(f"   → 에러 코드: {error_code}")
                logger.error(f"   → 에러 메시지: {error_msg}")
            except:
                pass
            break

        except Exception as e:
            logger.error(f"❌ 요청 오류: {e}")
            break

    logger.info(f"✅ 총 {len(all_ads)}개 광고 수집 완료 ({page_count}페이지)")
    return all_ads, page_count


def process_ads_data(ads: list):
    """광고 데이터를 가공하여 미디어 URL 등 추출"""
    processed_items = []

    for ad in ads:
        item = {
            'id': ad.get('id'),
            'page_name': ad.get('page_name'),
            'page_id': ad.get('page_id'),
            'ad_snapshot_url': ad.get('ad_snapshot_url'),
            'ad_creation_time': ad.get('ad_creation_time'),
            'ad_delivery_start_time': ad.get('ad_delivery_start_time'),
            'platforms': ad.get('publisher_platforms', []),
            'languages': ad.get('languages', []),
            'spend': ad.get('spend'),
            'impressions': ad.get('impressions'),
            'creative': {
                'bodies': ad.get('ad_creative_bodies', []),
                'link_titles': ad.get('ad_creative_link_titles', []),
                'link_descriptions': ad.get('ad_creative_link_descriptions', []),
                'link_captions': ad.get('ad_creative_link_captions', [])
            },
            'bylines': ad.get('bylines')
        }
        processed_items.append(item)

    return processed_items


def main():
    parser = argparse.ArgumentParser(description='Meta Ad Library API 조회')
    parser.add_argument('--query', '-q', type=str, required=True, help='검색어')
    parser.add_argument('--request-id', '-r', type=str, required=True, help='요청 ID (결과 저장용)')
    parser.add_argument('--limit', type=int, default=100, help='페이지당 조회 수 (기본: 100)')
    parser.add_argument('--country', type=str, default='KR', help='국가 코드 (기본: KR)')
    args = parser.parse_args()

    # Access Token 확인
    access_token = META_ACCESS_TOKEN
    if not access_token:
        logger.error("❌ META_ACCESS_TOKEN 환경변수가 설정되지 않았습니다.")
        sys.exit(1)

    logger.info("🚀 Meta Ad Library API 조회 시작")
    logger.info(f"📋 요청 ID: {args.request_id}")

    KST = timezone(timedelta(hours=9))
    start_time = datetime.now(KST)

    try:
        # API로 광고 데이터 조회
        ads, page_count = fetch_meta_ads(
            search_query=args.query,
            access_token=access_token,
            limit=args.limit,
            country=args.country
        )

        # 데이터 가공
        processed_items = process_ads_data(ads)

        end_time = datetime.now(KST)

        result = {
            'success': True,
            'requestId': args.request_id,
            'searchQuery': args.query,
            'country': args.country,
            'totalItems': len(processed_items),
            'pageCount': page_count,
            'items': processed_items,
            'startTime': start_time.isoformat(),
            'endTime': end_time.isoformat(),
            'duration': (end_time - start_time).total_seconds()
        }

        # Vercel KV에 저장
        kv_key = f"meta-ads:{args.request_id}"
        save_to_vercel_kv(kv_key, result, ttl=3600)  # 1시간 TTL

        # 결과 출력
        logger.info("=" * 50)
        logger.info(f"✅ 조회 완료!")
        logger.info(f"📊 검색어: {args.query}")
        logger.info(f"📢 수집된 광고: {len(processed_items)}개")
        logger.info(f"⏱️ 소요 시간: {result['duration']:.1f}초")
        logger.info("=" * 50)

        # JSON 결과 파일 저장 (GitHub Actions artifact용)
        result_file = f"meta_ads_result_{args.request_id}.json"
        with open(result_file, 'w', encoding='utf-8') as f:
            json.dump(result, ensure_ascii=False, indent=2, fp=f)
        logger.info(f"📁 결과 파일 저장: {result_file}")

    except Exception as e:
        logger.error(f"❌ 조회 실패: {e}")
        import traceback
        traceback.print_exc()

        error_result = {
            'success': False,
            'requestId': args.request_id,
            'searchQuery': args.query,
            'error': str(e),
            'endTime': datetime.now(KST).isoformat()
        }

        # 에러도 KV에 저장
        kv_key = f"meta-ads:{args.request_id}"
        save_to_vercel_kv(kv_key, error_result, ttl=3600)

        sys.exit(1)


if __name__ == "__main__":
    main()
