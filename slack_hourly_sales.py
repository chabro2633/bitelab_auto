#!/usr/bin/env python3
"""
바르너 실시간 매출현황을 Slack으로 전송하는 스크립트
매 시간 정각에 GitHub Actions에서 실행됨
"""

import os
import json
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone

# 환경변수
SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL")
VERCEL_API_URL = "https://app-bitelab.vercel.app/api/cafe24"
CAFE24_API_KEY = os.getenv("CAFE24_API_KEY")

# KST 타임존
KST = timezone(timedelta(hours=9))


def fetch_sales_data():
    """Vercel API에서 매출 데이터 조회"""
    if not CAFE24_API_KEY:
        raise ValueError("CAFE24_API_KEY 환경변수가 설정되지 않았습니다.")

    req = urllib.request.Request(
        VERCEL_API_URL,
        headers={
            "X-API-Key": CAFE24_API_KEY,
            "Content-Type": "application/json"
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.loads(response.read().decode('utf-8'))
            if not data.get('success'):
                raise ValueError(f"API 응답 실패: {data.get('error', 'Unknown error')}")
            return data
    except urllib.error.HTTPError as e:
        raise ValueError(f"API 호출 실패: HTTP {e.code} - {e.reason}")
    except urllib.error.URLError as e:
        raise ValueError(f"API 연결 실패: {e.reason}")


def format_number(num):
    """숫자를 천 단위 콤마 포맷으로 변환"""
    return f"{num:,}"


def calculate_change(today, yesterday):
    """증감률 계산"""
    if yesterday == 0:
        if today > 0:
            return "NEW", "up"
        return "-", "same"

    change_percent = round(((today - yesterday) / yesterday) * 100)
    if change_percent > 0:
        return f"+{change_percent}%", "up"
    elif change_percent < 0:
        return f"{change_percent}%", "down"
    else:
        return "0%", "same"


def build_slack_message(data):
    """Slack Block Kit 메시지 구성"""
    now_kst = datetime.now(KST)
    current_hour = now_kst.hour

    # 시간별 매출 데이터
    hourly_sales = data.get('hourlySales', [])
    yesterday_hourly = data.get('yesterdayHourlySales', [])

    # 어제 데이터를 딕셔너리로 변환
    yesterday_map = {h['hour']: h for h in yesterday_hourly}

    # 현재까지 누적 매출 계산
    today_total = sum(h['sales'] for h in hourly_sales if h['hour'] <= current_hour)
    yesterday_total = sum(h['sales'] for h in yesterday_hourly if h['hour'] <= current_hour)

    # 증감 계산
    diff = today_total - yesterday_total
    change_text, change_type = calculate_change(today_total, yesterday_total)

    # 증감 이모지
    if change_type == "up":
        change_emoji = ":chart_with_upwards_trend:"
        diff_text = f"+{format_number(diff)}원"
    elif change_type == "down":
        change_emoji = ":chart_with_downwards_trend:"
        diff_text = f"{format_number(diff)}원"
    else:
        change_emoji = ":heavy_minus_sign:"
        diff_text = "0원"

    # 최근 3시간 매출 (현재 시간 포함)
    recent_hours = []
    for hour in range(max(0, current_hour - 2), current_hour + 1):
        today_data = next((h for h in hourly_sales if h['hour'] == hour), {'sales': 0, 'orders': 0})
        yesterday_data = yesterday_map.get(hour, {'sales': 0, 'orders': 0})

        hour_change, hour_type = calculate_change(today_data['sales'], yesterday_data['sales'])
        hour_emoji = ":arrow_up:" if hour_type == "up" else ":arrow_down:" if hour_type == "down" else ":heavy_minus_sign:"

        recent_hours.append({
            'hour': hour,
            'today': today_data['sales'],
            'yesterday': yesterday_data['sales'],
            'change': hour_change,
            'emoji': hour_emoji
        })

    # 최근 시간대 텍스트 구성
    recent_text = ""
    for h in recent_hours:
        recent_text += f"• {str(h['hour']).zfill(2)}시: *{format_number(h['today'])}원* (어제 {format_number(h['yesterday'])}원) {h['emoji']} {h['change']}\n"

    # Slack Block Kit 메시지
    blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": f":bar_chart: 바르너 실시간 매출 현황 ({current_hour}시 기준)",
                "emoji": True
            }
        },
        {
            "type": "divider"
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*:moneybag: 현재까지 매출*\n\n오늘: *{format_number(today_total)}원*\n어제 같은시간: {format_number(yesterday_total)}원\n\n{change_emoji} 차이: *{diff_text}* ({change_text})"
            }
        },
        {
            "type": "divider"
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*:alarm_clock: 최근 시간대 매출*\n\n{recent_text}"
            }
        },
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": f":clock1: {now_kst.strftime('%Y-%m-%d %H:%M:%S')} KST"
                }
            ]
        }
    ]

    return {"blocks": blocks}


def send_slack_notification(payload):
    """Slack Webhook으로 전송"""
    if not SLACK_WEBHOOK_URL:
        print("SLACK_WEBHOOK_URL이 설정되지 않아 Slack 알림을 건너뜁니다.")
        return False

    try:
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            SLACK_WEBHOOK_URL,
            data=data,
            headers={'Content-Type': 'application/json'}
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status == 200:
                print("Slack 알림 전송 완료")
                return True
            else:
                print(f"Slack 알림 전송 실패: HTTP {response.status}")
                return False
    except urllib.error.URLError as e:
        print(f"Slack 알림 전송 실패: {e}")
        return False
    except Exception as e:
        print(f"Slack 알림 전송 중 오류: {e}")
        return False


def main():
    print("=" * 50)
    print("바르너 실시간 매출 Slack 알림")
    print(f"실행 시간: {datetime.now(KST).strftime('%Y-%m-%d %H:%M:%S')} KST")
    print("=" * 50)

    try:
        # 1. 매출 데이터 조회
        print("\n1. Vercel API에서 매출 데이터 조회 중...")
        data = fetch_sales_data()
        print(f"   - 오늘 총 매출: {format_number(data.get('stats', {}).get('totalSales', 0))}원")
        print(f"   - 시간별 데이터: {len(data.get('hourlySales', []))}개")

        # 2. Slack 메시지 구성
        print("\n2. Slack 메시지 구성 중...")
        message = build_slack_message(data)

        # 3. Slack 전송
        print("\n3. Slack 알림 전송 중...")
        success = send_slack_notification(message)

        if success:
            print("\n완료!")
        else:
            print("\nSlack 전송 실패")
            exit(1)

    except Exception as e:
        print(f"\n오류 발생: {e}")
        # 오류 발생 시에도 Slack으로 알림
        error_payload = {
            "blocks": [
                {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": ":warning: 매출 알림 오류",
                        "emoji": True
                    }
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"매출 데이터 조회 중 오류가 발생했습니다.\n\n```{str(e)}```"
                    }
                }
            ]
        }
        send_slack_notification(error_payload)
        exit(1)


if __name__ == "__main__":
    main()
