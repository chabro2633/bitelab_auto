#!/usr/bin/env python3
"""
Meta Ads Library 스크래핑 스크립트
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
from playwright.sync_api import sync_playwright

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

def save_to_vercel_kv(key: str, data: dict, ttl: int = 3600):
    """Vercel KV에 데이터 저장 (TTL: 1시간)"""
    if not VERCEL_KV_URL or not VERCEL_KV_TOKEN:
        logger.warning("⚠️ Vercel KV 환경변수가 설정되지 않았습니다.")
        return False

    try:
        url = f"{VERCEL_KV_URL}/set/{key}"
        payload = json.dumps(data).encode('utf-8')

        req = urllib.request.Request(
            url,
            data=payload,
            headers={
                'Authorization': f'Bearer {VERCEL_KV_TOKEN}',
                'Content-Type': 'application/json'
            },
            method='POST'
        )

        # TTL 설정
        req.add_header('ex', str(ttl))

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


def scrape_meta_ads(search_query: str, max_scroll: int = 15, scroll_pause: float = 2.0):
    """Meta Ads Library에서 광고 미디어 수집"""
    logger.info(f"🔍 검색어: {search_query}")

    media_items = []

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        )

        context = browser.new_context(
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport={'width': 1920, 'height': 1080}
        )

        page = context.new_page()

        # Meta Ads Library URL
        encoded_query = urllib.parse.quote(search_query)
        url = f"https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=KR&is_targeted_country=false&media_type=all&q={encoded_query}&search_type=keyword_unordered"

        logger.info(f"📄 페이지 로딩: {url}")
        page.goto(url, wait_until='networkidle', timeout=60000)
        page.wait_for_timeout(3000)

        # 스크롤 다운
        logger.info(f"📜 스크롤 시작 (최대 {max_scroll}회)...")
        scroll_count = 0
        prev_height = 0

        for i in range(max_scroll):
            prev_height = page.evaluate("document.body.scrollHeight")
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            page.wait_for_timeout(int(scroll_pause * 1000))

            new_height = page.evaluate("document.body.scrollHeight")
            scroll_count = i + 1

            if new_height == prev_height:
                logger.info(f"📜 스크롤 완료 (더 이상 콘텐츠 없음): {scroll_count}회")
                break

        logger.info(f"📜 스크롤 완료: {scroll_count}회")

        # 미디어 수집
        logger.info("🖼️ 미디어 수집 중...")

        seen_urls = set()

        # 이미지 수집
        images = page.query_selector_all('img')
        for img in images:
            try:
                src = img.get_attribute('src')
                if not src:
                    continue

                # 필터링
                skip_keywords = ['safe_image.php', 'profilepic', 'logo', 'fbcdn-profile', 'emoji', 'rsrc.php', 'static']
                if any(kw in src for kw in skip_keywords):
                    continue

                # 작은 이미지 제외
                width = img.get_attribute('width')
                if width and int(width) < 100:
                    continue

                if src not in seen_urls:
                    seen_urls.add(src)
                    box = img.bounding_box()
                    media_items.append({
                        'url': src,
                        'type': 'image',
                        'width': int(box['width']) if box else None,
                        'height': int(box['height']) if box else None
                    })
            except Exception as e:
                logger.debug(f"이미지 처리 오류: {e}")

        # 비디오 수집
        videos = page.query_selector_all('video')
        for video in videos:
            try:
                src = video.get_attribute('src')
                if src and src not in seen_urls:
                    seen_urls.add(src)
                    media_items.append({
                        'url': src,
                        'type': 'video'
                    })

                # source 태그 확인
                sources = video.query_selector_all('source')
                for source in sources:
                    src = source.get_attribute('src')
                    if src and src not in seen_urls:
                        seen_urls.add(src)
                        media_items.append({
                            'url': src,
                            'type': 'video'
                        })
            except Exception as e:
                logger.debug(f"비디오 처리 오류: {e}")

        browser.close()

    logger.info(f"✅ 미디어 수집 완료: {len(media_items)}개")
    return media_items, scroll_count


def main():
    parser = argparse.ArgumentParser(description='Meta Ads Library 스크래핑')
    parser.add_argument('--query', '-q', type=str, required=True, help='검색어')
    parser.add_argument('--request-id', '-r', type=str, required=True, help='요청 ID (결과 저장용)')
    parser.add_argument('--max-scroll', type=int, default=15, help='최대 스크롤 횟수')
    args = parser.parse_args()

    logger.info("🚀 Meta Ads 스크래핑 시작")
    logger.info(f"📋 요청 ID: {args.request_id}")

    KST = timezone(timedelta(hours=9))
    start_time = datetime.now(KST)

    try:
        media_items, scroll_count = scrape_meta_ads(
            search_query=args.query,
            max_scroll=args.max_scroll
        )

        end_time = datetime.now(KST)

        result = {
            'success': True,
            'requestId': args.request_id,
            'searchQuery': args.query,
            'totalItems': len(media_items),
            'scrollCount': scroll_count,
            'items': media_items,
            'startTime': start_time.isoformat(),
            'endTime': end_time.isoformat(),
            'duration': (end_time - start_time).total_seconds()
        }

        # Vercel KV에 저장
        kv_key = f"meta-ads:{args.request_id}"
        save_to_vercel_kv(kv_key, result, ttl=3600)  # 1시간 TTL

        # 결과 출력 (GitHub Actions 로그용)
        logger.info("=" * 50)
        logger.info(f"✅ 스크래핑 완료!")
        logger.info(f"📊 검색어: {args.query}")
        logger.info(f"🖼️ 수집된 미디어: {len(media_items)}개")
        logger.info(f"⏱️ 소요 시간: {result['duration']:.1f}초")
        logger.info("=" * 50)

        # JSON 결과 출력 (디버깅용)
        print(json.dumps(result, ensure_ascii=False, indent=2))

    except Exception as e:
        logger.error(f"❌ 스크래핑 실패: {e}")

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
