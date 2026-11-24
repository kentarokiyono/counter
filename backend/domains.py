"""
タスクの分類（Toloc の業務区分）。schema.sql の CHECK 制約と frontend/lib/types.ts と一致させること。
"""
from typing import Literal

DOMAIN_LABELS: dict[str, str] = {
    "planning": "企画",
    "pr": "広報・SNS",
    "liaison": "地域連携・渉外",
    "fieldwork": "現地活動",
    "survey": "調査・集計",
    "admin": "会計・事務",
}

DOMAINS: list[str] = list(DOMAIN_LABELS)

TaskDomain = Literal["planning", "pr", "liaison", "fieldwork", "survey", "admin"]
