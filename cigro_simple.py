#!/usr/bin/env python3
"""
간소화된 Cigro 데이터 스크래핑 스크립트
"""

import os
import sys
import pandas as pd
import gspread
from oauth2client.service_account import ServiceAccountCredentials
from playwright.sync_api import sync_playwright
from datetime import datetime, timedelta
import logging
import argparse

# 로깅 설정
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# 환경 변수에서 설정 읽기
GOOGLE_SHEET_NAME = os.getenv("GOOGLE_SHEET_NAME", "Cigro Sales")
GOOGLE_CRED_FILE = os.getenv("GOOGLE_CRED_FILE", "google_sheet_credentials.json")
EMAIL = os.getenv("EMAIL", "tei.cha@bitelab.co.kr")
PASSWORD = os.getenv("PASSWORD", "qkfmsj123")

BRANDS = ["바르너", "릴리이브", "보호리", "먼슬리픽", "색동서울"]

def check_dependencies():
    """필요한 의존성과 파일들을 확인합니다."""
    logger.info("🔍 의존성 확인 중...")
    
    if not os.path.exists(GOOGLE_CRED_FILE):
        logger.error(f"❌ Google Sheets 인증 파일을 찾을 수 없습니다: {GOOGLE_CRED_FILE}")
        return False
    
    try:
        import pandas
        import gspread
        import playwright
        logger.info("✅ 모든 필수 패키지가 설치되어 있습니다.")
    except ImportError as e:
        logger.error(f"❌ 필수 패키지가 설치되지 않았습니다: {e}")
        return False
    
    logger.info("✅ 모든 의존성 확인 완료")
    return True

def upload_to_google_sheets(df, sheet_name):
    """구글 시트에 데이터를 업로드합니다."""
    try:
        scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
        creds = ServiceAccountCredentials.from_json_keyfile_name(GOOGLE_CRED_FILE, scope)
        client = gspread.authorize(creds)

        try:
            sheet = client.open(GOOGLE_SHEET_NAME).worksheet(sheet_name)
            logger.info(f"✅ {sheet_name} 시트 찾기 완료")
        except gspread.exceptions.WorksheetNotFound:
            logger.info(f"❌ {sheet_name} 시트가 없으므로 새로 생성합니다.")
            sheet = client.open(GOOGLE_SHEET_NAME).add_worksheet(title=sheet_name, rows="100", cols="20")

        # 기존 데이터 가져오기
        existing_data = sheet.get_all_records()
        existing_df = pd.DataFrame(existing_data)

        if 'date' not in existing_df.columns:
            existing_df['date'] = ''
        if 'date' not in df.columns:
            df['date'] = ''

        # 새 데이터의 날짜들
        new_dates = df['date'].tolist()
        
        for date in new_dates:
            existing_date_data = existing_df[existing_df['date'] == date]
            new_date_data = df[df['date'] == date]
            
            if existing_date_data.empty:
                sheet.append_rows(new_date_data.values.tolist(), value_input_option='RAW')
                logger.info(f"✅ {sheet_name} 시트에 {date} 날짜 데이터 새로 추가 완료")
            else:
                logger.info(f"ℹ️ {sheet_name} 시트의 {date} 날짜 데이터가 이미 존재합니다.")
                
    except Exception as e:
        logger.error(f"❌ Google Sheets 업로드 중 오류 발생: {e}")

def perform_login(page, context):
    """로그인을 수행합니다."""
    try:
        page.wait_for_load_state('networkidle', timeout=10000)
        
        # 이메일 입력
        email_element = page.wait_for_selector('input[type="email"]', timeout=10000)
        email_element.fill(EMAIL)
        logger.info("✅ 이메일 입력 완료")
        
        # 비밀번호 입력
        password_element = page.wait_for_selector('input[type="password"]', timeout=10000)
        password_element.fill(PASSWORD)
        logger.info("✅ 비밀번호 입력 완료")
        
        # 로그인 버튼 클릭
        login_button = page.wait_for_selector('div.clickable-element.bubble-element.Group.cnaNaCaF0', timeout=10000)
        login_button.click()
        logger.info("✅ 로그인 버튼 클릭 완료")
        
        # 로그인 완료 대기
        page.wait_for_timeout(5000)
        
        # 로그인 성공 확인
        try:
            page.wait_for_url("**/app.cigro.io/**", timeout=10000)
            logger.info("✅ 로그인 성공 확인됨")
        except:
            logger.warning("⚠️ 로그인 성공 여부를 확인할 수 없습니다.")

        context.storage_state(path="auth.json")
        logger.info("🔐 로그인 세션 저장 완료")
        
    except Exception as e:
        logger.error(f"❌ 로그인 중 오류 발생: {e}")
        raise

def extract_data(page, selected_date):
    """데이터를 추출합니다."""
    try:
        logger.info("📊 데이터 추출 시작")
        
        # 간단한 데이터 추출 (실제 구현은 필요에 따라 수정)
        all_data = []
        headers = ["date", "product", "sales", "quantity"]
        
        # 샘플 데이터 (실제로는 웹페이지에서 추출)
        sample_data = [
            [selected_date, "샘플 상품 1", "100000", "10"],
            [selected_date, "샘플 상품 2", "200000", "20"],
        ]
        
        df = pd.DataFrame(sample_data, columns=headers)
        logger.info(f"✅ 데이터 추출 완료: {len(df)}개 행")
        
        return df
        
    except Exception as e:
        logger.error(f"❌ 데이터 추출 중 오류 발생: {e}")
        return pd.DataFrame()

def main():
    parser = argparse.ArgumentParser(description='Cigro 데이터 스크래핑 스크립트')
    parser.add_argument('--date', type=str, help='스크래핑할 날짜 (YYYY-MM-DD 형식)')
    parser.add_argument('--brands', type=str, nargs='+', help='스크래핑할 브랜드 목록 (공백으로 구분)')
    args = parser.parse_args()
    
    logger.info("🚀 Cigro 데이터 스크래핑 시작")
    
    if not check_dependencies():
        logger.error("❌ 의존성 확인 실패. 스크립트를 종료합니다.")
        sys.exit(1)
    
    # 날짜 설정
    if args.date:
        try:
            selected_date = datetime.strptime(args.date, "%Y-%m-%d").strftime("%Y-%m-%d")
            logger.info(f"📅 지정된 날짜로 스크래핑: {selected_date}")
        except ValueError:
            logger.error(f"❌ 잘못된 날짜 형식: {args.date}. YYYY-MM-DD 형식을 사용하세요.")
            sys.exit(1)
    else:
        yesterday = datetime.now() - timedelta(1)
        selected_date = yesterday.strftime("%Y-%m-%d")
        logger.info(f"📅 어제 날짜로 스크래핑: {selected_date}")
    
    # 브랜드 설정
    if args.brands:
        selected_brands = args.brands
        logger.info(f"📋 선택된 브랜드: {', '.join(selected_brands)}")
    else:
        selected_brands = BRANDS
        logger.info(f"📋 모든 브랜드 스크래핑: {', '.join(selected_brands)}")

    with sync_playwright() as p:
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
            if os.path.exists("auth.json"):
                logger.info("🔐 기존 로그인 세션 불러오는 중...")
                context = browser.new_context(storage_state="auth.json")
            else:
                logger.info("🧭 새로 로그인 시작")
                context = browser.new_context()
                page = context.new_page()
                page.goto("https://app.cigro.io")
                perform_login(page, context)

            # 각 브랜드별로 데이터 추출
            for brand in selected_brands:
                logger.info(f"🔍 {brand} 브랜드 데이터 추출 중...")
                
                try:
                    page = context.new_page()
                    target_url = f"https://app.cigro.io/?menu=analysis&tab=product&group_by=option&brand_name={brand}&start_date={selected_date}&end_date={selected_date}"
                    page.goto(target_url)
                    page.wait_for_load_state('networkidle', timeout=15000)
                    
                    df = extract_data(page, selected_date)
                    
                    if not df.empty:
                        upload_to_google_sheets(df, brand)
                    else:
                        logger.warning(f"⚠️ {brand} 브랜드에서 데이터를 찾을 수 없습니다.")
                        
                except Exception as e:
                    logger.error(f"❌ {brand} 브랜드 처리 중 오류: {e}")
                finally:
                    try:
                        page.close()
                    except:
                        pass

            logger.info("✅ 모든 브랜드 처리 완료")
            
        except Exception as e:
            logger.error(f"❌ 스크래핑 중 오류 발생: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    main()
