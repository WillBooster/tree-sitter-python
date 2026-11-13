//! This crate provides Python language support for the [tree-sitter] parsing library.
//!
//! Its ABI (`0x5742000c`) rejects upstream Tree-sitter runtimes. Use this crate with
//! [willbooster-tree-sitter] 20.0.0 or later within 20.x, the runtime line it is tested and
//! fuzzed with (pre-19.1.0 WillBooster runtimes also share ABI `0x5742000c` and pass the ABI
//! check, while dereferencing `TSLanguage` tables that this parser omits).
//!
//! Typically, you will use the [`LANGUAGE`] constant to add this language to a
//! tree-sitter [`Parser`], and then use the parser to parse some code:
//!
//! ```
//! let code = "def double(x):\n    return x * 2\n";
//! let mut parser = tree_sitter::Parser::new();
//! let language = tree_sitter_python::LANGUAGE;
//! parser
//!     .set_language(&language.into())
//!     .expect("Error loading Python parser");
//! let tree = parser.parse(code).unwrap();
//! assert!(!tree.root_node().has_error());
//! ```
//!
//! [`Parser`]: https://docs.rs/willbooster-tree-sitter/20.0.0/tree_sitter/struct.Parser.html
//! [tree-sitter]: https://tree-sitter.github.io/
//! [willbooster-tree-sitter]: https://crates.io/crates/willbooster-tree-sitter

use tree_sitter_language::LanguageFn;

unsafe extern "C" {
    fn tree_sitter_python() -> *const ();
}

/// The tree-sitter [`LanguageFn`] for this grammar.
pub const LANGUAGE: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_python) };

/// The content of the [`node-types.json`] file for this grammar.
///
/// [`node-types.json`]: https://tree-sitter.github.io/tree-sitter/using-parsers/6-static-node-types
pub const NODE_TYPES: &str = include_str!("../../src/node-types.json");

#[cfg(test)]
mod tests {
    #[test]
    fn test_can_load_grammar() {
        let mut parser = tree_sitter::Parser::new();
        parser
            .set_language(&super::LANGUAGE.into())
            .expect("Error loading Python parser");
    }
}
