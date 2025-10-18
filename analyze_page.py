#!/usr/bin/env python3
"""
로그인 페이지 구조 분석 스크립트
"""

import os
from playwright.sync_api import sync_playwright
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

EMAIL = os.getenv("EMAIL", "tei.cha@bitelab.co.kr")
PASSWORD = os.getenv("PASSWORD", "qkfmsj123")

def analyze_login_page():
    """로그인 페이지 구조를 분석합니다."""
    logger.info("🔍 로그인 페이지 구조 분석 시작")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        
        try:
            page.goto("https://app.cigro.io")
            page.wait_for_load_state('networkidle', timeout=15000)
            
            logger.info(f"📄 페이지 제목: {page.title()}")
            logger.info(f"🔗 현재 URL: {page.url}")
            
            # 모든 버튼 찾기
            buttons = page.query_selector_all('button')
            logger.info(f"🔘 발견된 버튼 수: {len(buttons)}")
            
            for i, button in enumerate(buttons):
                try:
                    text = button.inner_text().strip()
                    button_type = button.get_attribute('type')
                    logger.info(f"  버튼 {i+1}: '{text}' (type: {button_type})")
                except:
                    pass
            
            # 모든 클릭 가능한 요소 찾기
            clickable_elements = page.query_selector_all('[role="button"], .clickable-element, [onclick]')
            logger.info(f"🖱️ 클릭 가능한 요소 수: {len(clickable_elements)}")
            
            for i, element in enumerate(clickable_elements[:10]):  # 처음 10개만
                try:
                    text = element.inner_text().strip()
                    role = element.get_attribute('role')
                    class_name = element.get_attribute('class')
                    logger.info(f"  요소 {i+1}: '{text}' (role: {role}, class: {class_name})")
                except:
                    pass
            
            # 폼 요소 찾기
            forms = page.query_selector_all('form')
            logger.info(f"📝 발견된 폼 수: {len(forms)}")
            
            inputs = page.query_selector_all('input')
            logger.info(f"📝 발견된 입력 필드 수: {len(inputs)}")
            
            for i, input_elem in enumerate(inputs):
                try:
                    input_type = input_elem.get_attribute('type')
                    input_name = input_elem.get_attribute('name')
                    input_placeholder = input_elem.get_attribute('placeholder')
                    logger.info(f"  입력 {i+1}: type={input_type}, name={input_name}, placeholder={input_placeholder}")
                except:
                    pass
            
            logger.info("✅ 페이지 구조 분석 완료")
            
        except Exception as e:
            logger.error(f"❌ 분석 중 오류 발생: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    analyze_login_page()
