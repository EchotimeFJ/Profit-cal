import base64
import importlib
import os
import sys
import tempfile
import unittest

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding


sys.path.insert(0, os.path.dirname(__file__))


def _load_password_crypto_module():
    if 'services.password_crypto' in sys.modules:
        return importlib.reload(sys.modules['services.password_crypto'])

    return importlib.import_module('services.password_crypto')


class PasswordCryptoKeyPersistenceTestCase(unittest.TestCase):
    def test_public_key_stays_stable_across_module_reload_when_path_is_configured(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            key_path = os.path.join(temp_dir, 'password-private-key.pem')
            os.environ.pop('PASSWORD_PRIVATE_KEY_PEM', None)
            os.environ['PASSWORD_PRIVATE_KEY_PATH'] = key_path

            password_crypto = _load_password_crypto_module()
            first_public_key_pem = password_crypto.get_public_key_pem()

            public_key = serialization.load_pem_public_key(first_public_key_pem.encode('utf-8'))
            encrypted = public_key.encrypt(
                b'same-password',
                padding.OAEP(
                    mgf=padding.MGF1(algorithm=hashes.SHA256()),
                    algorithm=hashes.SHA256(),
                    label=None,
                ),
            )
            encrypted_password = base64.b64encode(encrypted).decode('utf-8')

            reloaded_password_crypto = _load_password_crypto_module()
            second_public_key_pem = reloaded_password_crypto.get_public_key_pem()

            self.assertEqual(
                second_public_key_pem,
                first_public_key_pem,
                '配置了私钥路径后，服务重载前后应复用同一把私钥',
            )
            self.assertEqual(
                reloaded_password_crypto.decrypt_password(encrypted_password),
                'same-password',
            )


if __name__ == '__main__':
    unittest.main()
