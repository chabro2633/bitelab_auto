#!/usr/bin/env python3
"""
개선된 Cigro 데이터 스크래핑 스크립트
- 환경 변수 지원
- 브랜드 선택 기능
- 날짜 선택 기능
- 데이터 우선순위 로직 (기존 데이터가 더 많으면 유지)
- 속도 최적화
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
logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# 환경 변수에서 설정 읽기
GOOGLE_SHEET_NAME = os.getenv("GOOGLE_SHEET_NAME", "Cigro Sales")
GOOGLE_CRED_FILE = os.getenv("GOOGLE_CRED_FILE", "google_sheet_credentials.json")
EMAIL = os.getenv("EMAIL", "tei.cha@bitelab.co.kr")
PASSWORD = os.getenv("PASSWORD", "qkfmsj123")

BRANDS = ["바르너", "릴리이브", "색동서울", "먼슬리픽", "보호리"]

def upload_to_google_sheets(df, sheet_name):
    """
    구글 시트에 데이터를 업로드합니다.
    기존 데이터와 비교하여 더 많은 데이터가 있을 때만 교체합니다.
    """
    try:
        scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
        creds = ServiceAccountCredentials.from_json_keyfile_name(GOOGLE_CRED_FILE, scope)
        client = gspread.authorize(creds)

        # 시트 존재 여부 확인
        try:
            sheet = client.open(GOOGLE_SHEET_NAME).worksheet(sheet_name)
            logger.info(f"✅ {sheet_name} 시트 찾기 완료")
        except gspread.exceptions.WorksheetNotFound:
            logger.info(f"❌ {sheet_name} 시트가 없으므로 새로 생성합니다.")
            sheet = client.open(GOOGLE_SHEET_NAME).add_worksheet(title=sheet_name, rows="100", cols="20")

        # 기존 데이터 가져오기
        existing_data = sheet.get_all_records(expected_headers=["date", "판매처", "제품명", "옵션명","판매량","결제금액","원가","수수료","컬럼1"])
        existing_df = pd.DataFrame(existing_data)

        # 날짜 컬럼 확인 및 추가
        if 'date' not in existing_df.columns:
            existing_df['date'] = ''
        if 'date' not in df.columns:
            df['date'] = ''

        # 새 데이터의 날짜들
        new_dates = df['date'].unique()
        
        for date in new_dates:
            existing_date_data = existing_df[existing_df['date'] == date]
            new_date_data = df[df['date'] == date]
            
            if existing_date_data.empty:
                # 해당 날짜의 데이터가 없으면 새로 추가
                sheet.append_rows(new_date_data.values.tolist(), value_input_option='RAW')
                logger.info(f"✅ {sheet_name} 시트에 {date} 날짜 데이터 새로 추가 완료")
            else:
                # 데이터 양 비교 (기존 데이터가 더 많으면 유지, 그렇지 않으면 새 데이터로 교체)
                existing_count = len(existing_date_data)
                new_count = len(new_date_data)
                
                logger.info(f"📊 {sheet_name} 시트 {date} 날짜 데이터 비교: 기존 {existing_count}개 vs 새 {new_count}개")
                
                if existing_count >= new_count:
                    logger.info(f"ℹ️ {sheet_name} 시트의 {date} 날짜 데이터가 더 많거나 같습니다. 기존 데이터를 유지합니다.")
                else:
                    logger.info(f"🔄 {sheet_name} 시트의 {date} 날짜 데이터를 새 데이터로 교체합니다.")
                    
                    # 기존 데이터 삭제
                    existing_indices = existing_df[existing_df['date'] == date].index.tolist()
                    sheet_row_numbers = [idx + 2 for idx in existing_indices]  # +2는 헤더와 0-based 인덱스 때문
                    
                    # 기존 데이터 삭제 (개별 삭제로 수정)
                    if sheet_row_numbers:
                        # 뒤에서부터 삭제하여 인덱스 변화 방지
                        for row_num in sorted(sheet_row_numbers, reverse=True):
                            sheet.delete_rows(row_num)
                    
                    # 새 데이터 추가 (배치 업로드로 API 호출 최소화)
                    if len(new_date_data) > 0:
                        sheet.append_rows(new_date_data.values.tolist(), value_input_option='RAW')
                    logger.info(f"✅ {sheet_name} 시트의 {date} 날짜 데이터 교체 완료")
                    
    except Exception as e:
        logger.error(f"❌ Google Sheets 업로드 중 오류 발생: {e}")

def extract_all_pages_data(page, selected_date, brand_name):
    """모든 페이지의 데이터를 추출합니다."""
    all_data = []
    headers = None
    current_page = 1
    expected_columns = 9  # 예상되는 열 개수 (날짜 포함)

    while True:
        logger.info(f"📄 {current_page}페이지 데이터 추출 중...")

        # 컬럼 요소 찾기
        columns = page.query_selector_all('div.sc-dkrFOg.cGhOUg')
        if not columns:
            logger.warning("❌ 컬럼을 찾을 수 없습니다.")
            break

        # 행 데이터 추출
        num_rows = len(columns[0].query_selector_all('div.sc-hLBbgP.jbaWzw'))
        for row_idx in range(num_rows):
            row_data = [selected_date]  # 날짜 컬럼 추가
            for col in columns:
                cells = col.query_selector_all('div.sc-hLBbgP.jbaWzw')
                value = cells[row_idx].inner_text().strip() if row_idx < len(cells) else ''
                row_data.append(value)
            all_data.append(row_data)

        # 헤더 추출 (첫 번째 페이지만)
        if headers is None:
            headers = ["date"] + [label.inner_text().strip() for label in page.query_selector_all('div.sc-gswNZR.gSJTZd > label')]
            
            # 헤더가 비어 있는 경우 기본 헤더 추가
            if not headers or len(headers) == 1:  # 단지 "date"만 있다면
                headers = ["date"] + [f"컬럼{idx+1}" for idx in range(len(all_data[0]) - 1)]
                
            if len(headers) < len(all_data[0]):
                headers += [f"컬럼{idx+1}" for idx in range(len(all_data[0]) - len(headers))]

        # 페이지 번호 확인 및 페이지 이동
        label_el = page.query_selector('label.text-cigro-page-number')
        page_text = label_el.inner_text().strip() if label_el else None
        if not page_text or f"{current_page} /" not in page_text:
            logger.warning("❌ 페이지 번호를 찾을 수 없습니다.")
            break

        total_pages = int(page_text.split("/")[1].strip())
        if current_page >= total_pages:
            break

        # 다음 페이지로 이동
        pagination_div = page.query_selector('div.w-20.flex.justify-between.items-center')
        svgs = pagination_div.query_selector_all('svg') if pagination_div else []
        if len(svgs) >= 3:
            svgs[2].click()
        else:
            break

        page.wait_for_timeout(1000)  # 페이지가 완전히 로드될 때까지 대기
        current_page += 1

    df = pd.DataFrame(all_data, columns=headers)
    
    # 열 개수 검증
    if len(df.columns) < expected_columns:
        logger.error(f"❌ {brand_name} 브랜드 데이터 수집 실패: 예상 열 개수 {expected_columns}개, 실제 {len(df.columns)}개")
        return None
    
    logger.info(f"✅ {brand_name} 브랜드 총 {len(df)}개 행의 데이터 추출 완료 (열 개수: {len(df.columns)}개)")
    return df

def parse_arguments():
    """명령줄 인수를 파싱합니다."""
    parser = argparse.ArgumentParser(description='Cigro 데이터 스크래핑 스크립트')
    parser.add_argument('--date', type=str, help='스크래핑할 날짜 (YYYY-MM-DD 형식)')
    parser.add_argument('--brands', type=str, nargs='+', help='스크래핑할 브랜드 목록 (공백으로 구분)')
    parser.add_argument('--headless', action='store_true', default=True, help='헤드리스 모드로 실행')
    return parser.parse_args()

def main():
    args = parse_arguments()
    
    logger.info("🚀 Cigro 데이터 스크래핑 시작")
    
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
        # 브라우저 실행 설정
        browser_args = [
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor'
        ]
        
        browser = p.chromium.launch(
            headless=args.headless,
            args=browser_args
        )

        try:
            if os.path.exists("auth.json"):
                logger.info("🔐 기존 로그인 세션 불러오는 중...")
                context = browser.new_context(storage_state="auth.json")
            else:
                logger.info("🧭 세션 없음 ➜ 수동 로그인 시작")
                context = browser.new_context()
                page = context.new_page()
                page.goto("https://app.cigro.io")
                logger.info("📝 로그인 자동화 중...")
                
                # 이메일, 비밀번호 자동 입력
                page.fill('input.bubble-element.Input.cnaNaCaE0.a1746627658297x1166[type="email"]', EMAIL)
                page.fill('input[type="password"]', PASSWORD)
                
                # 로그인 버튼 클릭
                page.click('div.clickable-element.bubble-element.Group.cnaNaCaF0.bubble-r-container')
                page.wait_for_timeout(5000)

                logger.info("🔐 로그인 완료 후 세션 저장 중...")
                context.storage_state(path="auth.json")

            # 각 브랜드별로 데이터 추출 (재시도 로직 포함)
            successful_brands = []
            failed_brands = []
            
            for brand in selected_brands:
                logger.info(f"🔍 {brand} 데이터 추출 중...")
                max_retries = 3
                success = False
                
                for attempt in range(max_retries):
                    try:
                        target_url = f"https://app.cigro.io/?menu=analysis&tab=product&group_by=option&brand_name={brand}&start_date={selected_date}&end_date={selected_date}"

                        page = context.new_page()
                        page.goto(target_url)
                        page.wait_for_timeout(5000)  # 테이블 로딩 대기

                        df = extract_all_pages_data(page, selected_date, brand)
                        
                        if df is not None and not df.empty:
                            upload_to_google_sheets(df, brand)
                            successful_brands.append(brand)
                            success = True
                            logger.info(f"✅ {brand} 브랜드 처리 완료")
                            break
                        else:
                            logger.warning(f"⚠️ {brand} 브랜드 시도 {attempt + 1}/{max_retries}: 데이터 수집 실패")
                            if attempt < max_retries - 1:
                                logger.info(f"🔄 {brand} 브랜드 재시도 중... ({attempt + 2}/{max_retries})")
                                page.wait_for_timeout(3000)  # 재시도 전 대기
                        
                    except Exception as e:
                        logger.error(f"❌ {brand} 브랜드 시도 {attempt + 1}/{max_retries} 중 오류: {e}")
                        if attempt < max_retries - 1:
                            logger.info(f"🔄 {brand} 브랜드 재시도 중... ({attempt + 2}/{max_retries})")
                            page.wait_for_timeout(3000)
                    finally:
                        try:
                            page.close()
                        except:
                            pass
                
                if not success:
                    failed_brands.append(brand)
                    logger.error(f"❌ {brand} 브랜드 최종 실패 (최대 재시도 횟수 초과)")

            # 최종 결과 요약
            logger.info("=" * 50)
            logger.info("📊 스크래핑 결과 요약")
            logger.info(f"✅ 성공한 브랜드: {', '.join(successful_brands) if successful_brands else '없음'}")
            if failed_brands:
                logger.error(f"❌ 실패한 브랜드: {', '.join(failed_brands)}")
            logger.info(f"📈 성공률: {len(successful_brands)}/{len(selected_brands)} ({len(successful_brands)/len(selected_brands)*100:.1f}%)")
            logger.info("=" * 50)
            
            if successful_brands:
                logger.info("🎉 스크래핑 작업이 성공적으로 완료되었습니다!")
            else:
                logger.error("❌ 모든 브랜드 스크래핑이 실패했습니다.")
            
        except Exception as e:
            logger.error(f"❌ 스크래핑 중 오류 발생: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    main()