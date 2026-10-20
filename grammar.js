/**
 * @file Python grammar for tree-sitter
 * @author Max Brunsfeld
 * @license MIT
 * @see {@link https://docs.python.org/2/reference/grammar.html|Python 2 grammar}
 * @see {@link https://docs.python.org/3/reference/grammar.html|Python 3 grammar}
 */

// @ts-check

const { grammar, seq, choice, repeat, repeat1, optional, token, prec, alias, field, sym } =
  /** @type {typeof globalThis & import('@willbooster/web-tree-sitter/dsl').DSL} */ (globalThis);

const PREC = {
  // this resolves a conflict between the usage of ':' in a lambda vs in a
  // typed parameter. In the case of a lambda, we don't allow typed parameters.
  lambda: -2,
  typed_parameter: -1,
  conditional: -1,

  parenthesized_expression: 1,
  or: 10,
  and: 11,
  not: 12,
  compare: 13,
  bitwise_or: 14,
  bitwise_and: 15,
  xor: 16,
  shift: 17,
  plus: 18,
  times: 19,
  unary: 20,
  power: 21,
  call: 22,
};

const SEMICOLON = ';';

// oxlint-disable-next-line unicorn/prefer-module -- This package is CommonJS, so tree-sitter loads grammar.js as CommonJS.
module.exports = grammar({
  name: 'python',

  extras: ($) => [$.comment, /[\s\f\uFEFF\u2060\u200B]|\r?\n/, $.line_continuation],

  conflicts: ($) => [
    [$.default_type_parameter, $._default_type_primary, $.primary_expression],
    [$.primary_expression, $._default_type_primary],
    [$.primary_expression, $._default_generic_type],
    [$.primary_expression, $._default_member_type],
    [$.list, $._default_type_list],
    [$._type_parameter_expression, $.expression],
    [$.primary_expression, $.pattern],
    [$.primary_expression, $.list_splat_pattern],
    [$.tuple, $.tuple_pattern],
    [$.list, $.list_pattern],
    [$.with_item, $.tuple],
    [$.print_statement, $.primary_expression],
    [$.match_statement, $.primary_expression],
  ],

  supertypes: ($) => [
    $._simple_statement,
    $._compound_statement,
    $.expression,
    $.primary_expression,
    $.pattern,
    $.parameter,
  ],

  externals: () => [
    sym('_newline'),
    sym('_indent'),
    sym('_dedent'),
    sym('string_start'),
    sym('_string_content'),
    sym('escape_interpolation'),
    sym('string_end'),

    // Mark comments as external tokens so that the external scanner is always
    // invoked, even if no external token is expected. This allows for better
    // error recovery, because the external scanner can maintain the overall
    // structure by returning dedent tokens whenever a dedent occurs, even
    // if no dedent is expected.
    sym('comment'),

    '(',
    ')',
    '[',
    ']',
    '{',
    '}',
    'except',
    sym('_format_specifier_content'),
  ],

  inline: ($) => [
    $._expression_without_named_expression,
    $._simple_statement,
    $._compound_statement,
    $._suite,
    $._expressions,
    $._left_hand_side,
    $.keyword_identifier,
    $._type_parameter_name,
    $._default_member_base,
  ],

  reserved: {
    global: () => [
      // https://docs.python.org/3/reference/lexical_analysis.html#keywords
      'False',
      'await',
      'else',
      'import',
      'pass',
      'None',
      'break',
      'except',
      'in',
      'raise',
      'True',
      'class',
      'finally',
      'is',
      'return',
      'and',
      'continue',
      'for',
      'lambda',
      'try',
      'as',
      'def',
      'from',
      'nonlocal',
      'while',
      'assert',
      'del',
      'global',
      'not',
      'with',
      'async',
      'elif',
      'if',
      'or',
      'yield',
    ],
  },

  word: ($) => $.identifier,

  rules: {
    module: ($) => repeat($._statement),

    _statement: ($) => choice($._simple_statements, $._compound_statement),

    _simple_statements: ($) => seq(sep1($._simple_statement, SEMICOLON), optional(SEMICOLON), sym('_newline')),

    _simple_statement: ($) =>
      choice(
        $.future_import_statement,
        $.import_statement,
        $.lazy_import_statement,
        $.import_from_statement,
        $.print_statement,
        $.assert_statement,
        $.expression_statement,
        $.return_statement,
        $.delete_statement,
        $.raise_statement,
        $.pass_statement,
        $.break_statement,
        $.continue_statement,
        $.global_statement,
        $.nonlocal_statement,
        $.exec_statement,
        $.type_alias_statement
      ),

    import_statement: ($) => seq('import', $._import_list),

    lazy_import_statement: ($) => seq('lazy', choice($.import_statement, $.import_from_statement)),

    import_prefix: () => repeat1('.'),

    relative_import: ($) => seq($.import_prefix, optional($.dotted_name)),

    future_import_statement: ($) =>
      seq('from', '__future__', 'import', choice($._import_list, seq('(', $._import_list, ')'))),

    import_from_statement: ($) =>
      seq(
        'from',
        field('module_name', choice($.relative_import, $.dotted_name)),
        'import',
        choice($.wildcard_import, $._import_list, seq('(', $._import_list, ')'))
      ),

    _import_list: ($) => seq(commaSep1(field('name', choice($.dotted_name, $.aliased_import))), optional(',')),

    aliased_import: ($) => seq(field('name', $.dotted_name), 'as', field('alias', $.identifier)),

    wildcard_import: () => '*',

    print_statement: ($) =>
      choice(
        // Python 3 reads these statements as expression lists, which can unpack their elements.
        prec(
          1,
          seq(
            'print',
            $.chevron,
            repeat(seq(',', field('argument', choice($.expression, $.list_splat)))),
            optional(',')
          )
        ),
        prec(
          -3,
          prec.dynamic(
            -1,
            seq('print', commaSep1(field('argument', choice($.expression, $.list_splat))), optional(','))
          )
        )
      ),

    chevron: ($) => seq('>>', $.expression),

    assert_statement: ($) => seq('assert', commaSep1($.expression)),

    expression_statement: ($) =>
      choice(
        $.expression,
        seq(choice($.expression, $.list_splat), ',', optional($._collection_elements)),
        $.assignment,
        $.augmented_assignment,
        $.yield
      ),

    named_expression: ($) => seq(field('name', $._named_expression_lhs), ':=', field('value', $.expression)),

    _named_expression_lhs: ($) => choice($.identifier, $.keyword_identifier),

    return_statement: ($) => seq('return', optional($._expressions)),

    delete_statement: ($) => seq('del', $._expressions),

    _expressions: ($) => choice($.expression, $.expression_list),

    raise_statement: ($) => seq('raise', optional($._expressions), optional(seq('from', field('cause', $.expression)))),

    pass_statement: () => prec.left('pass'),
    break_statement: () => prec.left('break'),
    continue_statement: () => prec.left('continue'),

    _compound_statement: ($) =>
      choice(
        $.if_statement,
        $.for_statement,
        $.while_statement,
        $.try_statement,
        $.with_statement,
        $.function_definition,
        $.class_definition,
        $.decorated_definition,
        $.match_statement
      ),

    if_statement: ($) =>
      seq(
        'if',
        field('condition', $.expression),
        ':',
        field('consequence', $._suite),
        repeat(field('alternative', $.elif_clause)),
        optional(field('alternative', $.else_clause))
      ),

    elif_clause: ($) => seq('elif', field('condition', $.expression), ':', field('consequence', $._suite)),

    else_clause: ($) => seq('else', ':', field('body', $._suite)),

    match_statement: ($) => {
      const subject = field('subject', choice($.expression, $.list_splat));
      return seq(
        'match',
        choice(field('subject', $.expression), seq(subject, ',', optional(seq(commaSep1(subject), optional(','))))),
        ':',
        field('body', alias($._match_block, $.block))
      );
    },

    _match_block: ($) =>
      choice(seq(sym('_indent'), repeat(field('alternative', $.case_clause)), sym('_dedent')), sym('_newline')),

    case_clause: ($) =>
      seq(
        'case',
        commaSep1($.case_pattern),
        optional(','),
        optional(field('guard', $.if_clause)),
        ':',
        field('consequence', $._suite)
      ),

    for_statement: ($) =>
      seq(
        optional('async'),
        'for',
        field('left', $._left_hand_side),
        'in',
        field('right', $._expressions),
        ':',
        field('body', $._suite),
        field('alternative', optional($.else_clause))
      ),

    while_statement: ($) =>
      seq(
        'while',
        field('condition', $.expression),
        ':',
        field('body', $._suite),
        optional(field('alternative', $.else_clause))
      ),

    try_statement: ($) =>
      seq(
        'try',
        ':',
        field('body', $._suite),
        repeat($.except_clause),
        optional($.else_clause),
        optional($.finally_clause)
      ),

    except_clause: ($) =>
      seq(
        'except',
        optional(token(prec(1, '*'))),
        optional(
          choice(
            seq(
              field('value', $.expression),
              optional(seq('as', field('alias', choice($.identifier, $.keyword_identifier))))
            ),
            commaSep1(field('value', $.expression))
          )
        ),
        ':',
        $._suite
      ),

    finally_clause: ($) => seq('finally', ':', $._suite),

    with_statement: ($) => seq(optional('async'), 'with', $.with_clause, ':', field('body', $._suite)),

    with_clause: ($) =>
      choice(seq(commaSep1($.with_item), optional(',')), seq('(', commaSep1($.with_item), optional(','), ')')),

    with_item: ($) => prec.dynamic(1, field('value', choice($.expression, $.as_pattern))),

    function_definition: ($) =>
      seq(
        optional('async'),
        'def',
        field('name', $.identifier),
        field('type_parameters', optional($.type_parameter)),
        field('parameters', $.parameters),
        optional(seq('->', field('return_type', $.type))),
        ':',
        field('body', $._suite)
      ),

    parameters: ($) => seq('(', optional($._parameters), ')'),

    lambda_parameters: ($) => $._parameters,

    list_splat: ($) => seq('*', $.primary_expression),

    dictionary_splat: ($) => seq('**', $.primary_expression),

    global_statement: ($) => seq('global', commaSep1($.identifier)),

    nonlocal_statement: ($) => seq('nonlocal', commaSep1($.identifier)),

    exec_statement: ($) =>
      seq('exec', field('code', choice($.string, $.identifier)), optional(seq('in', commaSep1($.expression)))),

    type_alias_statement: ($) =>
      seq('type', field('left', alias($._type_alias_name, $.type)), '=', field('right', $.type)),

    _type_alias_name: ($) => choice($.identifier, alias($._generic_type_definition, sym('generic_type'))),

    _generic_type_definition: ($) => seq($.identifier, $.type_parameter),

    class_definition: ($) =>
      seq(
        'class',
        field('name', $.identifier),
        field('type_parameters', optional($.type_parameter)),
        field('superclasses', optional($.argument_list)),
        ':',
        field('body', $._suite)
      ),
    type_parameter: ($) =>
      seq(
        '[',
        commaSep1(
          choice($.type, alias($._constrained_type_expression, $.type), $.splat_type, $.default_type_parameter)
        ),
        optional(','),
        ']'
      ),

    default_type_parameter: ($) =>
      choice(
        seq(
          choice(
            seq(
              field('name', $._type_parameter_name),
              optional(seq(':', field('bound', alias($._type_parameter_expression, $.type))))
            ),
            seq('**', field('name', $._type_parameter_name))
          ),
          '=',
          field('value', alias($._type_parameter_expression, $.type))
        ),
        seq(
          '*',
          field('name', $._type_parameter_name),
          '=',
          field(
            'value',
            choice(alias($._type_parameter_expression, $.type), alias($._default_splat_type, $.list_splat))
          )
        )
      ),

    _type_parameter_name: ($) =>
      choice(
        $.identifier,
        alias(choice('type', 'match', 'lazy'), $.identifier),
        prec(-3, alias(choice('print', 'exec'), $.identifier))
      ),

    _default_member_base: ($) =>
      choice(
        $._type_parameter_name,
        alias($._default_member_type, sym('member_type')),
        alias($._default_generic_type, sym('generic_type'))
      ),

    _type_parameter_expression: ($) => choice($._expression_without_named_expression, prec.dynamic(1, $._default_type)),

    _default_type: ($) => choice($._default_type_primary, alias($._default_union_type, sym('union_type'))),

    _default_type_primary: ($) =>
      choice(
        $.identifier,
        $.keyword_identifier,
        $.none,
        $.string,
        alias($._default_member_type, sym('member_type')),
        alias($._default_generic_type, sym('generic_type')),
        alias($._default_type_list, $.list),
        alias($._default_type_tuple, $.tuple),
        alias($._default_parenthesized_type, $.parenthesized_expression)
      ),

    _default_member_type: ($) => seq($._default_member_base, '.', $.identifier),

    _default_generic_type: ($) => seq($._default_member_base, alias($._default_type_arguments, $.type_parameter)),

    _default_union_type: ($) =>
      prec.left(PREC.bitwise_or, seq(alias($._default_type, $.type), '|', alias($._default_type_primary, $.type))),

    _default_parenthesized_type: ($) => seq('(', alias($._default_type, $.type), ')'),

    _default_type_arguments: ($) =>
      seq(
        '[',
        commaSep1(
          choice(
            alias($._type_parameter_expression, $.type),
            alias($._constrained_type_expression, $.type),
            $.named_expression,
            alias($._default_splat_argument, $.splat_type),
            $.slice
          )
        ),
        optional(','),
        ']'
      ),

    _default_splat_argument: ($) => seq('*', alias($._type_parameter_expression, $.type)),

    _default_type_list: ($) =>
      prec.dynamic(
        1,
        seq('[', optional(seq(commaSep1(alias($._type_parameter_expression, $.type)), optional(','))), ']')
      ),

    _default_type_tuple: ($) =>
      prec.dynamic(
        1,
        seq(
          '(',
          alias($._type_parameter_expression, $.type),
          ',',
          optional(seq(commaSep1(alias($._type_parameter_expression, $.type)), optional(','))),
          ')'
        )
      ),

    _default_splat_type: ($) => seq('*', choice($.primary_expression, prec.dynamic(1, alias($._default_type, $.type)))),

    argument_list: ($) =>
      seq(
        '(',
        optional(
          commaSep1(
            choice(
              $.expression,
              alias($._list_splat_argument, $.list_splat),
              alias($._dictionary_splat_argument, $.dictionary_splat),
              $.keyword_argument
            )
          )
        ),
        optional(','),
        ')'
      ),

    _list_splat_argument: ($) => seq('*', $._expression_without_named_expression),

    _dictionary_splat_argument: ($) => seq('**', $._expression_without_named_expression),

    decorated_definition: ($) =>
      seq(repeat1($.decorator), field('definition', choice($.class_definition, $.function_definition))),

    decorator: ($) => seq('@', $.expression, sym('_newline')),

    _suite: ($) =>
      choice(alias($._simple_statements, $.block), seq(sym('_indent'), $.block), alias(sym('_newline'), $.block)),

    block: ($) => seq(repeat($._statement), sym('_dedent')),

    expression_list: ($) =>
      prec.dynamic(1, prec.right(seq(choice($.expression, $.list_splat), ',', optional($._collection_elements)))),

    dotted_name: ($) => prec(1, sep1($.identifier, '.')),

    case_pattern: ($) => prec(1, choice(alias($._as_pattern, $.as_pattern), $.keyword_pattern, $._simple_pattern)),

    _simple_pattern: ($) =>
      prec(
        1,
        choice(
          $.class_pattern,
          $.splat_pattern,
          $.union_pattern,
          alias($._list_pattern, $.list_pattern),
          alias($._tuple_pattern, $.tuple_pattern),
          $.dict_pattern,
          $.string,
          $.concatenated_string,
          $.true,
          $.false,
          $.none,
          seq(optional('-'), choice($.integer, $.float)),
          $.complex_pattern,
          $.dotted_name,
          '_'
        )
      ),

    _as_pattern: ($) => seq($.case_pattern, 'as', field('alias', $.identifier)),

    union_pattern: ($) => prec.right(seq($._simple_pattern, repeat1(prec.left(seq('|', $._simple_pattern))))),

    _list_pattern: ($) => seq('[', optional(seq(commaSep1($.case_pattern), optional(','))), ']'),

    _tuple_pattern: ($) => seq('(', optional(seq(commaSep1($.case_pattern), optional(','))), ')'),

    dict_pattern: ($) =>
      seq('{', optional(seq(commaSep1(choice($._key_value_pattern, $.splat_pattern)), optional(','))), '}'),

    _key_value_pattern: ($) => seq(field('key', $._simple_pattern), ':', field('value', $.case_pattern)),

    keyword_pattern: ($) => seq($.identifier, '=', $._simple_pattern),

    splat_pattern: ($) => prec(1, seq(choice('*', '**'), choice($.identifier, '_'))),

    class_pattern: ($) => seq($.dotted_name, '(', optional(seq(commaSep1($.case_pattern), optional(','))), ')'),

    complex_pattern: ($) =>
      prec(1, seq(optional('-'), choice($.integer, $.float), choice('+', '-'), choice($.integer, $.float))),

    _parameters: ($) => seq(commaSep1($.parameter), optional(',')),

    _patterns: ($) => seq(commaSep1($.pattern), optional(',')),

    parameter: ($) =>
      choice(
        $.identifier,
        $.typed_parameter,
        $.default_parameter,
        $.typed_default_parameter,
        $.list_splat_pattern,
        $.tuple_pattern,
        $.keyword_separator,
        $.positional_separator,
        $.dictionary_splat_pattern
      ),

    pattern: ($) =>
      choice(
        $.identifier,
        $.keyword_identifier,
        $.subscript,
        $.attribute,
        $.list_splat_pattern,
        $.tuple_pattern,
        $.list_pattern
      ),

    tuple_pattern: ($) => seq('(', optional($._patterns), ')'),

    list_pattern: ($) => seq('[', optional($._patterns), ']'),

    default_parameter: ($) =>
      seq(field('name', choice($.identifier, $.tuple_pattern)), '=', field('value', $.expression)),

    typed_default_parameter: ($) =>
      prec(
        PREC.typed_parameter,
        seq(field('name', $.identifier), ':', field('type', $.type), '=', field('value', $.expression))
      ),

    list_splat_pattern: ($) => seq('*', choice($.identifier, $.keyword_identifier, $.subscript, $.attribute)),

    dictionary_splat_pattern: ($) => seq('**', choice($.identifier, $.keyword_identifier, $.subscript, $.attribute)),

    as_pattern: ($) =>
      prec.left(seq($.expression, 'as', field('alias', alias($.expression, sym('as_pattern_target'))))),

    _expression_within_for_in_clause: ($) => choice($.expression, alias($.lambda_within_for_in_clause, $.lambda)),

    expression: ($) => choice($._expression_without_named_expression, $.named_expression),

    _expression_without_named_expression: ($) =>
      choice(
        $.comparison_operator,
        $.not_operator,
        $.boolean_operator,
        $.lambda,
        $.primary_expression,
        $.conditional_expression
      ),

    primary_expression: ($) =>
      choice(
        $.await,
        $.binary_operator,
        $.identifier,
        $.keyword_identifier,
        $.string,
        $.concatenated_string,
        $.integer,
        $.float,
        $.true,
        $.false,
        $.none,
        $.unary_operator,
        $.attribute,
        $.subscript,
        $.call,
        $.list,
        $.list_comprehension,
        $.dictionary,
        $.dictionary_comprehension,
        $.set,
        $.set_comprehension,
        $.tuple,
        $.parenthesized_expression,
        $.generator_expression,
        $.ellipsis
      ),

    not_operator: ($) => prec(PREC.not, seq('not', field('argument', $._expression_without_named_expression))),

    boolean_operator: ($) =>
      choice(
        prec.left(
          PREC.and,
          seq(
            field('left', $._expression_without_named_expression),
            field('operator', 'and'),
            field('right', $._expression_without_named_expression)
          )
        ),
        prec.left(
          PREC.or,
          seq(
            field('left', $._expression_without_named_expression),
            field('operator', 'or'),
            field('right', $._expression_without_named_expression)
          )
        )
      ),

    binary_operator: ($) => {
      /** @type {[import('@willbooster/web-tree-sitter/dsl').DSL['prec']['left' | 'right'], string, number][]} */
      const table = [
        [prec.left, '+', PREC.plus],
        [prec.left, '-', PREC.plus],
        [prec.left, '*', PREC.times],
        [prec.left, '@', PREC.times],
        [prec.left, '/', PREC.times],
        [prec.left, '%', PREC.times],
        [prec.left, '//', PREC.times],
        [prec.right, '**', PREC.power],
        [prec.left, '|', PREC.bitwise_or],
        [prec.left, '&', PREC.bitwise_and],
        [prec.left, '^', PREC.xor],
        [prec.left, '<<', PREC.shift],
        [prec.left, '>>', PREC.shift],
      ];

      return choice(
        ...table.map(([fn, operator, precedence]) =>
          fn(
            precedence,
            seq(field('left', $.primary_expression), field('operator', operator), field('right', $.primary_expression))
          )
        )
      );
    },

    unary_operator: ($) =>
      prec(PREC.unary, seq(field('operator', choice('+', '-', '~')), field('argument', $.primary_expression))),

    _not_in: () => seq('not', 'in'),

    _is_not: () => seq('is', 'not'),

    comparison_operator: ($) =>
      prec.left(
        PREC.compare,
        seq(
          field('operands', $.primary_expression),
          repeat1(
            seq(
              field(
                'operators',
                choice(
                  '<',
                  '<=',
                  '==',
                  '!=',
                  '>=',
                  '>',
                  '<>',
                  'in',
                  alias($._not_in, 'not in'),
                  'is',
                  alias($._is_not, 'is not')
                )
              ),
              field('operands', $.primary_expression)
            )
          )
        )
      ),

    lambda: ($) =>
      prec(
        PREC.lambda,
        seq(
          'lambda',
          field('parameters', optional($.lambda_parameters)),
          ':',
          field('body', $._expression_without_named_expression)
        )
      ),

    lambda_within_for_in_clause: ($) =>
      seq(
        'lambda',
        field('parameters', optional($.lambda_parameters)),
        ':',
        field('body', $._expression_within_for_in_clause)
      ),

    assignment: ($) =>
      seq(
        field('left', $._left_hand_side),
        choice(
          seq('=', field('right', $._right_hand_side)),
          seq(':', field('type', $.type)),
          seq(':', field('type', $.type), '=', field('right', $._right_hand_side))
        )
      ),

    augmented_assignment: ($) =>
      seq(
        field('left', $._left_hand_side),
        field('operator', choice('+=', '-=', '*=', '/=', '@=', '//=', '%=', '**=', '>>=', '<<=', '&=', '^=', '|=')),
        field('right', $._right_hand_side)
      ),

    _left_hand_side: ($) => choice($.pattern, $.pattern_list),

    pattern_list: ($) => seq($.pattern, choice(',', seq(repeat1(seq(',', $.pattern)), optional(',')))),

    _right_hand_side: ($) => choice($.expression, $.expression_list, $.assignment, $.augmented_assignment, $.yield),

    yield: ($) => prec.right(seq('yield', choice(seq('from', $.expression), optional($._expressions)))),

    attribute: ($) =>
      prec(PREC.call, seq(field('object', $.primary_expression), '.', field('attribute', $.identifier))),

    subscript: ($) =>
      prec(
        PREC.call,
        seq(
          field('value', $.primary_expression),
          '[',
          commaSep1(field('subscript', choice($.expression, alias($._list_splat_argument, $.list_splat), $.slice))),
          optional(','),
          ']'
        )
      ),

    slice: ($) => seq(optional($.expression), ':', optional($.expression), optional(seq(':', optional($.expression)))),

    ellipsis: () => '...',

    call: ($) =>
      prec(
        PREC.call,
        seq(
          field('function', $.primary_expression),
          field('arguments', choice($.generator_expression, $.argument_list))
        )
      ),

    typed_parameter: ($) =>
      prec(
        PREC.typed_parameter,
        choice(
          seq(field('name', choice($.identifier, $.dictionary_splat_pattern)), ':', field('type', $.type)),
          seq(
            field('name', $.list_splat_pattern),
            ':',
            field('type', choice($.type, alias($._default_splat_type, $.splat_type)))
          )
        )
      ),

    type: ($) => $._type_parameter_expression,
    splat_type: ($) => prec(1, seq(choice('*', '**'), $.identifier)),
    _constrained_type_expression: ($) => $.constrained_type,
    constrained_type: ($) => prec.right(seq($.type, ':', $.type)),

    keyword_argument: ($) =>
      seq(field('name', choice($.identifier, $.keyword_identifier)), '=', field('value', $.expression)),

    list: ($) => seq('[', optional($._collection_elements), ']'),

    set: ($) => seq('{', $._collection_elements, '}'),

    tuple: ($) =>
      seq('(', optional(seq(choice($.expression, $.list_splat), ',', optional($._collection_elements))), ')'),

    dictionary: ($) => seq('{', optional(commaSep1(choice($.pair, $.dictionary_splat))), optional(','), '}'),

    pair: ($) => seq(field('key', $.expression), ':', field('value', $.expression)),

    list_comprehension: ($) =>
      seq('[', field('body', choice($.expression, $.list_splat)), $._comprehension_clauses, ']'),

    dictionary_comprehension: ($) =>
      seq(
        '{',
        field('body', choice($.pair, alias($._dictionary_splat_argument, $.dictionary_splat))),
        $._comprehension_clauses,
        '}'
      ),

    set_comprehension: ($) =>
      seq('{', field('body', choice($.expression, $.list_splat)), $._comprehension_clauses, '}'),

    generator_expression: ($) =>
      seq(
        '(',
        field('body', choice($.expression, alias($._list_splat_argument, $.list_splat))),
        $._comprehension_clauses,
        ')'
      ),

    _comprehension_clauses: ($) => seq($.for_in_clause, repeat(choice($.for_in_clause, $.if_clause))),

    parenthesized_expression: ($) => prec(PREC.parenthesized_expression, seq('(', choice($.expression, $.yield), ')')),

    _collection_elements: ($) => seq(commaSep1(choice($.expression, $.list_splat)), optional(',')),

    for_in_clause: ($) =>
      prec.left(
        seq(
          optional('async'),
          'for',
          field('left', $._left_hand_side),
          'in',
          field('right', commaSep1($._expression_within_for_in_clause)),
          optional(',')
        )
      ),

    if_clause: ($) => seq('if', $.expression),

    conditional_expression: ($) =>
      prec.right(
        PREC.conditional,
        seq(
          $._expression_without_named_expression,
          'if',
          $._expression_without_named_expression,
          'else',
          $._expression_without_named_expression
        )
      ),

    concatenated_string: ($) => seq($.string, repeat1($.string)),

    string: ($) => seq(sym('string_start'), repeat(choice($.interpolation, $.string_content)), sym('string_end')),

    string_content: ($) =>
      prec.right(
        repeat1(choice(sym('escape_interpolation'), $.escape_sequence, $._not_escape_sequence, sym('_string_content')))
      ),

    interpolation: ($) =>
      seq(
        '{',
        field('expression', $._f_expression),
        optional('='),
        optional(field('type_conversion', $.type_conversion)),
        optional(field('format_specifier', $.format_specifier)),
        '}'
      ),

    _f_expression: ($) => choice($.expression, $.expression_list, $.yield),

    escape_sequence: () =>
      token.immediate(
        prec(
          1,
          seq(
            '\\',
            choice(
              /u[a-fA-F\d]{4}/,
              /U[a-fA-F\d]{8}/,
              /x[a-fA-F\d]{2}/,
              /\d{1,3}/,
              /\r?\n/,
              /['"abfrntv\\]/,
              /N\{[^}]+\}/
            )
          )
        )
      ),

    _not_escape_sequence: () => token.immediate('\\'),

    format_specifier: ($) =>
      seq(
        token(prec(1, ':')),
        repeat(choice(sym('_format_specifier_content'), alias($.interpolation, sym('format_expression'))))
      ),

    type_conversion: () => /![a-z]/,

    integer: () =>
      token(
        choice(
          seq(choice('0x', '0X'), repeat1(/_?[A-Fa-f0-9]+/), optional(/[Ll]/)),
          seq(choice('0o', '0O'), repeat1(/_?[0-7]+/), optional(/[Ll]/)),
          seq(choice('0b', '0B'), repeat1(/_?[0-1]+/), optional(/[Ll]/)),
          seq(repeat1(/[0-9]+_?/), choice(optional(/[Ll]/), optional(/[jJ]/)))
        )
      ),

    float: () => {
      const digits = repeat1(/[0-9]+_?/);
      // oxlint-disable-next-line no-useless-escape -- The pattern stays as upstream wrote it, so that src/grammar.json stays identical to upstream's.
      const exponent = seq(/[eE][\+-]?/, digits);

      return token(
        seq(
          choice(
            seq(digits, '.', optional(digits), optional(exponent)),
            seq(optional(digits), '.', digits, optional(exponent)),
            seq(digits, exponent)
          ),
          optional(/[jJ]/)
        )
      );
    },

    // @ts-expect-error -- tree-sitter's regex engine takes Unicode property escapes without the `u` flag, which would be recorded in src/grammar.json.
    identifier: () => /[_\p{XID_Start}][_\p{XID_Continue}]*/,

    keyword_identifier: ($) =>
      choice(
        prec(-3, alias(choice('print', 'exec', 'async', 'await'), $.identifier)),
        alias(choice('type', 'match', 'lazy'), $.identifier)
      ),

    true: () => 'True',
    false: () => 'False',
    none: () => 'None',

    await: ($) => prec(PREC.unary, seq('await', $.primary_expression)),

    comment: () => token(seq('#', /.*/)),

    line_continuation: () => token(seq('\\', choice(seq(optional('\r'), '\n'), '\0'))),

    positional_separator: () => '/',
    keyword_separator: () => '*',
  },
});

// Keeps upstream's `PREC` export for grammars that extend this one. `Object.assign` adds the property without declaring
// a second export, which the type checker rejects next to the export assignment above.
// oxlint-disable-next-line unicorn/prefer-module -- This package is CommonJS, so tree-sitter loads grammar.js as CommonJS.
Object.assign(module.exports, { PREC });

/**
 * @param {import('@willbooster/web-tree-sitter/dsl').RuleOrLiteral} rule
 *
 * @returns {import('@willbooster/web-tree-sitter/dsl').SeqRule}
 */
function commaSep1(rule) {
  return sep1(rule, ',');
}

/**
 * @param {import('@willbooster/web-tree-sitter/dsl').RuleOrLiteral} rule
 *
 * @param {import('@willbooster/web-tree-sitter/dsl').RuleOrLiteral} separator
 *
 * @returns {import('@willbooster/web-tree-sitter/dsl').SeqRule}
 */
function sep1(rule, separator) {
  return seq(rule, repeat(seq(separator, rule)));
}
