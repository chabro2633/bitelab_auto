#!/usr/bin/env python3
"""
간단한 테스트 스크립트 - 로그인만 테스트
"""

import os
import sys
from playwright.sync_api import sync_playwright
import logging

# 로깅 설정
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# 환경 변수에서 설정 읽기
EMAIL = os.getenv("EMAIL", "tei.cha@bitelab.co.kr")
PASSWORD = os.getenv("PASSWORD", "qkfmsj123")

def test_login():
    """로그인 테스트"""
    logger.info("🧪 로그인 테스트 시작")
    
    with sync_playwright() as p:
        # 브라우저 실행 (헤드리스 모드)
        browser = p.chromium.launch(
            headless=True,
            args=[
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor'
            ]
        )
        
        try:
            context = browser.new_context()
            page = context.new_page()
            
            logger.info("🌐 Cigro 웹사이트 접속 중...")
            page.goto("https://app.cigro.io")
            
            # 페이지 로딩 대기
            page.wait_for_load_state('networkidle', timeout=15000)
            logger.info("✅ 페이지 로딩 완료")
            
            # 페이지 제목 확인
            title = page.title()
            logger.info(f"📄 페이지 제목: {title}")
            
            # 현재 URL 확인
            current_url = page.url
            logger.info(f"🔗 현재 URL: {current_url}")
            
            # 이메일 입력 필드 찾기
            email_selectors = [
                'input[type="email"]',
                'input[name="email"]',
                'input[placeholder*="email" i]',
                'input[placeholder*="이메일" i]'
            ]
            
            email_found = False
            for selector in email_selectors:
                try:
                    element = page.wait_for_selector(selector, timeout=3000)
                    if element:
                        logger.info(f"✅ 이메일 필드 발견: {selector}")
                        email_found = True
                        break
                except:
                    continue
            
            if not email_found:
                logger.error("❌ 이메일 입력 필드를 찾을 수 없습니다.")
                logger.info("🔍 페이지 소스 일부:")
                content = page.content()
                logger.info(content[:1000])  # 처음 1000자만 출력
                return False
            
            logger.info("✅ 로그인 테스트 성공")
            return True
            
        except Exception as e:
            logger.error(f"❌ 로그인 테스트 실패: {e}")
            return False
        finally:
            browser.close()

if __name__ == "__main__":
    success = test_login()
    sys.exit(0 if success else 1)
