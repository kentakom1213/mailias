use thiserror::Error;

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum ProtocolError {
    #[error("the secret key is not valid unpadded Base64URL")]
    InvalidKeyEncoding,

    #[error("the secret key must decode to exactly 32 bytes")]
    InvalidKeyLength,

    #[error("the label must not be empty")]
    EmptyLabel,

    #[error("the label is longer than 48 bytes")]
    LabelTooLong,

    #[error("the label must contain only ASCII letters, digits, and single hyphens")]
    InvalidLabel,

    #[error("the domain is not a valid lowercase-compatible ASCII DNS name")]
    InvalidDomain,

    #[error("the recipient address is malformed")]
    InvalidAddress,

    #[error("the recipient uses an unsupported mailias protocol version")]
    UnsupportedVersion,
}

