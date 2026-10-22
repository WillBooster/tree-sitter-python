#include "tree_sitter/array.h"
#include "tree_sitter/parser.h"

#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

enum TokenType {
    NEWLINE,
    INDENT,
    DEDENT,
    STRING_START,
    STRING_CONTENT,
    ESCAPE_INTERPOLATION,
    STRING_END,
    COMMENT,
    OPEN_PAREN,
    CLOSE_PAREN,
    OPEN_BRACKET,
    CLOSE_BRACKET,
    OPEN_BRACE,
    CLOSE_BRACE,
    EXCEPT,
    FORMAT_SPECIFIER_CONTENT,
    LINE_BREAK,
    LINE_CONTINUATION,
};

typedef enum {
    SingleQuote = 1 << 0,
    DoubleQuote = 1 << 1,
    BackQuote = 1 << 2,
    Raw = 1 << 3,
    Format = 1 << 4,
    Triple = 1 << 5,
    Bytes = 1 << 6,
} Flags;

typedef struct {
    char flags;
} Delimiter;

static inline Delimiter new_delimiter() { return (Delimiter){0}; }

static inline bool is_format(Delimiter *delimiter) { return delimiter->flags & Format; }

static inline bool is_raw(Delimiter *delimiter) { return delimiter->flags & Raw; }

static inline bool is_triple(Delimiter *delimiter) { return delimiter->flags & Triple; }

static inline bool is_bytes(Delimiter *delimiter) { return delimiter->flags & Bytes; }

static inline int32_t end_character(Delimiter *delimiter) {
    if (delimiter->flags & SingleQuote) {
        return '\'';
    }
    if (delimiter->flags & DoubleQuote) {
        return '"';
    }
    if (delimiter->flags & BackQuote) {
        return '`';
    }
    return 0;
}

static inline void set_format(Delimiter *delimiter) { delimiter->flags |= Format; }

static inline void set_raw(Delimiter *delimiter) { delimiter->flags |= Raw; }

static inline void set_triple(Delimiter *delimiter) { delimiter->flags |= Triple; }

static inline void set_bytes(Delimiter *delimiter) { delimiter->flags |= Bytes; }

static inline void set_end_character(Delimiter *delimiter, int32_t character) {
    switch (character) {
        case '\'':
            delimiter->flags |= SingleQuote;
            break;
        case '"':
            delimiter->flags |= DoubleQuote;
            break;
        case '`':
            delimiter->flags |= BackQuote;
            break;
        default:
            assert(false);
    }
}

enum { INDENT_DELTA_PREFIX = UINT8_MAX - 3, LARGE_INDENT_DELTA = 3 << 8 };

typedef struct {
    Array(uint16_t) indents;
    Array(Delimiter) delimiters;
    bool inside_interpolated_string;
    bool comment_only;
    bool line_break_ready;
    bool continued_line_start;
    bool continuation_ready;
    uint16_t pending_dedents;
    uint32_t bracket_depth;
    uint32_t line_start_column;
} Scanner;

static inline void advance(TSLexer *lexer) { lexer->advance(lexer, false); }

static inline void skip(TSLexer *lexer) { lexer->advance(lexer, true); }

static bool is_physical_line_start(Scanner *scanner, TSLexer *lexer, uint32_t leading_columns);
static bool scan_ignored_line_breaks(Scanner *scanner, TSLexer *lexer);
static bool scan_line_continuation(Scanner *scanner, TSLexer *lexer);
static bool skip_line_ending(TSLexer *lexer);
static bool scan_format_specifier(TSLexer *lexer);
static bool emit_bracket(Scanner *scanner, TSLexer *lexer, enum TokenType symbol);
static bool scan_bracket(Scanner *scanner, TSLexer *lexer, const bool *valid_symbols);
static uint16_t count_dedents(Scanner *scanner, uint16_t indent);
static unsigned serialize_indents(Scanner *scanner, char *buffer, size_t size);
static size_t deserialize_context(Scanner *scanner, const char *buffer);
static void deserialize_indents(Scanner *scanner, const char *buffer, unsigned length, size_t size);

bool tree_sitter_python_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
    Scanner *scanner = (Scanner *)payload;

    bool error_recovery_mode = valid_symbols[STRING_CONTENT] && valid_symbols[INDENT];

    if (valid_symbols[FORMAT_SPECIFIER_CONTENT] && !error_recovery_mode && scan_format_specifier(lexer)) {
        return true;
    }

    if (scanner->pending_dedents > 0 && valid_symbols[DEDENT] && !error_recovery_mode) {
        scanner->pending_dedents--;
        array_pop(&scanner->indents);
        lexer->mark_end(lexer);
        lexer->result_symbol = DEDENT;
        return true;
    }

    if (scanner->line_break_ready && valid_symbols[LINE_BREAK] && scan_ignored_line_breaks(scanner, lexer)) {
        return true;
    }

    if (scanner->continuation_ready && valid_symbols[LINE_CONTINUATION] && scan_line_continuation(scanner, lexer)) {
        return true;
    }

    bool advanced_once = false;
    if (valid_symbols[ESCAPE_INTERPOLATION] && scanner->delimiters.size > 0 &&
        (lexer->lookahead == '{' || lexer->lookahead == '}') && !error_recovery_mode) {
        Delimiter *delimiter = array_back(&scanner->delimiters);
        if (is_format(delimiter)) {
            lexer->mark_end(lexer);
            bool is_left_brace = lexer->lookahead == '{';
            advance(lexer);
            advanced_once = true;
            if ((lexer->lookahead == '{' && is_left_brace) || (lexer->lookahead == '}' && !is_left_brace)) {
                advance(lexer);
                lexer->mark_end(lexer);
                lexer->result_symbol = ESCAPE_INTERPOLATION;
                return true;
            }
            enum TokenType symbol = is_left_brace ? OPEN_BRACE : CLOSE_BRACE;
            if (valid_symbols[symbol]) {
                return emit_bracket(scanner, lexer, symbol);
            }
            return false;
        }
    }

    if (valid_symbols[STRING_CONTENT] && scanner->delimiters.size > 0 && !error_recovery_mode) {
        Delimiter *delimiter = array_back(&scanner->delimiters);
        int32_t end_char = end_character(delimiter);
        bool has_content = advanced_once;
        while (lexer->lookahead) {
            if ((advanced_once || lexer->lookahead == '{' || lexer->lookahead == '}') && is_format(delimiter)) {
                lexer->mark_end(lexer);
                lexer->result_symbol = STRING_CONTENT;
                return has_content;
            }
            if (lexer->lookahead == '\\') {
                if (is_raw(delimiter)) {
                    advance(lexer);
                    if (lexer->lookahead == end_character(delimiter) || lexer->lookahead == '\\') {
                        advance(lexer);
                    }
                    if (lexer->lookahead == '\r') {
                        advance(lexer);
                        if (lexer->lookahead == '\n') {
                            advance(lexer);
                        }
                    } else if (lexer->lookahead == '\n') {
                        advance(lexer);
                    }
                    continue;
                }
                if (is_bytes(delimiter)) {
                    lexer->mark_end(lexer);
                    advance(lexer);
                    if (lexer->lookahead == 'N' || lexer->lookahead == 'u' || lexer->lookahead == 'U') {
                        // In bytes string, \N{...}, \uXXXX and \UXXXXXXXX are
                        // not escape sequences
                        // https://docs.python.org/3/reference/lexical_analysis.html#string-and-bytes-literals
                        advance(lexer);
                    } else {
                        lexer->result_symbol = STRING_CONTENT;
                        return has_content;
                    }
                } else {
                    lexer->mark_end(lexer);
                    lexer->result_symbol = STRING_CONTENT;
                    return has_content;
                }
            } else if (lexer->lookahead == end_char) {
                if (is_triple(delimiter)) {
                    lexer->mark_end(lexer);
                    advance(lexer);
                    if (lexer->lookahead == end_char) {
                        advance(lexer);
                        if (lexer->lookahead == end_char) {
                            if (has_content) {
                                lexer->result_symbol = STRING_CONTENT;
                            } else {
                                advance(lexer);
                                lexer->mark_end(lexer);
                                array_pop(&scanner->delimiters);
                                lexer->result_symbol = STRING_END;
                                scanner->inside_interpolated_string = false;
                            }
                            return true;
                        }
                        lexer->mark_end(lexer);
                        lexer->result_symbol = STRING_CONTENT;
                        return true;
                    }
                    lexer->mark_end(lexer);
                    lexer->result_symbol = STRING_CONTENT;
                    return true;
                }
                if (has_content) {
                    lexer->result_symbol = STRING_CONTENT;
                } else {
                    advance(lexer);
                    array_pop(&scanner->delimiters);
                    lexer->result_symbol = STRING_END;
                    scanner->inside_interpolated_string = false;
                }
                lexer->mark_end(lexer);
                return true;

            } else if (lexer->lookahead == '\n' && has_content && !is_triple(delimiter)) {
                return false;
            }
            advance(lexer);
            has_content = true;
        }
    }

    bool at_line_start = scanner->bracket_depth == 0 && !valid_symbols[NEWLINE] && !valid_symbols[INDENT] &&
                         !valid_symbols[DEDENT] && (lexer->lookahead == '\n' || lexer->lookahead == '\r') &&
                         is_physical_line_start(scanner, lexer, 0);
    if (valid_symbols[LINE_BREAK] && !valid_symbols[NEWLINE] && !valid_symbols[INDENT] && !valid_symbols[DEDENT] &&
        !valid_symbols[STRING_CONTENT] && (scanner->bracket_depth > 0 || (at_line_start && scanner->indents.size == 1)) &&
        scan_ignored_line_breaks(scanner, lexer)) {
        return true;
    }

    lexer->mark_end(lexer);
    bool found_end_of_line = false;
    bool consumed_newline = false;
    bool found_line_continuation = false;
    bool continuation_starts_line = false;
    uint32_t leading_columns = 0;
    bool ignore_newline = at_line_start || scanner->bracket_depth > 0 || scanner->comment_only;
    uint16_t indent_length = 0;
    int32_t first_comment_indent_length = -1;
    for (;;) {
        if (lexer->lookahead == '\n' || lexer->lookahead == '\r') {
            if (!consumed_newline && !found_line_continuation && !ignore_newline && !valid_symbols[NEWLINE]) {
                ignore_newline |= is_physical_line_start(scanner, lexer, leading_columns);
            }
            found_end_of_line = true;
            indent_length = 0;
            skip_line_ending(lexer);
            consumed_newline = true;
        } else if (lexer->lookahead == ' ') {
            if (!consumed_newline && !found_line_continuation) leading_columns++;
            indent_length++;
            skip(lexer);
        } else if (lexer->lookahead == '\f') {
            if (!consumed_newline && !found_line_continuation) leading_columns++;
            indent_length = 0;
            skip(lexer);
        } else if (lexer->lookahead == '\t') {
            if (!consumed_newline && !found_line_continuation) leading_columns++;
            indent_length += 8;
            skip(lexer);
        } else if (lexer->lookahead == '#' && !consumed_newline && !found_line_continuation &&
                   !valid_symbols[NEWLINE] && valid_symbols[COMMENT] && is_physical_line_start(scanner, lexer, leading_columns)) {
            while (lexer->lookahead && lexer->lookahead != '\n' && lexer->lookahead != '\r') {
                advance(lexer);
            }
            lexer->mark_end(lexer);
            lexer->result_symbol = COMMENT;
            scanner->comment_only = true;
            return true;
        } else if (lexer->lookahead == '#' && (valid_symbols[INDENT] || valid_symbols[DEDENT] ||
                                               valid_symbols[NEWLINE] || valid_symbols[EXCEPT])) {
            // If we haven't found an EOL yet,
            // then this is a comment after an expression:
            //   foo = bar # comment
            // Just return, since we don't want to generate an indent/dedent
            // token.
            if (!found_end_of_line) {
                return false;
            }
            if (first_comment_indent_length == -1) {
                first_comment_indent_length = (int32_t)indent_length;
            }
            while (lexer->lookahead && lexer->lookahead != '\n' && lexer->lookahead != '\r') {
                skip(lexer);
            }
            if (lexer->lookahead) {
                skip_line_ending(lexer);
            }
            indent_length = 0;
        } else if (lexer->lookahead == '\\') {
            if (consumed_newline) {
                break;
            }
            if (!found_line_continuation) {
                continuation_starts_line = is_physical_line_start(scanner, lexer, leading_columns);
            }
            skip(lexer);
            if (lexer->lookahead == '\n' || lexer->lookahead == '\r') {
                skip_line_ending(lexer);
                found_line_continuation = true;
            } else if (lexer->eof(lexer)) {
                found_end_of_line = true;
                break;
            } else {
                return false;
            }
        } else if (lexer->eof(lexer)) {
            indent_length = 0;
            found_end_of_line = true;
            break;
        } else {
            break;
        }
    }

    uint16_t dedent_indent = first_comment_indent_length > indent_length ? (uint16_t)first_comment_indent_length : indent_length;
    if (found_end_of_line) {
        if (scanner->indents.size > 0) {
            uint16_t current_indent_length = *array_back(&scanner->indents);

            if (valid_symbols[INDENT] && !error_recovery_mode && indent_length > current_indent_length) {
                array_push(&scanner->indents, indent_length);
                scanner->comment_only = false;
                scanner->line_break_ready = consumed_newline;
                lexer->result_symbol = INDENT;
                return true;
            }

            bool next_tok_is_string_start =
                lexer->lookahead == '\"' || lexer->lookahead == '\'' || lexer->lookahead == '`';

            if ((valid_symbols[DEDENT] ||
                 (!valid_symbols[NEWLINE] && !(valid_symbols[STRING_START] && next_tok_is_string_start) &&
                  scanner->bracket_depth == 0)) &&
                indent_length < current_indent_length && !scanner->inside_interpolated_string &&

                // Wait to create a dedent token until we've consumed any
                // comments
                // whose indentation matches the current block.
                first_comment_indent_length < (int32_t)current_indent_length) {
                array_pop(&scanner->indents);
                scanner->bracket_depth = 0;
                scanner->comment_only = false;
                scanner->pending_dedents = count_dedents(scanner, dedent_indent);
                scanner->line_break_ready = consumed_newline;
                lexer->result_symbol = DEDENT;
                return true;
            }
        }

        if (valid_symbols[NEWLINE] && !error_recovery_mode) {
            scanner->comment_only = false;
            if (first_comment_indent_length < (int32_t)*array_back(&scanner->indents)) {
                scanner->pending_dedents = count_dedents(scanner, dedent_indent);
            }
            scanner->line_break_ready = consumed_newline;
            lexer->result_symbol = NEWLINE;
            return true;
        }
    }

    if (found_line_continuation && valid_symbols[LINE_BREAK]) {
        scanner->continuation_ready = true;
        scanner->continued_line_start = !continuation_starts_line;
        lexer->result_symbol = LINE_BREAK;
        return true;
    }

    if (consumed_newline && ignore_newline && valid_symbols[LINE_BREAK]) {
        scanner->comment_only = false;
        if (scanner->bracket_depth == 0 && !scanner->inside_interpolated_string) {
            scanner->pending_dedents = count_dedents(scanner, dedent_indent);
        }
        scanner->line_break_ready = true;
        lexer->result_symbol = LINE_BREAK;
        return true;
    }

    if (consumed_newline) {
        return false;
    }

    if (scan_bracket(scanner, lexer, valid_symbols)) {
        return true;
    }

    if (first_comment_indent_length == -1 && valid_symbols[STRING_START]) {
        Delimiter delimiter = new_delimiter();

        bool has_flags = false;
        while (lexer->lookahead) {
            if (lexer->lookahead == 'f' || lexer->lookahead == 'F' || lexer->lookahead == 't' ||
                lexer->lookahead == 'T') {
                set_format(&delimiter);
            } else if (lexer->lookahead == 'r' || lexer->lookahead == 'R') {
                set_raw(&delimiter);
            } else if (lexer->lookahead == 'b' || lexer->lookahead == 'B') {
                set_bytes(&delimiter);
            } else if (lexer->lookahead != 'u' && lexer->lookahead != 'U') {
                break;
            }
            has_flags = true;
            advance(lexer);
        }

        if (lexer->lookahead == '`') {
            set_end_character(&delimiter, '`');
            advance(lexer);
            lexer->mark_end(lexer);
        } else if (lexer->lookahead == '\'') {
            set_end_character(&delimiter, '\'');
            advance(lexer);
            lexer->mark_end(lexer);
            if (lexer->lookahead == '\'') {
                advance(lexer);
                if (lexer->lookahead == '\'') {
                    advance(lexer);
                    lexer->mark_end(lexer);
                    set_triple(&delimiter);
                }
            }
        } else if (lexer->lookahead == '"') {
            set_end_character(&delimiter, '"');
            advance(lexer);
            lexer->mark_end(lexer);
            if (lexer->lookahead == '"') {
                advance(lexer);
                if (lexer->lookahead == '"') {
                    advance(lexer);
                    lexer->mark_end(lexer);
                    set_triple(&delimiter);
                }
            }
        }

        if (end_character(&delimiter)) {
            array_push(&scanner->delimiters, delimiter);
            lexer->result_symbol = STRING_START;
            scanner->inside_interpolated_string = is_format(&delimiter);
            return true;
        }
        if (has_flags) {
            return false;
        }
    }

    return false;
}

static bool is_physical_line_start(Scanner *scanner, TSLexer *lexer, uint32_t leading_columns) {
    return !scanner->continued_line_start && lexer->get_column(lexer) == scanner->line_start_column + leading_columns;
}

static bool scan_ignored_line_breaks(Scanner *scanner, TSLexer *lexer) {
    bool found_newline = false;
    for (;;) {
        while (lexer->lookahead == ' ' || lexer->lookahead == '\t' || lexer->lookahead == '\f') {
            skip(lexer);
        }
        if (lexer->lookahead != '\n' && lexer->lookahead != '\r') {
            break;
        }
        bool line_feed = skip_line_ending(lexer);
        lexer->mark_end(lexer);
        scanner->line_start_column = line_feed ? 0 : lexer->get_column(lexer);
        found_newline = true;
    }
    if (!found_newline) {
        return false;
    }
    scanner->line_break_ready = false;
    scanner->continued_line_start = false;
    scanner->comment_only = false;
    lexer->result_symbol = LINE_BREAK;
    return true;
}

static bool scan_line_continuation(Scanner *scanner, TSLexer *lexer) {
    while (lexer->lookahead == ' ' || lexer->lookahead == '\t' || lexer->lookahead == '\f') {
        skip(lexer);
    }
    if (lexer->lookahead != '\\') {
        return false;
    }
    advance(lexer);
    if (lexer->lookahead != '\n' && lexer->lookahead != '\r') {
        return false;
    }
    bool carriage_return = lexer->lookahead == '\r';
    bool line_feed = !carriage_return;
    advance(lexer);
    if (carriage_return && lexer->lookahead == '\n') {
        advance(lexer);
        line_feed = true;
    }
    lexer->mark_end(lexer);
    lexer->result_symbol = LINE_CONTINUATION;
    scanner->continuation_ready = false;
    scanner->line_start_column = line_feed ? 0 : lexer->get_column(lexer);
    return true;
}

static bool skip_line_ending(TSLexer *lexer) {
    bool carriage_return = lexer->lookahead == '\r';
    bool line_feed = !carriage_return;
    skip(lexer);
    if (carriage_return && lexer->lookahead == '\n') {
        skip(lexer);
        line_feed = true;
    }
    return line_feed;
}

static uint16_t count_dedents(Scanner *scanner, uint16_t indent) {
    uint16_t count = 0;
    for (uint32_t index = scanner->indents.size; index > 1 && *array_get(&scanner->indents, index - 1) > indent; index--) {
        count++;
    }
    return count;
}

static bool scan_format_specifier(TSLexer *lexer) {
    while (lexer->lookahead == '\n') {
        skip(lexer);
    }
    bool has_content = false;
    while (!lexer->eof(lexer) && lexer->lookahead != '{' && lexer->lookahead != '}' && lexer->lookahead != '\n') {
        advance(lexer);
        has_content = true;
    }
    if (has_content) {
        lexer->mark_end(lexer);
        lexer->result_symbol = FORMAT_SPECIFIER_CONTENT;
    }
    return has_content;
}

static bool scan_bracket(Scanner *scanner, TSLexer *lexer, const bool *valid_symbols) {
    enum TokenType symbol;
    switch (lexer->lookahead) {
        case '(': symbol = OPEN_PAREN; break;
        case ')': symbol = CLOSE_PAREN; break;
        case '[': symbol = OPEN_BRACKET; break;
        case ']': symbol = CLOSE_BRACKET; break;
        case '{': symbol = OPEN_BRACE; break;
        case '}': symbol = CLOSE_BRACE; break;
        default: return false;
    }
    if (!valid_symbols[symbol]) {
        return false;
    }
    advance(lexer);
    return emit_bracket(scanner, lexer, symbol);
}

static bool emit_bracket(Scanner *scanner, TSLexer *lexer, enum TokenType symbol) {
    if (symbol == OPEN_PAREN || symbol == OPEN_BRACKET || symbol == OPEN_BRACE) {
        scanner->bracket_depth++;
    } else if (scanner->bracket_depth > 0) {
        scanner->bracket_depth--;
    }
    lexer->mark_end(lexer);
    lexer->result_symbol = symbol;
    return true;
}

unsigned tree_sitter_python_external_scanner_serialize(void *payload, char *buffer) {
    Scanner *scanner = (Scanner *)payload;

    size_t size = 0;

    buffer[size++] = (char)scanner->inside_interpolated_string;
    buffer[size++] = (char)scanner->comment_only;
    buffer[size++] = (char)scanner->line_break_ready;
    buffer[size++] = (char)scanner->continued_line_start;
    buffer[size++] = (char)scanner->continuation_ready;
    buffer[size++] = (char)scanner->pending_dedents;
    buffer[size++] = (char)(scanner->pending_dedents >> 8);
    for (uint32_t shift = 0; shift < 32; shift += 8) {
        buffer[size++] = (char)(scanner->bracket_depth >> shift);
    }

    for (uint32_t shift = 0; shift < 32; shift += 8) {
        buffer[size++] = (char)(scanner->line_start_column >> shift);
    }

    size_t delimiter_count = scanner->delimiters.size > UINT8_MAX ? UINT8_MAX : scanner->delimiters.size;
    buffer[size++] = (char)delimiter_count;

    if (delimiter_count > 0) {
        memcpy(&buffer[size], scanner->delimiters.contents, delimiter_count);
    }
    size += delimiter_count;

    return serialize_indents(scanner, buffer, size);
}

static unsigned serialize_indents(Scanner *scanner, char *buffer, size_t size) {
    uint16_t previous = 0;
    for (uint32_t index = 1; index < scanner->indents.size; index++) {
        uint16_t indent = *array_get(&scanner->indents, index);
        uint32_t value = indent - previous - 1;
        size_t bytes = value < INDENT_DELTA_PREFIX ? 1 : value < LARGE_INDENT_DELTA ? 2 : 3;
        if (size + bytes > TREE_SITTER_SERIALIZATION_BUFFER_SIZE) {
            break;
        }
        previous = indent;
        if (bytes == 1) {
            buffer[size++] = (char)value;
            continue;
        }
        buffer[size++] = bytes == 2 ? (char)(INDENT_DELTA_PREFIX + (value >> 8)) : (char)UINT8_MAX;
        buffer[size++] = (char)value;
        if (bytes == 3) {
            buffer[size++] = (char)(value >> 8);
        }
    }
    return size;
}

void tree_sitter_python_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
    Scanner *scanner = (Scanner *)payload;

    array_delete(&scanner->delimiters);
    array_delete(&scanner->indents);
    array_push(&scanner->indents, 0);
    scanner->bracket_depth = 0;
    scanner->line_start_column = 0;
    scanner->comment_only = false;
    scanner->line_break_ready = false;
    scanner->continued_line_start = false;
    scanner->continuation_ready = false;
    scanner->pending_dedents = 0;

    if (length > 0) {
        size_t size = deserialize_context(scanner, buffer);

        size_t delimiter_count = (uint8_t)buffer[size++];
        if (delimiter_count > 0) {
            array_reserve(&scanner->delimiters, delimiter_count);
            scanner->delimiters.size = delimiter_count;
            memcpy(scanner->delimiters.contents, &buffer[size], delimiter_count);
            size += delimiter_count;
        }

        deserialize_indents(scanner, buffer, length, size);
        if (scanner->pending_dedents >= scanner->indents.size) {
            scanner->pending_dedents = (uint16_t)(scanner->indents.size - 1);
        }
    }
}

static size_t deserialize_context(Scanner *scanner, const char *buffer) {
    size_t size = 0;

    scanner->inside_interpolated_string = (bool)buffer[size++];
    scanner->comment_only = (bool)buffer[size++];
    scanner->line_break_ready = (bool)buffer[size++];
    scanner->continued_line_start = (bool)buffer[size++];
    scanner->continuation_ready = (bool)buffer[size++];
    scanner->pending_dedents = (uint8_t)buffer[size++];
    scanner->pending_dedents |= (uint16_t)(uint8_t)buffer[size++] << 8;
    for (uint32_t shift = 0; shift < 32; shift += 8) {
        scanner->bracket_depth |= (uint32_t)(uint8_t)buffer[size++] << shift;
    }

    for (uint32_t shift = 0; shift < 32; shift += 8) {
        scanner->line_start_column |= (uint32_t)(uint8_t)buffer[size++] << shift;
    }

    return size;
}

static void deserialize_indents(Scanner *scanner, const char *buffer, unsigned length, size_t size) {
    uint32_t indent = 0;
    while (size < length) {
        uint8_t prefix = (uint8_t)buffer[size++];
        uint32_t value = prefix;
        if (prefix >= INDENT_DELTA_PREFIX) {
            if (size + (prefix == UINT8_MAX ? 2 : 1) > length) {
                break;
            }
            value = (uint8_t)buffer[size++];
            uint32_t high = prefix == UINT8_MAX ? (uint8_t)buffer[size++] : prefix - INDENT_DELTA_PREFIX;
            value |= high << 8;
        }
        indent += value + 1;
        if (indent > UINT16_MAX) {
            break;
        }
        array_push(&scanner->indents, (uint16_t)indent);
    }
}

void *tree_sitter_python_external_scanner_create() {
#if defined(__STDC_VERSION__) && (__STDC_VERSION__ >= 201112L)
    _Static_assert(sizeof(Delimiter) == sizeof(char), "");
#else
    assert(sizeof(Delimiter) == sizeof(char));
#endif
    Scanner *scanner = calloc(1, sizeof(Scanner));
    array_init(&scanner->indents);
    array_init(&scanner->delimiters);
    tree_sitter_python_external_scanner_deserialize(scanner, NULL, 0);
    return scanner;
}

void tree_sitter_python_external_scanner_destroy(void *payload) {
    Scanner *scanner = (Scanner *)payload;
    array_delete(&scanner->indents);
    array_delete(&scanner->delimiters);
    free(scanner);
}
