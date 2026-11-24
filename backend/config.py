"""
環境変数の一元管理。
全モジュールはここから設定値を取得する（os.environ直参照は禁止）。
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- アプリ基本設定 ---
    app_env: str = "development"
    cors_allow_origins: str = "http://localhost:3000"

    # --- Supabase ---
    supabase_url: str
    supabase_service_role_key: str

    # --- Discord ---
    discord_webhook_url: str = ""
    # エラー通知の送り先（未設定なら discord_webhook_url に送る）
    discord_alert_webhook_url: str = ""

    # --- 認証（Supabase Auth の Google ログイン） ---
    # ログインできるのは「このドメイン（サブドメイン含む）のメール」かつ「members に email 登録済み」の人だけ。
    # カンマ区切りで複数指定可。空にするとドメイン制限なし（members 登録だけで判定）。
    allowed_email_domain: str = "osaka-u.ac.jp"
    # 初期管理者のメール（カンマ区切り）。members に未登録でもログインでき、初回ログイン時に
    # 管理者として members に自動登録される。最初の1人を作るために使う。
    admin_emails: str = ""
    # ローカル開発専用。true にすると認証を行わず、全リクエストを開発用管理者として扱う。
    # 本番（APP_ENV=production）では無視される。
    auth_disabled: bool = False

    # --- 定期実行（毎朝のリマインド等）---
    # /api/cron/* を呼ぶときに X-Cron-Secret ヘッダで渡す合言葉。未設定なら定期実行APIは無効。
    cron_secret: str = ""

    # --- カレンダー配信（iCal）---
    # 設定すると /api/calendar/<この値>.ics でイベントを配信する（Googleカレンダー等から購読）。
    calendar_feed_token: str = ""

    # --- Web Push（スマホへの通知）---
    # `python -m push_keys` で作成した鍵。未設定なら通知機能は無効。
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:admin@example.com"

    @property
    def admin_emails_list(self) -> list[str]:
        return [e.strip().lower() for e in self.admin_emails.split(",") if e.strip()]

    @property
    def allowed_domains_list(self) -> list[str]:
        return [d.strip().lower().lstrip("@") for d in self.allowed_email_domain.split(",") if d.strip()]

    @property
    def domains_text(self) -> str:
        """画面に出す許可ドメイン（例: @osaka-u.ac.jp）"""
        return "・".join("@" + d for d in self.allowed_domains_list)

    def email_allowed(self, email: str) -> bool:
        """許可ドメイン（またはそのサブドメイン）のメールか。制限なしなら常に True。"""
        domains = self.allowed_domains_list
        if not domains:
            return True
        host = email.lower().rsplit("@", 1)[-1]
        return any(host == d or host.endswith("." + d) for d in domains)

    @property
    def auth_is_disabled(self) -> bool:
        return self.auth_disabled and self.app_env != "production"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_allow_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    """
    Settingsはプロセス内で使い回す（.envの再パースを避ける）。
    テスト等で差し替える場合は get_settings.cache_clear() を呼ぶこと。
    """
    return Settings()
