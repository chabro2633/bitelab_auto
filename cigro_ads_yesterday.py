#!/usr/bin/env python3
"""
Cigro 광고 데이터 스크래핑 스크립트
- 환경 변수 지원
- 브랜드 선택 기능
- 날짜 선택 기능
- 슬랙 알림 기능
- KST 기준 어제 날짜
"""

import os
import sys
import time
import pandas as pd
import gspread
from oauth2client.service_account import ServiceAccountCredentials
from playwright.sync_api import sync_playwright
from datetime import datetime, timedelta, timezone
import logging
import argparse
import json
import urllib.request
import urllib.error

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
EMAIL = os.getenv("EMAIL")
PASSWORD = os.getenv("PASSWORD")
SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL")

# 필수 환경 변수 검증
if not EMAIL or not PASSWORD:
    logger.error("❌ EMAIL과 PASSWORD 환경변수가 설정되지 않았습니다.")
    logger.error("   GitHub Secrets 또는 환경 변수를 확인하세요.")
    sys.exit(1)

# 광고 데이터용 브랜드 (바르너, 릴리이브만)
BRANDS = ["바르너", "릴리이브"]


def send_slack_notification(success: bool, message: str, details: dict = None):
    """
    Slack Incoming Webhook으로 알림을 전송합니다.
    """
    if not SLACK_WEBHOOK_URL:
        logger.warning("⚠️ SLACK_WEBHOOK_URL이 설정되지 않아 슬랙 알림을 건너뜁니다.")
        return

    if success:
        emoji = "✅"
        color = "#36a64f"
        status = "성공"
    else:
        emoji = "❌"
        color = "#dc3545"
        status = "실패"

    blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": f"{emoji} Cigro 광고 스크래핑 {status}",
                "emoji": True
            }
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": message
            }
        }
    ]

    if details:
        fields = []
        for key, value in details.items():
            fields.append({
                "type": "mrkdwn",
                "text": f"*{key}:*\n{value}"
            })
        blocks.append({
            "type": "section",
            "fields": fields[:10]
        })

    KST = timezone(timedelta(hours=9))
    now_kst = datetime.now(KST)
    blocks.append({
        "type": "context",
        "elements": [
            {
                "type": "mrkdwn",
                "text": f"🕐 {now_kst.strftime('%Y-%m-%d %H:%M:%S')} KST"
            }
        ]
    })

    payload = {
        "blocks": blocks,
        "attachments": [{"color": color, "blocks": []}]
    }

    try:
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            SLACK_WEBHOOK_URL,
            data=data,
            headers={'Content-Type': 'application/json'}
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status == 200:
                logger.info("📨 슬랙 알림 전송 완료")
            else:
                logger.warning(f"⚠️ 슬랙 알림 전송 실패: HTTP {response.status}")
    except Exception as e:
        logger.warning(f"⚠️ 슬랙 알림 전송 중 오류: {e}")


def upload_to_google_sheets(df, sheet_name, selected_date):
    """
    구글 시트에 광고 데이터를 업로드합니다.
    """
    if df.empty:
        logger.warning(f"⚠️ 업로드할 데이터가 없습니다. (시트: {sheet_name}, 날짜: {selected_date})")
        return

    if "date" not in df.columns:
        logger.error("❌ DF에 'date' 컬럼이 없습니다. 업로드 중단.")
        return

    df = df[df["date"].astype(str) == str(selected_date)]
    if df.empty:
        logger.warning(f"⚠️ DF 안에 '{selected_date}' 날짜 데이터가 없습니다. (시트: {sheet_name})")
        return

    new_count = len(df)
    logger.info(f"📊 새로 가져온 '{selected_date}' 데이터 행 수: {new_count}")

    scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
    creds = ServiceAccountCredentials.from_json_keyfile_name(GOOGLE_CRED_FILE, scope)
    client = gspread.authorize(creds)

    spreadsheet = client.open(GOOGLE_SHEET_NAME)

    try:
        sheet = spreadsheet.worksheet(sheet_name)
        is_new_sheet = False
        logger.info(f"✅ 기존 시트 '{sheet_name}' 찾기 완료")
    except gspread.exceptions.WorksheetNotFound:
        logger.info(f"❌ '{sheet_name}' 시트가 없으므로 새로 생성합니다.")
        sheet = spreadsheet.add_worksheet(title=sheet_name, rows="100", cols="20")
        is_new_sheet = True

    if is_new_sheet:
        values = [df.columns.tolist()] + df.values.tolist()
        sheet.update("A1", values, value_input_option="RAW")
        logger.info(f"✅ 새 시트 '{sheet_name}'에 '{selected_date}' 데이터 {len(df)}행 업로드 완료")
        return

    header_row = sheet.row_values(1)
    if not header_row:
        logger.warning(f"⚠️ '{sheet_name}' 시트에 헤더가 없어 새로 작성합니다.")
        values = [df.columns.tolist()] + df.values.tolist()
        sheet.update("A1", values, value_input_option="RAW")
        logger.info(f"✅ 헤더가 없던 시트 '{sheet_name}'를 초기화하고 '{selected_date}' 데이터 업로드 완료")
        return

    existing_records = sheet.get_all_records()

    existing_count = 0
    rows_to_delete = []

    if existing_records:
        for idx, record in enumerate(existing_records):
            record_date = str(record.get("date", "")).strip()
            if record_date == str(selected_date):
                existing_count += 1
                row_index = idx + 2
                rows_to_delete.append(row_index)

    logger.info(f"📊 시트 '{sheet_name}'에 이미 저장된 '{selected_date}' 데이터 행 수: {existing_count}")

    if existing_count == 0:
        sheet.append_rows(df.values.tolist(), value_input_option="RAW")
        logger.info(f"✅ '{sheet_name}' 시트에 '{selected_date}' 날짜 신규 {len(df)}행 append 완료")
        return

    if new_count > existing_count:
        logger.info(f"🔄 새 데이터({new_count}행)가 기존 데이터({existing_count}행)보다 많음 → overwrite 진행")

        rows_to_delete_sorted = sorted(rows_to_delete)
        ranges = []
        start = prev = rows_to_delete_sorted[0]
        for r in rows_to_delete_sorted[1:]:
            if r == prev + 1:
                prev = r
            else:
                ranges.append((start, prev))
                start = prev = r
        ranges.append((start, prev))

        for start, end in reversed(ranges):
            logger.info(f"🧹 '{selected_date}' 기존 행 삭제: {start} ~ {end}")
            sheet.delete_rows(start, end)

        sheet.append_rows(df.values.tolist(), value_input_option="RAW")
        logger.info(f"✅ '{sheet_name}' 시트의 '{selected_date}' 데이터 {new_count}행으로 교체 완료")
    else:
        logger.info(f"⛔ 기존 데이터({existing_count}행)가 새 데이터({new_count}행)보다 크거나 같음 → 업데이트 하지 않음")


def extract_all_pages_data(page, selected_date):
    """
    gridjs 테이블 구조 기반으로 모든 페이지 데이터를 수집합니다.
    """
    all_rows = []
    headers = None

    while True:
        if headers is None:
            header_cells = page.query_selector_all('thead.gridjs-thead th div.gridjs-th-content')
            if not header_cells:
                logger.error("❌ 헤더를 찾을 수 없습니다.")
                return pd.DataFrame()

            header_texts = [c.inner_text().strip() for c in header_cells]
            headers = ["date"] + header_texts
            logger.info(f"✅ 헤더 추출 완료: {headers}")

        body_rows = page.query_selector_all('tbody.gridjs-tbody tr.gridjs-tr')
        if not body_rows:
            logger.warning("⚠️ 바디 row 없음 (페이지 로딩 문제?)")
            break

        for row in body_rows:
            cell_values = [td.inner_text().strip() for td in row.query_selector_all('td.gridjs-td')]
            row_data = [selected_date] + cell_values
            all_rows.append(row_data)

        next_btn = page.query_selector('button[aria-label="Next"]')

        if not next_btn:
            logger.info("❌ Next 버튼을 찾을 수 없습니다. 페이지네이션 종료")
            break

        if next_btn.get_attribute("disabled") is not None:
            logger.info("⛔ 마지막 페이지 도달 (Next disabled)")
            break

        next_btn.click()
        logger.info("➡️ Next 페이지 이동")
        page.wait_for_timeout(1200)

    if not all_rows:
        logger.warning("⚠️ 수집된 데이터가 없습니다.")
        return pd.DataFrame(columns=headers if headers else None)

    row_len = len(all_rows[0])
    if len(headers) < row_len:
        headers = headers + [f"컬럼{idx+1}" for idx in range(row_len - len(headers))]
    elif len(headers) > row_len:
        headers = headers[:row_len]

    df = pd.DataFrame(all_rows, columns=headers)
    return df


def parse_arguments():
    """명령줄 인수를 파싱합니다."""
    parser = argparse.ArgumentParser(description='Cigro 광고 데이터 스크래핑 스크립트')
    parser.add_argument('--start-date', '-s', type=str, help='시작 날짜 (YYYY-MM-DD)')
    parser.add_argument('--end-date', '-e', type=str, help='종료 날짜 (YYYY-MM-DD)')
    parser.add_argument('--brands', '-b', nargs='+', help='스크래핑할 브랜드 목록')
    parser.add_argument('--headless', action='store_true', default=True, help='헤드리스 모드 (기본값: True)')
    parser.add_argument('--no-headless', dest='headless', action='store_false', help='헤드리스 모드 비활성화')
    return parser.parse_args()


def get_date_range(start_date_str, end_date_str):
    """시작 날짜와 종료 날짜 사이의 모든 날짜를 반환합니다."""
    dates = []
    KST = timezone(timedelta(hours=9))

    if start_date_str:
        start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
    else:
        # 기본값: KST 기준 어제 날짜
        now_kst = datetime.now(KST)
        start_date = now_kst - timedelta(1)

    if end_date_str:
        end_date = datetime.strptime(end_date_str, "%Y-%m-%d")
    else:
        end_date = start_date

    if start_date > end_date:
        start_date, end_date = end_date, start_date

    current_date = start_date
    while current_date <= end_date:
        dates.append(current_date.strftime("%Y-%m-%d"))
        current_date += timedelta(1)

    return dates


def main():
    args = parse_arguments()

    logger.info("🚀 Cigro 광고 데이터 스크래핑 시작")

    try:
        date_range = get_date_range(args.start_date, args.end_date)
        if len(date_range) == 1:
            logger.info(f"📅 스크래핑 날짜: {date_range[0]}")
        else:
            logger.info(f"📅 스크래핑 기간: {date_range[0]} ~ {date_range[-1]} ({len(date_range)}일)")
    except ValueError as e:
        logger.error(f"❌ 잘못된 날짜 형식입니다. YYYY-MM-DD 형식을 사용하세요. 오류: {e}")
        sys.exit(1)

    if args.brands:
        selected_brands = args.brands
        logger.info(f"📋 선택된 브랜드: {', '.join(selected_brands)}")
    else:
        selected_brands = BRANDS
        logger.info(f"📋 모든 브랜드 스크래핑: {', '.join(selected_brands)}")

    with sync_playwright() as p:
        browser_args = [
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--disable-extensions',
            '--disable-plugins',
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

                page.fill('input.bubble-element.Input.cnaNaCaE0.a1746627658297x1166[type="email"]', EMAIL)
                page.fill('input[type="password"]', PASSWORD)

                page.click('div.clickable-element.bubble-element.Group.cnaNaCaF0.bubble-r-container')
                page.wait_for_load_state('networkidle', timeout=15000)

                logger.info("🔐 로그인 완료 후 세션 저장 중...")
                context.storage_state(path="auth.json")
                page.close()

            total_success = 0
            total_fail = 0

            logger.info(f"🚀 {len(date_range)}일 x {len(selected_brands)}개 브랜드 광고 데이터 스크래핑 시작...")

            for date_idx, selected_date in enumerate(date_range):
                logger.info(f"📅 [{date_idx + 1}/{len(date_range)}] {selected_date} 날짜 스크래핑 중...")

                for brand in selected_brands:
                    logger.info(f"🔍 {brand} - {selected_date} 광고 데이터 추출 중...")

                    try:
                        target_url = (
                            "https://app.cigro.io/?menu=analysis&tab=ad&group_by=campaign"
                            f"&brand_name={brand}&start_date={selected_date}&end_date={selected_date}"
                        )

                        page = context.new_page()
                        page.goto(target_url)
                        page.wait_for_timeout(10000)

                        df = extract_all_pages_data(page, selected_date)

                        sheet_name = f"{brand}_광고"
                        upload_to_google_sheets(df, sheet_name, selected_date)

                        page.close()

                        total_success += 1
                        logger.info(f"✅ {brand} - {selected_date} 광고 스크래핑 완료")

                    except Exception as e:
                        total_fail += 1
                        logger.error(f"❌ {brand} - {selected_date} 광고 스크래핑 실패: {e}")

            # 최종 결과 요약
            total_tasks = len(date_range) * len(selected_brands)
            logger.info("=" * 50)
            logger.info("📊 광고 스크래핑 결과 요약")
            logger.info(f"📅 스크래핑 기간: {date_range[0]} ~ {date_range[-1]} ({len(date_range)}일)")
            logger.info(f"📋 스크래핑 브랜드: {', '.join(selected_brands)}")
            logger.info(f"✅ 성공: {total_success}건 / ❌ 실패: {total_fail}건")
            logger.info(f"📈 성공률: {total_success}/{total_tasks} ({total_success/total_tasks*100:.1f}%)")
            logger.info("=" * 50)

            # 슬랙 알림 전송
            success_rate = total_success / total_tasks * 100 if total_tasks > 0 else 0
            is_success = total_success > 0

            if len(date_range) == 1:
                date_info = date_range[0]
            else:
                date_info = f"{date_range[0]} ~ {date_range[-1]}"

            slack_details = {
                "📅 기간": date_info,
                "📋 브랜드": ", ".join(selected_brands),
                "✅ 성공": f"{total_success}건",
                "❌ 실패": f"{total_fail}건",
                "📈 성공률": f"{success_rate:.1f}%"
            }

            if is_success:
                slack_message = f"*{len(date_range)}일* x *{len(selected_brands)}개 브랜드* 광고 스크래핑이 완료되었습니다."
                logger.info("🎉 광고 스크래핑 작업이 완료되었습니다!")
            else:
                slack_message = "모든 광고 스크래핑이 실패했습니다. 로그를 확인해주세요."
                logger.error("❌ 모든 광고 스크래핑이 실패했습니다.")

            send_slack_notification(is_success, slack_message, slack_details)

        except Exception as e:
            logger.error(f"❌ 광고 스크래핑 중 오류 발생: {e}")
            send_slack_notification(
                success=False,
                message=f"광고 스크래핑 중 예외가 발생했습니다.",
                details={"🔴 오류": str(e)}
            )
        finally:
            browser.close()


if __name__ == "__main__":
    main()
