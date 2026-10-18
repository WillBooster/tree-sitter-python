; Identifier naming conventions

(identifier) @variable

((identifier) @constructor
 (#match? @constructor "^[A-Z]"))

((identifier) @constant
 (#match? @constant "^[0-9_]*[A-Z][A-Z_0-9]*$"))

; Function calls

(decorator) @function
(decorator
  (identifier) @function)

(call
  function: (attribute attribute: (identifier) @function.method))
(call
  function: (identifier) @function)

; Builtin functions

((call
  function: (identifier) @function.builtin)
 (#match?
   @function.builtin
   "^(abs|all|any|ascii|bin|bool|breakpoint|bytearray|bytes|callable|chr|classmethod|compile|complex|delattr|dict|dir|divmod|enumerate|eval|exec|filter|float|format|frozenset|getattr|globals|hasattr|hash|help|hex|id|input|int|isinstance|issubclass|iter|len|list|locals|map|max|memoryview|min|next|object|oct|open|ord|pow|print|property|range|repr|reversed|round|set|setattr|slice|sorted|staticmethod|str|sum|super|tuple|type|vars|zip|__import__)$"))

; Function definitions

(function_definition
  name: (identifier) @function)

; Later patterns override naming heuristics in syntactically known class positions.

((class_definition
  name: (identifier) @constructor)
 (#match? @constructor "^[0-9_]*[A-Z][A-Z_0-9]*$"))

((class_definition
  superclasses: (argument_list (identifier) @constructor))
 (#match? @constructor "^[0-9_]*[A-Z][A-Z_0-9]*$"))

((class_definition
  superclasses: (argument_list (subscript value: (identifier) @constructor)))
 (#match? @constructor "^[0-9_]*[A-Z][A-Z_0-9]*$"))

((except_clause value: [
  (identifier) @constructor
  (tuple (identifier) @constructor)
  (parenthesized_expression (identifier) @constructor)
  (as_pattern [
    (identifier) @constructor
    (tuple (identifier) @constructor)
    (parenthesized_expression (identifier) @constructor)
  ])
])
 (#match? @constructor "^[0-9_]*[A-Z][A-Z_0-9]*$"))

((class_pattern (dotted_name (identifier) @constructor .))
 (#match? @constructor "^[0-9_]*[A-Z][A-Z_0-9]*$"))

(attribute attribute: (identifier) @property)
(type (identifier) @type)
(splat_type (identifier) @type)

; Literals

[
  (none)
  (true)
  (false)
] @constant.builtin

[
  (integer)
  (float)
] @number

(comment) @comment
(string) @string
(escape_sequence) @escape

(interpolation
  "{" @punctuation.special
  "}" @punctuation.special) @embedded

[
  "-"
  "-="
  "!="
  "*"
  "**"
  "**="
  "*="
  "/"
  "//"
  "//="
  "/="
  "&"
  "&="
  "%"
  "%="
  "^"
  "^="
  "+"
  "->"
  "+="
  "<"
  "<<"
  "<<="
  "<="
  "<>"
  "="
  ":="
  "=="
  ">"
  ">="
  ">>"
  ">>="
  "|"
  "|="
  "~"
  "@="
  "and"
  "in"
  "is"
  "not"
  "or"
  "is not"
  "not in"
] @operator

[
  "as"
  "assert"
  "async"
  "await"
  "break"
  "class"
  "continue"
  "def"
  "del"
  "elif"
  "else"
  "except"
  "exec"
  "finally"
  "for"
  "from"
  "global"
  "if"
  "import"
  "lambda"
  "nonlocal"
  "pass"
  "print"
  "raise"
  "return"
  "try"
  "while"
  "with"
  "yield"
  "match"
  "case"
] @keyword
