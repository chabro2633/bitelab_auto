import os
import sys
import pandas as pd
import gspread
from oauth2client.service_account import ServiceAccountCredentials
from playwright.sync_api import sync_playwright
from datetime import datetime, timedelta
import logging
import argparse
import asyncio
import concurrent.futures
from threading import Thread

# 로깅 설정
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Google Sheets 설정 (환경 변수에서 읽기)
GOOGLE_SHEET_NAME = os.getenv("GOOGLE_SHEET_NAME", "Cigro Sales")
GOOGLE_CRED_FILE = os.getenv("GOOGLE_CRED_FILE", "google_sheet_credentials.json")

# 로그인 정보 (환경 변수에서 읽기)
EMAIL = os.getenv("EMAIL", "tei.cha@bitelab.co.kr")
PASSWORD = os.getenv("PASSWORD", "qkfmsj123")

BRANDS = ["바르너", "릴리이브", "보호리", "먼슬리픽", "색동서울"]  # 브랜드 이름 리스트

def check_dependencies():
    """필요한 의존성과 파일들을 확인합니다."""
    logger.info("🔍 의존성 확인 중...")
    
    # 필수 파일 확인
    if not os.path.exists(GOOGLE_CRED_FILE):
        logger.error(f"❌ Google Sheets 인증 파일을 찾을 수 없습니다: {GOOGLE_CRED_FILE}")
        return False
    
    # 필수 패키지 확인
    try:
        import pandas
        import gspread
        import playwright
        logger.info("✅ 모든 필수 패키지가 설치되어 있습니다.")
    except ImportError as e:
        logger.error(f"❌ 필수 패키지가 설치되지 않았습니다: {e}")
        logger.error("다음 명령어로 설치하세요: pip install pandas gspread oauth2client playwright")
        return False
    
    logger.info("✅ 모든 의존성 확인 완료")
    return True

def setup_browser():
    """브라우저를 설정하고 Playwright를 설치합니다."""
    try:
        # Playwright 브라우저 설치 확인
        from playwright.sync_api import sync_playwright
        logger.info("✅ Playwright가 설치되어 있습니다.")
        return True
    except ImportError:
        logger.error("❌ Playwright가 설치되지 않았습니다.")
        logger.error("다음 명령어로 설치하세요: playwright install chromium")
        return False

def upload_to_google_sheets(df, sheet_name):
    """
    구글 시트에 데이터를 업로드합니다.
    시트 이름을 매개변수로 받습니다.
    기존 데이터를 확인하고, 같은 날짜가 있으면 데이터를 비교하여 업데이트합니다.
    시트가 없으면 생성합니다.
    """
    scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
    creds = ServiceAccountCredentials.from_json_keyfile_name(GOOGLE_CRED_FILE, scope)
    client = gspread.authorize(creds)

    # 시트 존재 여부 확인
    try:
        # 지정된 시트 이름으로 시트를 열기
        sheet = client.open(GOOGLE_SHEET_NAME).worksheet(sheet_name)
        print(f"✅ {sheet_name} 시트 찾기 완료")
    except gspread.exceptions.WorksheetNotFound:
        # 시트가 없으면 새로 생성
        print(f"❌ {sheet_name} 시트가 없으므로 새로 생성합니다.")
        sheet = client.open(GOOGLE_SHEET_NAME).add_worksheet(title=sheet_name, rows="100", cols="20")

    # 기존 데이터 가져오기
    existing_data = sheet.get_all_records()
    existing_df = pd.DataFrame(existing_data)

    # 기존 시트에서 'date' 컬럼 확인
    if 'date' not in existing_df.columns:
        existing_df['date'] = ''  # 날짜 컬럼이 없으면 새로 추가

    # 'date' 컬럼이 df에 없으면 추가
    if 'date' not in df.columns:
        df['date'] = ''  # 날짜 컬럼이 없으면 새로 추가

    # 새 데이터의 날짜들
    new_dates = df['date'].tolist()
    
    # 각 날짜별로 처리
    for date in new_dates:
        # 해당 날짜의 기존 데이터 찾기
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
                
                # 기존 데이터 삭제 (뒤에서부터 삭제하여 인덱스 변화 방지)
                for row_num in sorted(sheet_row_numbers, reverse=True):
                    sheet.delete_rows(row_num)
                
                # 새 데이터 추가
                sheet.append_rows(new_date_data.values.tolist(), value_input_option='RAW')
                logger.info(f"✅ {sheet_name} 시트의 {date} 날짜 데이터 교체 완료")


def extract_brand_data_fast(page, brand, selected_date):
    """빠른 브랜드 데이터 추출"""
    try:
        logger.info(f"🔍 {brand} 브랜드 데이터 추출 중...")
        
        target_url = f"https://app.cigro.io/?menu=analysis&tab=product&group_by=option&brand_name={brand}&start_date={selected_date}&end_date={selected_date}"
        page.goto(target_url)
        
        # 페이지 로딩 대기 시간 단축
        page.wait_for_load_state('domcontentloaded', timeout=10000)
        
        # 테이블이 로드될 때까지 대기 (더 빠른 셀렉터 사용)
        try:
            page.wait_for_selector('table, .table, [role="table"]', timeout=5000)
        except:
            logger.warning(f"⚠️ {brand} 브랜드에서 테이블을 찾을 수 없습니다.")
            return pd.DataFrame()
        
        # 데이터 추출 (간소화된 버전)
        try:
            # 테이블 데이터 추출
            table_data = page.evaluate("""
                () => {
                    const tables = document.querySelectorAll('table, .table, [role="table"]');
                    if (tables.length === 0) return null;
                    
                    const table = tables[0];
                    const rows = table.querySelectorAll('tr');
                    const data = [];
                    
                    for (let i = 0; i < rows.length; i++) {
                        const cells = rows[i].querySelectorAll('td, th');
                        const rowData = [];
                        for (let j = 0; j < cells.length; j++) {
                            rowData.push(cells[j].textContent.trim());
                        }
                        if (rowData.length > 0) {
                            data.push(rowData);
                        }
                    }
                    return data;
                }
            """)
            
            if not table_data or len(table_data) < 2:
                logger.warning(f"⚠️ {brand} 브랜드에서 데이터를 찾을 수 없습니다.")
                return pd.DataFrame()
            
            # 헤더와 데이터 분리
            headers = table_data[0]
            data_rows = table_data[1:]
            
            # 날짜 컬럼 추가
            for row in data_rows:
                row.insert(0, selected_date)
            
            headers.insert(0, 'date')
            
            df = pd.DataFrame(data_rows, columns=headers)
            logger.info(f"✅ {brand} 브랜드 데이터 추출 완료: {len(df)}개 행")
            
            return df
            
        except Exception as e:
            logger.error(f"❌ {brand} 브랜드 데이터 추출 중 오류: {e}")
            return pd.DataFrame()
            
    except Exception as e:
        logger.error(f"❌ {brand} 브랜드 처리 중 오류: {e}")
        return pd.DataFrame()
    all_data = []
    headers = None
    current_page = 1
    max_pages = 10  # 최대 페이지 수 제한

    try:
        while current_page <= max_pages:
            print(f"📄 {current_page}페이지 데이터 추출 중...")

            # 다양한 셀렉터로 컬럼 찾기
            column_selectors = [
                'div.sc-dkrFOg.cGhOUg',
                'div[class*="column"]',
                'div[class*="col"]',
                'div[class*="cell"]',
                'div[class*="data"]'
            ]
            
            columns = None
            for selector in column_selectors:
                columns = page.query_selector_all(selector)
                if columns:
                    print(f"✅ 컬럼 찾기 성공: {selector}")
                    break
            
            if not columns:
                print("❌ 컬럼을 찾을 수 없습니다. 페이지 구조를 확인해주세요.")
                break

            # 행 데이터 추출
            cell_selectors = [
                'div.sc-hLBbgP.jbaWzw',
                'div[class*="row"]',
                'div[class*="cell"]',
                'div[class*="data"]'
            ]
            
            cells_in_first_column = None
            for selector in cell_selectors:
                cells_in_first_column = columns[0].query_selector_all(selector)
                if cells_in_first_column:
                    print(f"✅ 셀 찾기 성공: {selector}")
                    break
            
            if not cells_in_first_column:
                print("❌ 데이터 셀을 찾을 수 없습니다.")
                break

            num_rows = len(cells_in_first_column)
            print(f"📊 {num_rows}개 행 발견")
            
            for row_idx in range(num_rows):
                row_data = [selected_date]  # 날짜 컬럼 추가
                for col in columns:
                    cells = col.query_selector_all(cell_selectors[0] if cells_in_first_column else 'div')
                    value = cells[row_idx].inner_text().strip() if row_idx < len(cells) else ''
                    row_data.append(value)
                all_data.append(row_data)

            # 헤더 추출 (첫 번째 페이지만)
            if headers is None:
                header_selectors = [
                    'div.sc-gswNZR.gSJTZd > label',
                    'label[class*="header"]',
                    'th',
                    'div[class*="header"]',
                    'div[class*="title"]'
                ]
                
                header_elements = []
                for selector in header_selectors:
                    header_elements = page.query_selector_all(selector)
                    if header_elements:
                        print(f"✅ 헤더 찾기 성공: {selector}")
                        break
                
                if header_elements:
                    headers = ["date"] + [label.inner_text().strip() for label in header_elements]
                else:
                    # 헤더가 없으면 기본 헤더 생성
                    headers = ["date"] + [f"컬럼{idx+1}" for idx in range(len(all_data[0]) - 1)]
                    print(f"⚠️ 헤더를 찾을 수 없어 기본 헤더 생성: {headers}")
                
                # 헤더 길이 조정
                if len(headers) < len(all_data[0]):
                    headers += [f"컬럼{idx+1}" for idx in range(len(all_data[0]) - len(headers))]

            # 페이지네이션 확인
            page_number_selectors = [
                'label.text-cigro-page-number',
                'label[class*="page"]',
                'span[class*="page"]',
                'div[class*="pagination"]'
            ]
            
            page_text = None
            for selector in page_number_selectors:
                label_el = page.query_selector(selector)
                if label_el:
                    page_text = label_el.inner_text().strip()
                    if page_text and "/" in page_text:
                        break
            
            if not page_text or f"{current_page} /" not in page_text:
                print(f"❌ 페이지 번호를 찾을 수 없습니다. 현재 페이지: {current_page}")
                break

            try:
                total_pages = int(page_text.split("/")[1].strip())
                print(f"📖 총 {total_pages}페이지 중 {current_page}페이지")
            except:
                print("❌ 총 페이지 수를 파싱할 수 없습니다.")
                break

            if current_page >= total_pages:
                print("✅ 마지막 페이지에 도달했습니다.")
                break

            # 다음 페이지로 이동
            pagination_selectors = [
                'div.w-20.flex.justify-between.items-center',
                'div[class*="pagination"]',
                'div[class*="next"]',
                'button[class*="next"]'
            ]
            
            next_clicked = False
            for selector in pagination_selectors:
                pagination_div = page.query_selector(selector)
                if pagination_div:
                    svgs = pagination_div.query_selector_all('svg')
                    if len(svgs) >= 3:
                        try:
                            svgs[2].click()
                            next_clicked = True
                            print(f"✅ 다음 페이지 버튼 클릭 성공: {selector}")
                            break
                        except:
                            continue
            
            if not next_clicked:
                print("❌ 다음 페이지 버튼을 찾을 수 없습니다.")
                break

            page.wait_for_timeout(2000)  # 페이지 로딩 대기
            current_page += 1

    except Exception as e:
        print(f"❌ 데이터 추출 중 오류 발생: {e}")

    if not all_data:
        print("❌ 추출된 데이터가 없습니다.")
        return pd.DataFrame()

    df = pd.DataFrame(all_data, columns=headers)
    print(f"✅ 총 {len(df)}개 행의 데이터 추출 완료")
    return df

def perform_login(page, context):
    """로그인을 수행합니다."""
    try:
        # 페이지 로딩 대기
        page.wait_for_load_state('networkidle', timeout=10000)
        
        # 이메일 입력 필드 찾기 (여러 셀렉터 시도)
        email_selectors = [
            'input[type="email"]',
            'input[name="email"]',
            'input[placeholder*="email" i]',
            'input[placeholder*="이메일" i]',
            'input.bubble-element.Input[type="email"]',
            'input[type="email"].bubble-element.Input'
        ]
        
        email_filled = False
        for selector in email_selectors:
            try:
                page.wait_for_selector(selector, timeout=5000)
                page.fill(selector, EMAIL)
                logger.info(f"✅ 이메일 입력 성공: {selector}")
                email_filled = True
                break
            except:
                continue
        
        if not email_filled:
            logger.error("❌ 이메일 입력 필드를 찾을 수 없습니다.")
            raise Exception("이메일 입력 필드를 찾을 수 없습니다.")
        
        # 비밀번호 입력 필드 찾기
        password_selectors = [
            'input[type="password"]',
            'input[name="password"]',
            'input[placeholder*="password" i]',
            'input[placeholder*="비밀번호" i]'
        ]
        
        password_filled = False
        for selector in password_selectors:
            try:
                page.wait_for_selector(selector, timeout=5000)
                page.fill(selector, PASSWORD)
                logger.info(f"✅ 비밀번호 입력 성공: {selector}")
                password_filled = True
                break
            except:
                continue
        
        if not password_filled:
            logger.error("❌ 비밀번호 입력 필드를 찾을 수 없습니다.")
            raise Exception("비밀번호 입력 필드를 찾을 수 없습니다.")
        
        # 로그인 버튼 클릭 (정확한 셀렉터 사용)
        login_button = page.wait_for_selector('div.clickable-element.bubble-element.Group.cnaNaCaF0', timeout=10000)
        login_button.click()
        logger.info("✅ 로그인 버튼 클릭 성공")
        
        # 로그인 완료 대기
        page.wait_for_timeout(5000)
        
        # 로그인 성공 확인 (URL 변경 또는 특정 요소 확인)
        try:
            page.wait_for_url("**/app.cigro.io/**", timeout=10000)
            logger.info("✅ 로그인 성공 확인됨")
        except:
            logger.warning("⚠️ 로그인 성공 여부를 확인할 수 없습니다. 계속 진행합니다.")

        logger.info("🔐 로그인 완료 후 세션 저장 중...")
        context.storage_state(path="auth.json")  # 로그인 세션 저장
        
    except Exception as e:
        logger.error(f"❌ 로그인 중 오류 발생: {e}")
        logger.info("🔄 수동 로그인이 필요할 수 있습니다.")
        # 오류 발생 시에도 계속 진행 (이미 로그인된 상태일 수 있음)

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
    
    # 의존성 확인
    if not check_dependencies():
        logger.error("❌ 의존성 확인 실패. 스크립트를 종료합니다.")
        sys.exit(1)
    
    if not setup_browser():
        logger.error("❌ 브라우저 설정 실패. 스크립트를 종료합니다.")
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
        # 브라우저 실행 설정
        browser_args = [
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor'
        ]
        
        browser = p.chromium.launch(
            headless=args.headless,  # 인수에 따라 헤드리스 모드 설정
            args=browser_args
        )

        if os.path.exists("auth.json"):
            logger.info("🔐 기존 로그인 세션 불러오는 중...")
            try:
                context = browser.new_context(storage_state="auth.json")
                logger.info("✅ 로그인 세션 불러오기 성공")
            except Exception as e:
                logger.warning(f"⚠️ 로그인 세션 불러오기 실패: {e}")
                logger.info("🔄 새로 로그인을 진행합니다.")
                context = browser.new_context()
                page = context.new_page()
                page.goto("https://app.cigro.io")
                logger.info("📝 로그인 자동화 중...")
                
                try:
                    # 페이지 로딩 대기
                    page.wait_for_load_state('networkidle', timeout=10000)
                    
                    # 이메일 입력 필드 찾기 (여러 셀렉터 시도)
                    email_selectors = [
                        'input[type="email"]',
                        'input[name="email"]',
                        'input[placeholder*="email" i]',
                        'input[placeholder*="이메일" i]',
                        'input.bubble-element.Input[type="email"]',
                        'input[type="email"].bubble-element.Input'
                    ]
                    
                    email_filled = False
                    for selector in email_selectors:
                        try:
                            page.wait_for_selector(selector, timeout=5000)
                            page.fill(selector, EMAIL)
                            logger.info(f"✅ 이메일 입력 성공: {selector}")
                            email_filled = True
                            break
                        except:
                            continue
                    
                    if not email_filled:
                        logger.error("❌ 이메일 입력 필드를 찾을 수 없습니다.")
                        raise Exception("이메일 입력 필드를 찾을 수 없습니다.")
                    
                    # 비밀번호 입력 필드 찾기
                    password_selectors = [
                        'input[type="password"]',
                        'input[name="password"]',
                        'input[placeholder*="password" i]',
                        'input[placeholder*="비밀번호" i]'
                    ]
                    
                    password_filled = False
                    for selector in password_selectors:
                        try:
                            page.wait_for_selector(selector, timeout=5000)
                            page.fill(selector, PASSWORD)
                            logger.info(f"✅ 비밀번호 입력 성공: {selector}")
                            password_filled = True
                            break
                        except:
                            continue
                    
                    if not password_filled:
                        logger.error("❌ 비밀번호 입력 필드를 찾을 수 없습니다.")
                        raise Exception("비밀번호 입력 필드를 찾을 수 없습니다.")
                    
                    # 로그인 버튼 찾기 및 클릭
                    login_button_selectors = [
                        'button[type="submit"]',
                        'input[type="submit"]',
                        'button:has-text("로그인")',
                        'button:has-text("Login")',
                        'div.clickable-element:has-text("로그인")',
                        'div.clickable-element:has-text("Login")',
                        'div.bubble-element.Group.clickable-element',
                        '[role="button"]:has-text("로그인")',
                        '[role="button"]:has-text("Login")'
                    ]
                    
                    login_clicked = False
                    for selector in login_button_selectors:
                        try:
                            page.wait_for_selector(selector, timeout=5000)
                            page.click(selector)
                            logger.info(f"✅ 로그인 버튼 클릭 성공: {selector}")
                            login_clicked = True
                            break
                        except:
                            continue
                    
                    if not login_clicked:
                        logger.error("❌ 로그인 버튼을 찾을 수 없습니다.")
                        raise Exception("로그인 버튼을 찾을 수 없습니다.")
                    
                    # 로그인 완료 대기
                    page.wait_for_timeout(5000)
                    
                    # 로그인 성공 확인 (URL 변경 또는 특정 요소 확인)
                    try:
                        page.wait_for_url("**/app.cigro.io/**", timeout=10000)
                        logger.info("✅ 로그인 성공 확인됨")
                    except:
                        logger.warning("⚠️ 로그인 성공 여부를 확인할 수 없습니다. 계속 진행합니다.")

                    logger.info("🔐 로그인 완료 후 세션 저장 중...")
                    context.storage_state(path="auth.json")  # 로그인 세션 저장
                    
                except Exception as e:
                    logger.error(f"❌ 로그인 중 오류 발생: {e}")
                    logger.info("🔄 수동 로그인이 필요할 수 있습니다.")
                    # 오류 발생 시에도 계속 진행 (이미 로그인된 상태일 수 있음)
        else:
            logger.info("🧭 세션 없음 ➜ 수동 로그인 시작")
            context = browser.new_context()
            page = context.new_page()
            page.goto("https://app.cigro.io")
            logger.info("📝 로그인 자동화 중...")
            
            try:
                # 페이지 로딩 대기
                page.wait_for_load_state('networkidle', timeout=10000)
                
                # 이메일 입력 필드 찾기 (여러 셀렉터 시도)
                email_selectors = [
                    'input[type="email"]',
                    'input[name="email"]',
                    'input[placeholder*="email" i]',
                    'input[placeholder*="이메일" i]',
                    'input.bubble-element.Input[type="email"]',
                    'input[type="email"].bubble-element.Input'
                ]
                
                email_filled = False
                for selector in email_selectors:
                    try:
                        page.wait_for_selector(selector, timeout=5000)
                        page.fill(selector, EMAIL)
                        logger.info(f"✅ 이메일 입력 성공: {selector}")
                        email_filled = True
                        break
                    except:
                        continue
                
                if not email_filled:
                    logger.error("❌ 이메일 입력 필드를 찾을 수 없습니다.")
                    raise Exception("이메일 입력 필드를 찾을 수 없습니다.")
                
                # 비밀번호 입력 필드 찾기
                password_selectors = [
                    'input[type="password"]',
                    'input[name="password"]',
                    'input[placeholder*="password" i]',
                    'input[placeholder*="비밀번호" i]'
                ]
                
                password_filled = False
                for selector in password_selectors:
                    try:
                        page.wait_for_selector(selector, timeout=5000)
                        page.fill(selector, PASSWORD)
                        print(f"✅ 비밀번호 입력 성공: {selector}")
                        password_filled = True
                        break
                    except:
                        continue
                
                if not password_filled:
                    print("❌ 비밀번호 입력 필드를 찾을 수 없습니다.")
                    raise Exception("비밀번호 입력 필드를 찾을 수 없습니다.")
                
                # 로그인 버튼 찾기 및 클릭
                login_button_selectors = [
                    'button[type="submit"]',
                    'input[type="submit"]',
                    'button:has-text("로그인")',
                    'button:has-text("Login")',
                    'div.clickable-element:has-text("로그인")',
                    'div.clickable-element:has-text("Login")',
                    'div.bubble-element.Group.clickable-element',
                    '[role="button"]:has-text("로그인")',
                    '[role="button"]:has-text("Login")'
                ]
                
                login_clicked = False
                for selector in login_button_selectors:
                    try:
                        page.wait_for_selector(selector, timeout=5000)
                        page.click(selector)
                        print(f"✅ 로그인 버튼 클릭 성공: {selector}")
                        login_clicked = True
                        break
                    except:
                        continue
                
                if not login_clicked:
                    print("❌ 로그인 버튼을 찾을 수 없습니다.")
                    raise Exception("로그인 버튼을 찾을 수 없습니다.")
                
                # 로그인 완료 대기
                page.wait_for_timeout(5000)
                
                # 로그인 성공 확인 (URL 변경 또는 특정 요소 확인)
                try:
                    page.wait_for_url("**/app.cigro.io/**", timeout=10000)
                    print("✅ 로그인 성공 확인됨")
                except:
                    print("⚠️ 로그인 성공 여부를 확인할 수 없습니다. 계속 진행합니다.")

                print("🔐 로그인 완료 후 세션 저장 중...")
                context.storage_state(path="auth.json")  # 로그인 세션 저장
                
            except Exception as e:
                print(f"❌ 로그인 중 오류 발생: {e}")
                print("🔄 수동 로그인이 필요할 수 있습니다.")
                # 오류 발생 시에도 계속 진행 (이미 로그인된 상태일 수 있음)

        for brand in selected_brands:
            print(f"🔍 {brand} 데이터 추출 중...")

            target_url = f"https://app.cigro.io/?menu=analysis&tab=product&group_by=option&brand_name={brand}&start_date={selected_date}&end_date={selected_date}"

            try:
                page = context.new_page()
                page.goto(target_url)
                
                # 페이지 로딩 대기
                page.wait_for_load_state('networkidle', timeout=15000)
                page.wait_for_timeout(3000)  # 추가 대기

                print(f"📊 {brand} 페이지 로딩 완료, 데이터 추출 시작...")
                df = extract_all_pages_data(page, selected_date)
                
                if df.empty:
                    print(f"⚠️ {brand} 브랜드에서 데이터를 찾을 수 없습니다.")
                    continue
                
                print(f"✅ {brand} 데이터 추출 완료: {len(df)}개 행")
                
                # 시트 이름을 브랜드 이름으로 지정하여 데이터 업로드
                upload_to_google_sheets(df, brand)  # 시트 이름은 브랜드명으로 지정
                
            except Exception as e:
                print(f"❌ {brand} 브랜드 데이터 추출 중 오류 발생: {e}")
                continue
            finally:
                try:
                    page.close()
                except:
                    pass

        context.close()
        browser.close()

if __name__ == "__main__":
    main()
