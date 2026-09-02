use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use subtle::ConstantTimeEq;

use crate::ProtocolError;

pub const PROTOCOL_VERSION: &str = "v1";
pub const KEY_BYTES: usize = 32;
pub const TAG_BYTES: usize = 8;
pub const MAX_LABEL_BYTES: usize = 48;

const CONTEXT: &[u8] = b"mailias/v1";
const TAG_ALPHABET: &[u8; 32] = b"023456789abcdefghjkmnpqrstuvwxyz";

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerifiedAlias {
    pub label: String,
    pub address: String,
}

pub fn encode_key(key: &[u8; KEY_BYTES]) -> String {
    URL_SAFE_NO_PAD.encode(key)
}

pub fn decode_key(encoded: &str) -> Result<[u8; KEY_BYTES], ProtocolError> {
    let decoded = URL_SAFE_NO_PAD
        .decode(encoded)
        .map_err(|_| ProtocolError::InvalidKeyEncoding)?;
    decoded
        .try_into()
        .map_err(|_| ProtocolError::InvalidKeyLength)
}

pub fn normalize_label(input: &str) -> Result<String, ProtocolError> {
    if input.is_empty() {
        return Err(ProtocolError::EmptyLabel);
    }
    if input.len() > MAX_LABEL_BYTES {
        return Err(ProtocolError::LabelTooLong);
    }
    if !input.is_ascii() {
        return Err(ProtocolError::InvalidLabel);
    }

    let label = input.to_ascii_lowercase();
    if label.split('-').any(|part| {
        part.is_empty()
            || !part
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
    }) {
        return Err(ProtocolError::InvalidLabel);
    }

    Ok(label)
}

pub fn normalize_domain(input: &str) -> Result<String, ProtocolError> {
    if input.is_empty() || input.len() > 253 || !input.is_ascii() || input.ends_with('.') {
        return Err(ProtocolError::InvalidDomain);
    }

    let domain = input.to_ascii_lowercase();
    let valid = domain.split('.').all(|part| {
        !part.is_empty()
            && part.len() <= 63
            && !part.starts_with('-')
            && !part.ends_with('-')
            && part
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    });

    if valid {
        Ok(domain)
    } else {
        Err(ProtocolError::InvalidDomain)
    }
}

pub fn generate_tag(
    key: &[u8; KEY_BYTES],
    domain: &str,
    label: &str,
) -> Result<String, ProtocolError> {
    let domain = normalize_domain(domain)?;
    let label = normalize_label(label)?;
    let digest = hmac_digest(key, &domain, &label);
    Ok(encode_tag(&digest[..5]))
}

pub fn generate_address(
    key: &[u8; KEY_BYTES],
    domain: &str,
    label: &str,
) -> Result<String, ProtocolError> {
    let domain = normalize_domain(domain)?;
    let label = normalize_label(label)?;
    let tag = generate_tag(key, &domain, &label)?;
    Ok(format!("{label}-{PROTOCOL_VERSION}-{tag}@{domain}"))
}

pub fn verify_address(
    key: &[u8; KEY_BYTES],
    expected_domain: &str,
    address: &str,
) -> Result<Option<VerifiedAlias>, ProtocolError> {
    let expected_domain = normalize_domain(expected_domain)?;
    if !address.is_ascii() {
        return Ok(None);
    }

    let address = address.to_ascii_lowercase();
    let (local_part, domain) = address
        .rsplit_once('@')
        .ok_or(ProtocolError::InvalidAddress)?;
    if local_part.contains('@') {
        return Ok(None);
    }

    let domain = match normalize_domain(domain) {
        Ok(domain) => domain,
        Err(_) => return Ok(None),
    };
    if domain != expected_domain {
        return Ok(None);
    }

    let (label, tag) = match local_part.rsplit_once("-v1-") {
        Some(parts) => parts,
        None => {
            if looks_like_versioned_alias(local_part) {
                return Err(ProtocolError::UnsupportedVersion);
            }
            return Ok(None);
        }
    };

    let label = match normalize_label(label) {
        Ok(label) => label,
        Err(_) => return Ok(None),
    };
    if tag.len() != TAG_BYTES || !tag.bytes().all(|byte| TAG_ALPHABET.contains(&byte)) {
        return Ok(None);
    }

    let expected_tag = generate_tag(key, &expected_domain, &label)?;
    if bool::from(expected_tag.as_bytes().ct_eq(tag.as_bytes())) {
        Ok(Some(VerifiedAlias {
            address: format!("{label}-{PROTOCOL_VERSION}-{expected_tag}@{expected_domain}"),
            label,
        }))
    } else {
        Ok(None)
    }
}

fn hmac_digest(key: &[u8; KEY_BYTES], domain: &str, label: &str) -> [u8; 32] {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC accepts a 32-byte key");
    mac.update(CONTEXT);
    mac.update(&[0]);
    mac.update(domain.as_bytes());
    mac.update(&[0]);
    mac.update(label.as_bytes());
    let digest = mac.finalize().into_bytes();
    let mut output = [0_u8; 32];
    output.copy_from_slice(&digest);
    output
}

fn encode_tag(bytes: &[u8]) -> String {
    debug_assert_eq!(bytes.len(), 5);
    let mut value = 0_u64;
    for &byte in bytes {
        value = (value << 8) | u64::from(byte);
    }

    let mut output = [0_u8; TAG_BYTES];
    for (index, slot) in output.iter_mut().enumerate() {
        let shift = 35 - (index * 5);
        let alphabet_index = ((value >> shift) & 0x1f) as usize;
        *slot = TAG_ALPHABET[alphabet_index];
    }

    String::from_utf8(output.to_vec()).expect("the tag alphabet is ASCII")
}

fn looks_like_versioned_alias(local_part: &str) -> bool {
    let mut parts = local_part.rsplitn(3, '-');
    let _tag = parts.next();
    let version = parts.next();
    let label = parts.next();
    label.is_some() && version.is_some_and(|value| value.starts_with('v'))
}

#[cfg(test)]
mod tests {
    use hmac::{Hmac, Mac};
    use serde::Deserialize;
    use sha2::Sha256;

    use super::*;

    #[derive(Debug, Deserialize)]
    struct TestVectors {
        version: u8,
        vectors: Vec<TestVector>,
    }

    #[derive(Debug, Deserialize)]
    struct TestVector {
        key: String,
        domain: String,
        label: String,
        message_hex: String,
        hmac_sha256: String,
        tag: String,
        address: String,
    }

    #[test]
    fn official_test_vector_matches() {
        let vectors: TestVectors =
            serde_json::from_str(include_str!("../../../test-vectors/v1.json")).unwrap();
        assert_eq!(vectors.version, 1);

        for vector in vectors.vectors {
            let key = decode_key(&vector.key).unwrap();
            assert_eq!(
                generate_tag(&key, &vector.domain, &vector.label).unwrap(),
                vector.tag
            );
            assert_eq!(
                generate_address(&key, &vector.domain, &vector.label).unwrap(),
                vector.address
            );

            let message = format!("mailias/v1\0{}\0{}", vector.domain, vector.label);
            assert_eq!(hex(message.as_bytes()), vector.message_hex);
            let mut mac = Hmac::<Sha256>::new_from_slice(&key).unwrap();
            mac.update(message.as_bytes());
            assert_eq!(hex(&mac.finalize().into_bytes()), vector.hmac_sha256);
        }
    }

    #[test]
    fn labels_are_canonicalized_but_not_rewritten() {
        assert_eq!(normalize_label("GitHub-Work").unwrap(), "github-work");
        assert_eq!(normalize_label("a".repeat(48).as_str()).unwrap().len(), 48);
        assert_eq!(
            normalize_label("a".repeat(49).as_str()),
            Err(ProtocolError::LabelTooLong)
        );

        for invalid in [
            "",
            "-github",
            "github-",
            "github--work",
            "github_work",
            "日本語",
        ] {
            assert!(
                normalize_label(invalid).is_err(),
                "{invalid} should be invalid"
            );
        }
    }

    #[test]
    fn verification_is_case_insensitive_and_domain_bound() {
        let key = [7_u8; KEY_BYTES];
        let address = generate_address(&key, "m.example.test", "github").unwrap();
        let upper = address.to_ascii_uppercase();

        let verified = verify_address(&key, "M.EXAMPLE.TEST", &upper)
            .unwrap()
            .unwrap();
        assert_eq!(verified.label, "github");
        assert_eq!(verified.address, address);
        assert!(verify_address(&key, "example.com", &address)
            .unwrap()
            .is_none());
    }

    #[test]
    fn modified_tag_is_invalid() {
        let key = [9_u8; KEY_BYTES];
        let address = generate_address(&key, "m.example.test", "github").unwrap();
        let modified = address.replacen("-v1-", "-v1-0", 1);
        assert!(verify_address(&key, "m.example.test", &modified)
            .unwrap()
            .is_none());
    }

    fn hex(bytes: &[u8]) -> String {
        bytes.iter().map(|byte| format!("{byte:02x}")).collect()
    }
}
