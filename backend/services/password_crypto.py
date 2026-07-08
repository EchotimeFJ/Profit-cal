import base64
import os

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa


def _default_private_key_path():
    backend_dir = os.path.dirname(os.path.dirname(__file__))
    return os.path.join(backend_dir, 'instance', 'password_private_key.pem')


def _generate_private_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _serialize_private_key(private_key):
    return private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )


def _load_private_key_from_file(key_path):
    if not os.path.exists(key_path):
        return None

    with open(key_path, 'rb') as key_file:
        return serialization.load_pem_private_key(key_file.read(), password=None)


def _persist_private_key(private_key, key_path):
    os.makedirs(os.path.dirname(key_path), exist_ok=True)

    if not os.path.exists(key_path):
        with open(key_path, 'wb') as key_file:
            key_file.write(_serialize_private_key(private_key))
        os.chmod(key_path, 0o600)


def _load_private_key():
    key_pem = os.getenv('PASSWORD_PRIVATE_KEY_PEM')
    if key_pem:
        key_pem = key_pem.replace('\\n', '\n').encode('utf-8')
        return serialization.load_pem_private_key(key_pem, password=None)

    key_path = os.getenv('PASSWORD_PRIVATE_KEY_PATH') or _default_private_key_path()
    private_key = _load_private_key_from_file(key_path)
    if private_key:
        return private_key

    private_key = _generate_private_key()
    _persist_private_key(private_key, key_path)
    return private_key


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
