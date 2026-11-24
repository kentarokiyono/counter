"""
Web Push 用の鍵（VAPID）を作る。一度だけ実行し、出力を backend の環境変数に設定する。

    python -m push_keys
"""
import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def generate() -> tuple[str, str]:
    key = ec.generate_private_key(ec.SECP256R1())
    private = key.private_numbers().private_value.to_bytes(32, "big")
    public = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return _b64(public), _b64(private)


if __name__ == "__main__":
    pub, priv = generate()
    print(f"VAPID_PUBLIC_KEY={pub}")
    print(f"VAPID_PRIVATE_KEY={priv}")
    print("VAPID_SUBJECT=mailto:<管理者のメールアドレス>")
