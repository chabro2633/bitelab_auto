import time
import os
import pandas as pd
import gspread
from oauth2client.service_account import ServiceAccountCredentials
from playwright.sync_api import sync_playwright
from datetime import datetime, timedelta, timezone

# ==========================
# 설정 영역
# ==========================

# Google Sheets 설정
GOOGLE_SHEET_NAME = "Cigro Sales"  # 👉 기본 스프레드시트 이름
GOOGLE_CRED_FILE = "google_sheet_credentials.json"  # 👉 다운로드한 JSON 파일 이름

# 로그인 정보
EMAIL = "tei.cha@bitelab.co.kr"  # 👉 이메일
PASSWORD = "qkfmsj123"           # 👉 비밀번호

BRANDS = ["바르너", "색동서울", "보호리", "먼슬리픽", "릴리이브"]  # 브랜드 이름 리스트

# 날짜 모드 설정
USE_DATE_RANGE = False  # False: 어제 하루만, True: 날짜 범위 사용
DATE_RANGE_START = "2025-12-30"  # USE_DATE_RANGE=True 일 때만 사용
DATE_RANGE_END = "2026-01-04"    # USE_DATE_RANGE=True 일 때만 사용


def upload_to_google_sheets(df, sheet_name, selected_date):
    """
    구글 시트에 데이터를 업로드합니다.

    - DF는 selected_date 하루치 데이터라고 가정.
    - 시트가 없으면: 헤더 + 전체 데이터 업로드.
    - 시트가 있으면:
        1) 기존 시트에서 date == selected_date 인 행 개수(existing_count)를 구함
        2) 새 DF의 행 개수(new_count)와 비교
        3) new_count > existing_count 이면:
            - 해당 날짜의 기존 행들만 모두 삭제(연속 구간으로 묶어서 최소 호출)
            - 새 DF 전체를 append (overwrite)
        4) new_count <= existing_count 이면:
            - 아무 작업도 하지 않음
    """
    if df.empty:
        print(f"⚠️ 업로드할 데이터가 없습니다. (시트: {sheet_name}, 날짜: {selected_date})")
        return

    if "date" not in df.columns:
        print("❌ DF에 'date' 컬럼이 없습니다. 업로드 중단.")
        return

    # 선택된 날짜만 필터링 (혹시라도 df 안에 다른 날짜가 섞여 있을 대비)
    df = df[df["date"].astype(str) == str(selected_date)]
    if df.empty:
        print(f"⚠️ DF 안에 '{selected_date}' 날짜 데이터가 없습니다. (시트: {sheet_name})")
        return

    new_count = len(df)
    print(f"📊 새로 가져온 '{selected_date}' 데이터 행 수: {new_count}")

    # Google Sheets 인증
    scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
    creds = ServiceAccountCredentials.from_json_keyfile_name(GOOGLE_CRED_FILE, scope)
    client = gspread.authorize(creds)

    # 스프레드시트 열기
    spreadsheet = client.open(GOOGLE_SHEET_NAME)

    # 시트 존재 여부 확인
    try:
        sheet = spreadsheet.worksheet(sheet_name)
        is_new_sheet = False
        print(f"✅ 기존 시트 '{sheet_name}' 찾기 완료")
    except gspread.exceptions.WorksheetNotFound:
        print(f"❌ '{sheet_name}' 시트가 없으므로 새로 생성합니다.")
        sheet = spreadsheet.add_worksheet(title=sheet_name, rows="100", cols="20")
        is_new_sheet = True

    # 🔹 새 시트인 경우: 헤더 + 전체 데이터 바로 기록 (한 번의 update로)
    if is_new_sheet:
        values = [df.columns.tolist()] + df.values.tolist()
        sheet.update("A1", values, value_input_option="RAW")
        print(f"✅ 새 시트 '{sheet_name}'에 '{selected_date}' 데이터 {len(df)}행 업로드 완료")
        return

    # 🔹 기존 시트인 경우
    # 1) 헤더 체크
    header_row = sheet.row_values(1)
    if not header_row:
        print(f"⚠️ '{sheet_name}' 시트에 헤더가 없어 새로 작성합니다.")
        values = [df.columns.tolist()] + df.values.tolist()
        sheet.update("A1", values, value_input_option="RAW")
        print(f"✅ 헤더가 없던 시트 '{sheet_name}'를 초기화하고 '{selected_date}' 데이터 업로드 완료")
        return
    else:
        # 2) 모든 레코드 가져오기 (row1 = header, row2부터 데이터)
        existing_records = sheet.get_all_records()  # list[dict]

    # 3) 기존 데이터 중 해당 날짜의 행 개수 계산 + row index 모으기
    existing_count = 0
    rows_to_delete = []

    if existing_records:
        for idx, record in enumerate(existing_records):
            record_date = str(record.get("date", "")).strip()
            if record_date == str(selected_date):
                existing_count += 1
                # 실제 시트 row index = header(1) + data 시작(1) + idx
                row_index = idx + 2
                rows_to_delete.append(row_index)

    print(f"📊 시트 '{sheet_name}'에 이미 저장된 '{selected_date}' 데이터 행 수: {existing_count}")

    # 4) 비교 후 overwrite 여부 결정
    if existing_count == 0:
        # 해당 날짜 데이터가 없으면 그냥 append
        sheet.append_rows(df.values.tolist(), value_input_option="RAW")
        print(f"✅ '{sheet_name}' 시트에 '{selected_date}' 날짜 신규 {len(df)}행 append 완료")
        return

    if new_count > existing_count:
        print(f"🔄 새 데이터({new_count}행)가 기존 데이터({existing_count}행)보다 많음 → overwrite 진행")

        # ----- ✅ 연속 구간으로 묶어서 한 번에 삭제 -----
        rows_to_delete_sorted = sorted(rows_to_delete)

        # 연속된 구간을 (start, end) 리스트로 나누기
        ranges = []
        start = prev = rows_to_delete_sorted[0]
        for r in rows_to_delete_sorted[1:]:
            if r == prev + 1:
                prev = r
            else:
                ranges.append((start, prev))
                start = prev = r
        ranges.append((start, prev))

        # 뒤에서부터 삭제 (인덱스 꼬임 방지)
        for start, end in reversed(ranges):
            print(f"🧹 '{selected_date}' 기존 행 삭제: {start} ~ {end}")
            sheet.delete_rows(start, end)

        # 새 데이터 append (한 번 호출)
        sheet.append_rows(df.values.tolist(), value_input_option="RAW")
        print(f"✅ '{sheet_name}' 시트의 '{selected_date}' 데이터 {new_count}행으로 교체(overwrite) 완료")

        # 아주 빡빡한 환경이면 날짜마다 살짝 쉬어도 됨 (선택)
        # time.sleep(1)

    else:
        print(
            f"⛔ 기존 데이터({existing_count}행)가 새 데이터({new_count}행)보다 크거나 같음 → 업데이트 하지 않음"
        )


def extract_all_pages_data(page, selected_date):
    """
    gridjs 테이블 구조 기반으로 모든 페이지 데이터를 수집합니다.
    페이지 이동은 aria-label="Next" 버튼 클릭.
    """
    all_rows = []
    headers = None

    while True:
        # -----------------------------
        # 1) 헤더 추출 (최초 1번만)
        # -----------------------------
        if headers is None:
            header_cells = page.query_selector_all('thead.gridjs-thead th div.gridjs-th-content')
            if not header_cells:
                print("❌ 헤더를 찾을 수 없습니다.")
                return pd.DataFrame()

            header_texts = [c.inner_text().strip() for c in header_cells]
            headers = ["date"] + header_texts
            print(f"✅ 헤더 추출 완료: {headers}")

        # -----------------------------
        # 2) 바디(rows) 추출
        # -----------------------------
        body_rows = page.query_selector_all('tbody.gridjs-tbody tr.gridjs-tr')
        if not body_rows:
            print("⚠️ 바디 row 없음 (페이지 로딩 문제?)")
            break

        for row in body_rows:
            cell_values = [td.inner_text().strip() for td in row.query_selector_all('td.gridjs-td')]
            row_data = [selected_date] + cell_values
            all_rows.append(row_data)

        # -----------------------------
        # 3) Next 버튼 존재 여부 확인
        # -----------------------------
        next_btn = page.query_selector('button[aria-label="Next"]')

        if not next_btn:
            print("❌ Next 버튼을 찾을 수 없습니다. 페이지네이션 종료")
            break

        # disabled면 마지막 페이지
        if next_btn.get_attribute("disabled") is not None:
            print("⛔ 마지막 페이지 도달 (Next disabled)")
            break

        # -----------------------------
        # 4) 다음 페이지로 이동
        # -----------------------------
        next_btn.click()
        print("➡️  Next 페이지 이동")
        page.wait_for_timeout(1200)  # 페이지 렌더링 대기

    # -----------------------------
    # 5) DataFrame 생성
    # -----------------------------
    if not all_rows:
        print("⚠️ 수집된 데이터가 없습니다.")
        return pd.DataFrame(columns=headers if headers else None)

    # 컬럼 수 mismatch 안전장치
    row_len = len(all_rows[0])
    if len(headers) < row_len:
        headers = headers + [f"컬럼{idx+1}" for idx in range(row_len - len(headers))]
    elif len(headers) > row_len:
        headers = headers[:row_len]

    df = pd.DataFrame(all_rows, columns=headers)
    return df


def build_target_dates():
    """
    어제 하루 or 날짜 범위 중 설정에 따라 수집 대상 날짜 리스트를 반환.
    """
    if USE_DATE_RANGE:
        start = datetime.strptime(DATE_RANGE_START, "%Y-%m-%d").date()
        end = datetime.strptime(DATE_RANGE_END, "%Y-%m-%d").date()
        if end < start:
            raise ValueError("DATE_RANGE_END가 DATE_RANGE_START보다 앞입니다.")
        days = (end - start).days + 1
        return [(start + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(days)]
    else:
        # 어제 하루 (KST 기준)
        KST = timezone(timedelta(hours=9))
        now_kst = datetime.now(KST)
        yesterday = now_kst - timedelta(1)
        return [yesterday.strftime("%Y-%m-%d")]


def main():
    target_dates = build_target_dates()
    print("🎯 수집 대상 날짜들:", target_dates)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # 로그인/세션
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
            page.fill(
                'input.bubble-element.Input.cnaNaCaE0.a1746627658297x1166[type="email"]',
                EMAIL
            )
            page.fill('input[type="password"]', PASSWORD)

            # 로그인 버튼 클릭
            page.click('div.clickable-element.bubble-element.Group.cnaNaCaF0.bubble-r-container')
            page.wait_for_timeout(5000)  # 로그인 후 대기

            print("🔐 로그인 완료 후 세션 저장 중...")
            context.storage_state(path="auth.json")  # 로그인 세션 저장

        # 날짜별 + 브랜드별 반복
        for selected_date in target_dates:
            for brand in BRANDS:
                print(f"\n==============================")
                print(f"🔍 {selected_date} / {brand} 데이터 추출 중...")
                print(f"==============================")

                target_url = (
                    "https://app.cigro.io/?menu=analysis&tab=ad&group_by=campaign"
                    f"&brand_name={brand}&start_date={selected_date}&end_date={selected_date}"
                )

                page = context.new_page()
                page.goto(target_url)
                page.wait_for_timeout(10000)  # 테이블 로딩 대기

                df = extract_all_pages_data(page, selected_date)

                sheet_name = f"{brand}_광고"
                upload_to_google_sheets(df, sheet_name, selected_date)

                page.close()

        context.close()
        browser.close()


if __name__ == "__main__":
    main()
