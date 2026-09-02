mod error;
mod protocol;

pub use error::ProtocolError;
pub use protocol::{
    decode_key, encode_key, generate_address, generate_tag, normalize_domain,
    normalize_label, verify_address, VerifiedAlias, KEY_BYTES, MAX_LABEL_BYTES,
    PROTOCOL_VERSION, TAG_BYTES,
};

