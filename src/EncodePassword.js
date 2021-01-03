import sha256 from 'crypto-js/sha256';
import Base64 from 'crypto-js/enc-base64';

const salt = "Sh9Jp0sbyeqegDcwN2caKbcNuQR9"

export function hashPassword(password) {
    const hsalt = Base64.stringify(sha256(salt))
    const hash = Base64.stringify(sha256(password + hsalt))
    return hash
}

export function decodeBase64(s) {
    return Base64.parse(s).toString()
}
