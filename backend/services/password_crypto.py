import base64
import os

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa


def _load_private_key():
    key_pem = os.getenv('PASSWORD_PRIVATE_KEY_PEM')
    if key_pem:
        key_pem = key_pem.replace('\\n', '\n').encode('utf-8')
        return serialization.load_pem_private_key(key_pem, password=None)

    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


_PRIVATE_KEY = _load_private_key()


def get_public_key_pem():
    return _PRIVATE_KEY.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode('utf-8')


def decrypt_password(encrypted_password):
    if not encrypted_password or not isinstance(encrypted_password, str):
        raise ValueError('缺少加密密码')

    try:
        encrypted_bytes = base64.b64decode(encrypted_password, validate=True)
    except Exception as exc:
        raise ValueError('加密密码格式无效') from exc

    if len(encrypted_bytes) > 512:
        raise ValueError('加密密码长度异常')

    try:
        password = _PRIVATE_KEY.decrypt(
            encrypted_bytes,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None,
            ),
        )
        return password.decode('utf-8')
    except Exception as exc:
        raise ValueError('密码解密失败') from exc
