#!/usr/bin/env python3
"""
개선된 Cigro 데이터 스크래핑 스크립트
- 환경 변수 지원
- 브랜드 선택 기능
- 날짜 선택 기능
- 데이터 우선순위 로직 (기존 데이터가 더 많으면 유지)
- 속도 최적화 (병렬 처리, 대기 시간 최소화)
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
from concurrent.futures import ThreadPoolExecutor, as_completed

# 로깅 설정
logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# 환경 변수에서 설정 읽기 (필수 값은 기본값 없음)
GOOGLE_SHEET_NAME = os.getenv("GOOGLE_SHEET_NAME", "Cigro Sales")
GOOGLE_CRED_FILE = os.getenv("GOOGLE_CRED_FILE", "google_sheet_credentials.json")
EMAIL = os.getenv("EMAIL")
PASSWORD = os.getenv("PASSWORD")

# 필수 환경 변수 검증
if not EMAIL or not PASSWORD:
    logger.error("❌ EMAIL과 PASSWORD 환경변수가 설정되지 않았습니다.")
    logger.error("   GitHub Secrets 또는 환경 변수를 확인하세요.")
    sys.exit(1)

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
                # 데이터 비교
                existing_count = len(existing_date_data)
                new_count = len(new_date_data)

                logger.info(f"📊 {sheet_name} 시트 {date} 날짜 데이터 비교: 기존 {existing_count}개 vs 새 {new_count}개")

                should_replace = False
                replace_reason = ""

                # 1. 새 데이터가 더 많으면 교체
                if new_count > existing_count:
                    should_replace = True
                    replace_reason = f"새 데이터가 더 많음 ({new_count} > {existing_count})"
                else:
                    # 2. 원가, 판매량, 결제금액 비교 (같은 행 수일 때)
                    try:
                        # 비교를 위해 키 컬럼으로 매칭 (판매처, 제품명, 옵션명)
                        key_cols = ['판매처', '제품명', '옵션명']

                        for _, new_row in new_date_data.iterrows():
                            # 기존 데이터에서 같은 항목 찾기
                            mask = (existing_date_data['판매처'] == new_row['판매처']) & \
                                   (existing_date_data['제품명'] == new_row['제품명']) & \
                                   (existing_date_data['옵션명'] == new_row['옵션명'])
                            matching_rows = existing_date_data[mask]

                            if not matching_rows.empty:
                                existing_row = matching_rows.iloc[0]

                                # 숫자 변환 함수
                                def to_number(val):
                                    if pd.isna(val) or val == '' or val == '-':
                                        return 0
                                    try:
                                        return float(str(val).replace(',', '').replace('원', '').replace('%', '').strip())
                                    except:
                                        return 0

                                # 원가 비교 (기존 0원에서 실제 값으로 변경된 경우)
                                new_cost = to_number(new_row.get('원가', 0))
                                existing_cost = to_number(existing_row.get('원가', 0))
                                if existing_cost == 0 and new_cost > 0:
                                    should_replace = True
                                    replace_reason = f"원가 업데이트 (0 → {new_cost})"
                                    break

                                # 판매량 비교 (새 값이 더 크면 업데이트)
                                new_sales = to_number(new_row.get('판매량', 0))
                                existing_sales = to_number(existing_row.get('판매량', 0))
                                if new_sales > existing_sales:
                                    should_replace = True
                                    replace_reason = f"판매량 증가 ({existing_sales} → {new_sales})"
                                    break

                                # 결제금액 비교 (새 값이 더 크면 업데이트)
                                new_amount = to_number(new_row.get('결제금액', 0))
                                existing_amount = to_number(existing_row.get('결제금액', 0))
                                if new_amount > existing_amount:
                                    should_replace = True
                                    replace_reason = f"결제금액 증가 ({existing_amount} → {new_amount})"
                                    break
                    except Exception as e:
                        logger.warning(f"⚠️ 데이터 비교 중 오류: {e}")

                if should_replace:
                    logger.info(f"🔄 {sheet_name} 시트의 {date} 날짜 데이터 교체 사유: {replace_reason}")

                    # 기존 데이터 삭제
                    existing_indices = existing_df[existing_df['date'] == date].index.tolist()
                    sheet_row_numbers = [idx + 2 for idx in existing_indices]  # +2는 헤더와 0-based 인덱스 때문

                    # 기존 데이터 삭제 (뒤에서부터 삭제하여 인덱스 변화 방지)
                    if sheet_row_numbers:
                        for row_num in sorted(sheet_row_numbers, reverse=True):
                            sheet.delete_rows(row_num)

                    # 새 데이터 추가
                    if len(new_date_data) > 0:
                        sheet.append_rows(new_date_data.values.tolist(), value_input_option='RAW')
                    logger.info(f"✅ {sheet_name} 시트의 {date} 날짜 데이터 교체 완료")
                else:
                    logger.info(f"ℹ️ {sheet_name} 시트의 {date} 날짜 데이터 변경 없음. 기존 데이터 유지.")
                    
    except Exception as e:
        logger.error(f"❌ Google Sheets 업로드 중 오류 발생: {e}")

def extract_all_pages_data(page, selected_date, brand_name):
    """모든 페이지의 데이터를 추출합니다."""
    all_data = []
    headers = None
    current_page = 1
    expected_columns = 9  # 예상되는 열 개수 (날짜 포함)

    while True:
        logger.info(f"📄 {brand_name} - {current_page}페이지 데이터 추출 중...")

        # 컬럼 요소 찾기
        columns = page.query_selector_all('div.sc-dkrFOg.cGhOUg')
        if not columns:
            logger.warning(f"❌ {brand_name} - 컬럼을 찾을 수 없습니다.")
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
            logger.warning(f"❌ {brand_name} - 페이지 번호를 찾을 수 없습니다.")
            break

        total_pages = int(page_text.split("/")[1].strip())
        if current_page >= total_pages:
            break

        # 다음 페이지로 이동
        pagination_div = page.query_selector('div.w-20.flex.justify-between.items-center')
        svgs = pagination_div.query_selector_all('svg') if pagination_div else []
        if len(svgs) >= 3:
            svgs[2].click()
            # 고정 대기 대신 테이블 요소가 업데이트될 때까지 대기
            page.wait_for_timeout(500)
        else:
            break

        current_page += 1

    df = pd.DataFrame(all_data, columns=headers)

    # 열 개수 검증
    if len(df.columns) < expected_columns:
        logger.error(f"❌ {brand_name} 브랜드 데이터 수집 실패: 예상 열 개수 {expected_columns}개, 실제 {len(df.columns)}개")
        return None

    logger.info(f"✅ {brand_name} 브랜드 총 {len(df)}개 행의 데이터 추출 완료 (열 개수: {len(df.columns)}개)")
    return df


def scrape_brand(browser_context, brand, selected_date, max_retries=2):
    """단일 브랜드를 스크래핑합니다."""
    for attempt in range(max_retries):
        page = None
        try:
            target_url = f"https://app.cigro.io/?menu=analysis&tab=product&group_by=option&brand_name={brand}&start_date={selected_date}&end_date={selected_date}"

            page = browser_context.new_page()
            # 네트워크 idle 상태까지 대기 (더 빠른 로딩 감지)
            page.goto(target_url, wait_until='networkidle', timeout=30000)

            # 테이블 로딩 대기 - 고정 5초 대신 요소 대기
            try:
                page.wait_for_selector('div.sc-dkrFOg.cGhOUg', timeout=10000)
            except:
                logger.warning(f"⚠️ {brand} - 테이블 로딩 대기 타임아웃")

            df = extract_all_pages_data(page, selected_date, brand)

            if df is not None and not df.empty:
                return brand, df, None
            else:
                logger.warning(f"⚠️ {brand} 시도 {attempt + 1}/{max_retries}: 데이터 없음")

        except Exception as e:
            logger.error(f"❌ {brand} 시도 {attempt + 1}/{max_retries} 오류: {e}")
        finally:
            if page:
                try:
                    page.close()
                except:
                    pass

    return brand, None, f"최대 재시도 횟수 초과"

def parse_arguments():
    """명령줄 인수를 파싱합니다."""
    parser = argparse.ArgumentParser(description='Cigro 데이터 스크래핑 스크립트')
    parser.add_argument('--start-date', type=str, help='시작 날짜 (YYYY-MM-DD 형식)')
    parser.add_argument('--end-date', type=str, help='종료 날짜 (YYYY-MM-DD 형식)')
    parser.add_argument('--brands', type=str, nargs='+', help='스크래핑할 브랜드 목록 (공백으로 구분)')
    parser.add_argument('--headless', action='store_true', default=True, help='헤드리스 모드로 실행')
    return parser.parse_args()


def get_date_range(start_date_str, end_date_str):
    """시작 날짜와 종료 날짜 사이의 모든 날짜를 반환합니다."""
    dates = []

    if start_date_str:
        start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
    else:
        # 기본값: 어제 날짜
        start_date = datetime.now() - timedelta(1)

    if end_date_str:
        end_date = datetime.strptime(end_date_str, "%Y-%m-%d")
    else:
        # 종료 날짜가 없으면 시작 날짜와 동일
        end_date = start_date

    # 시작 날짜가 종료 날짜보다 이후인 경우 스왑
    if start_date > end_date:
        start_date, end_date = end_date, start_date

    current_date = start_date
    while current_date <= end_date:
        dates.append(current_date.strftime("%Y-%m-%d"))
        current_date += timedelta(1)

    return dates

def main():
    args = parse_arguments()

    logger.info("🚀 Cigro 데이터 스크래핑 시작")

    # 날짜 범위 설정
    try:
        date_range = get_date_range(args.start_date, args.end_date)
        if len(date_range) == 1:
            logger.info(f"📅 스크래핑 날짜: {date_range[0]}")
        else:
            logger.info(f"📅 스크래핑 기간: {date_range[0]} ~ {date_range[-1]} ({len(date_range)}일)")
    except ValueError as e:
        logger.error(f"❌ 잘못된 날짜 형식입니다. YYYY-MM-DD 형식을 사용하세요. 오류: {e}")
        sys.exit(1)

    # 브랜드 설정
    if args.brands:
        selected_brands = args.brands
        logger.info(f"📋 선택된 브랜드: {', '.join(selected_brands)}")
    else:
        selected_brands = BRANDS
        logger.info(f"📋 모든 브랜드 스크래핑: {', '.join(selected_brands)}")

    with sync_playwright() as p:
        # 브라우저 실행 설정 - 최적화된 옵션
        browser_args = [
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--disable-extensions',
            '--disable-plugins',
            '--disable-images',  # 이미지 로딩 비활성화로 속도 향상
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
                page.goto("https://app.cigro.io", wait_until='domcontentloaded')
                logger.info("📝 로그인 자동화 중...")

                # 이메일, 비밀번호 자동 입력
                page.fill('input.bubble-element.Input.cnaNaCaE0.a1746627658297x1166[type="email"]', EMAIL)
                page.fill('input[type="password"]', PASSWORD)

                # 로그인 버튼 클릭
                page.click('div.clickable-element.bubble-element.Group.cnaNaCaF0.bubble-r-container')
                page.wait_for_load_state('networkidle', timeout=15000)

                logger.info("🔐 로그인 완료 후 세션 저장 중...")
                context.storage_state(path="auth.json")
                page.close()

            # 날짜별, 브랜드별 스크래핑 실행
            total_success = 0
            total_fail = 0
            all_results = {}  # {brand: [df1, df2, ...]}

            logger.info(f"🚀 {len(date_range)}일 x {len(selected_brands)}개 브랜드 스크래핑 시작...")

            for date_idx, selected_date in enumerate(date_range):
                logger.info(f"📅 [{date_idx + 1}/{len(date_range)}] {selected_date} 날짜 스크래핑 중...")

                for brand in selected_brands:
                    logger.info(f"🔍 {brand} - {selected_date} 데이터 추출 중...")
                    brand_name, df, error = scrape_brand(context, brand, selected_date)

                    if df is not None:
                        if brand_name not in all_results:
                            all_results[brand_name] = []
                        all_results[brand_name].append(df)
                        total_success += 1
                        logger.info(f"✅ {brand_name} - {selected_date} 스크래핑 완료")
                    else:
                        total_fail += 1
                        logger.error(f"❌ {brand_name} - {selected_date} 스크래핑 실패: {error}")

            # Google Sheets 업로드 (브랜드별로 모든 날짜 데이터 병합 후 업로드)
            if all_results:
                logger.info(f"📤 Google Sheets 업로드 시작 ({len(all_results)}개 브랜드)...")
                for brand_name, dfs in all_results.items():
                    # 여러 날짜의 데이터를 하나로 병합
                    combined_df = pd.concat(dfs, ignore_index=True)
                    upload_to_google_sheets(combined_df, brand_name)
                    logger.info(f"✅ {brand_name} 업로드 완료 ({len(dfs)}일치 데이터)")

            # 최종 결과 요약
            total_tasks = len(date_range) * len(selected_brands)
            logger.info("=" * 50)
            logger.info("📊 스크래핑 결과 요약")
            logger.info(f"📅 스크래핑 기간: {date_range[0]} ~ {date_range[-1]} ({len(date_range)}일)")
            logger.info(f"📋 스크래핑 브랜드: {', '.join(selected_brands)}")
            logger.info(f"✅ 성공: {total_success}건 / ❌ 실패: {total_fail}건")
            logger.info(f"📈 성공률: {total_success}/{total_tasks} ({total_success/total_tasks*100:.1f}%)")
            logger.info("=" * 50)

            if total_success > 0:
                logger.info("🎉 스크래핑 작업이 완료되었습니다!")
            else:
                logger.error("❌ 모든 스크래핑이 실패했습니다.")

        except Exception as e:
            logger.error(f"❌ 스크래핑 중 오류 발생: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    main()