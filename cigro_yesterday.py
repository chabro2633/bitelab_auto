import os
import pandas as pd
import gspread
from oauth2client.service_account import ServiceAccountCredentials
from playwright.sync_api import sync_playwright
from datetime import datetime, timedelta

# Google Sheets 설정
GOOGLE_SHEET_NAME = "Cigro Sales"  # 👉 기본 시트 이름 (선택적으로 변경 가능)
GOOGLE_CRED_FILE = "google_sheet_credentials.json"  # 👉 다운로드한 JSON 파일 이름

# 로그인 정보
EMAIL = "tei.cha@bitelab.co.kr"  # 👉 이메일
PASSWORD = "qkfmsj123"  # 👉 비밀번호

BRANDS = ["바르너","릴리이버","색동서울"]  # 브랜드 이름 리스트

def upload_to_google_sheets(df, sheet_name):
    """
    구글 시트에 데이터를 업로드합니다.
    시트 이름을 매개변수로 받습니다.
    기존 데이터를 확인하고, 누락된 부분만 추가합니다.
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

    # 새 데이터에서 기존 데이터와 비교하여 누락된 데이터만 추가
    new_data = df[~df['date'].isin(existing_df['date'])]  # 날짜를 기준으로 누락된 데이터만 추출

    if not new_data.empty:
        # 시트에 누락된 데이터 추가
        sheet.append_rows(new_data.values.tolist(), value_input_option='RAW')
        print(f"✅ Google Sheets({sheet_name})에 누락된 데이터 업로드 완료")
    else:
        print(f"❌ {sheet_name} 시트에 누락된 데이터가 없습니다.")


def extract_all_pages_data(page, selected_date):
    all_data = []
    headers = None
    current_page = 1

    while True:
        print(f"📄 {current_page}페이지 데이터 추출 중...")

        columns = page.query_selector_all('div.sc-dkrFOg.cGhOUg')
        if not columns:
            print("❌ 컬럼을 찾을 수 없습니다.")
            break

        num_rows = len(columns[0].query_selector_all('div.sc-hLBbgP.jbaWzw'))
        for row_idx in range(num_rows):
            row_data = [selected_date]  # 날짜 컬럼 추가
            for col in columns:
                cells = col.query_selector_all('div.sc-hLBbgP.jbaWzw')
                value = cells[row_idx].inner_text().strip() if row_idx < len(cells) else ''
                row_data.append(value)
            all_data.append(row_data)

        # 헤더 추출
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
            print("❌ 페이지 번호를 찾을 수 없습니다.")
            break

        total_pages = int(page_text.split("/")[1].strip())
        if current_page >= total_pages:
            break

        pagination_div = page.query_selector('div.w-20.flex.justify-between.items-center')
        svgs = pagination_div.query_selector_all('svg') if pagination_div else []
        if len(svgs) >= 3:
            svgs[2].click()
        else:
            break

        page.wait_for_timeout(1000)  # 페이지가 완전히 로드될 때까지 대기

        current_page += 1

    df = pd.DataFrame(all_data, columns=headers)
    return df

def main():
    # 어제 날짜 계산
    yesterday = datetime.now() - timedelta(1)
    selected_date = yesterday.strftime("%Y-%m-%d")  # 어제 날짜를 'YYYY-MM-DD' 형식으로

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)

        if os.path.exists("auth.json"):
            print("🔐 기존 로그인 세션 불러오는 중...")
            context = browser.new_context(storage_state="auth.json")
        else:
            print("🧭 세션 없음 ➜ 수동 로그인 시작")
            context = browser.new_context()
            page = context.new_page()
            page.goto("https://app.cigro.io")
            print("📝 로그인 자동화 중...")
            
            # 이메일, 비밀번호 자동 입력
            page.fill('input.bubble-element.Input.cnaNaCaE0.a1746627658297x1166[type="email"]', EMAIL)  # 이메일 입력
            page.fill('input[type="password"]', PASSWORD)  # 비밀번호 입력
            
            # 로그인 버튼 클릭 (주어진 HTML 구조 기반)
            page.click('div.clickable-element.bubble-element.Group.cnaNaCaF0.bubble-r-container')  # 로그인 버튼 클릭
            page.wait_for_timeout(5000)  # 로그인 후 대기

            print("🔐 로그인 완료 후 세션 저장 중...")
            context.storage_state(path="auth.json")  # 로그인 세션 저장

        for brand in BRANDS:
            print(f"🔍 {brand} 데이터 추출 중...")

            target_url = f"https://app.cigro.io/?menu=analysis&tab=product&group_by=option&brand_name={brand}&start_date={selected_date}&end_date={selected_date}"

            page = context.new_page()
            page.goto(target_url)
            page.wait_for_timeout(5000)  # 테이블 로딩 대기

            df = extract_all_pages_data(page, selected_date)
            
            # 시트 이름을 브랜드 이름으로 지정하여 데이터 업로드
            upload_to_google_sheets(df, brand)  # 시트 이름은 브랜드명으로 지정

        context.close()
        browser.close()

if __name__ == "__main__":
    main()
