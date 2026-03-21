
## Data Types

Petroleum has the following built-in data types:

* **Null**
    * Null represents a missing value.
* **Integer**
    * Each integer is signed and contains 64 bits.
* **Symbol**
    * Every instantiation of symbol is guaranteed to be unique.
    * Symbols are useful to avoid naming collisions.
* **String**
    * A string is an immutable sequence of bytes.
    * Each byte is interpreted as an ASCII character.
* **List**
    * A list is a mutable sequence of values.
    * Each element may have any type.
* **Map**
    * A map is a mutable set of key-value pairs.
    * Each key and value may have any type.
* **Function**
    * A function accepts argument values and returns a value.
    * Functions can hold closures over variables in parent scopes.
* **Evaluation state**
    * An evaluation state is captured when code throws an exception.
    * Evaluation states allow resuming evaluation and printing stack traces.

Other types of data are represented using combinations of the types above. See the section on representation schemas for details.

Note that lists and maps are passed by reference, so a copy is not created when passing these values.

## Syntax

Petroleum code consists of "nodes". Each node is either a "statement", "expression", or "attribute". A node "sequence" consists of nodes separated by commas or newlines. The top level of each code file is a statement sequence. Every node is comprised of "components" which may be separated from each other by spaces. The following types of components are available:

* **Integer component**
    * An integer component consists of a single integer literal.
* **String component**
    * A string component consists of text enclosed by quotation marks.
    * The text may contain the following escape sequences:
        * `\"` = Quotation mark
        * `\n` = Newline
        * `\t` = Tab
        * `\\` = Backslash
* **Identifier component**
    * An identifier component consists of identifier characters, which may be the following:
        * Uppercase and lowercase letters
        * Decimal digits
        * Any of these symbols: ``_.?!:;'`+-*/%=<>~&|^#$``
    * The first character of an identifier cannot be a decimal digit.
* **Declaration component**
    * A declaration component consists of an at sign (`@`) followed by an identifier.
    * For example: `@myVar` is a declaration component with the identifier `myVar`.
* **Statement sequence component**
    * A statement sequence component consists of a statement sequence enclosed by curly braces (`{` and `}`).
    * For example: `{PRINT("Hello"), PRINT("World")}` is a statement sequence component.
* **Expression sequence component**
    * An expression sequence component consists of an expression sequence enclosed by parentheses (`(` and `)`).
    * For example: `(10, 20, 30)` is an expression sequence component.
* **Attribute sequence component**
    * An attribute sequence component consists of an attribute sequence enclosed by square brackets (`[` and `]`).
    * For example: `[EXCEP @myExcep]` is an attribute sequence component.

Each expression may have one of the following forms:

* **Integer expression**
    * An integer expression consists of a single integer component.
* **String expression**
    * A string expression consists of a single string component.
* **Identifier expression**
    * An identifier expression consists of a single identifier component.
* **Invocation expression**
    * An invocation expression consists of an identifier component or expression sequence component followed by one or more additional components.
    * The first component determines the invocable which will be invoked.
        * When the first component is an expression sequence component, the component must contain exactly one expression.
    * If the invocable is a function, the first component is followed by an expression sequence component which specifies the function arguments.
        * No additional components may follow the arguments.
    * For example: `ADD(1, 2)` and `(ADD)(1, 2)` both invoke the `ADD` function with the arguments 1 and 2.

Each statement may have one of the following forms:

* **Invocation statement**
    * An invocation statement consists of an identifier component or expression sequence component followed by zero or more additional components.
    * The first component determines the invocable which will be invoked.
        * When the first component is an expression sequence component, the component must contain exactly one expression.
    * If the invocable is a function, the first component may be followed by an expression sequence component which specifies the function arguments.
        * No additional components may follow the arguments.
    * For example: `ADD_ELEM(myList, 10)` and `(ADD_ELEM)(myList, 10)` both invoke the `ADD_ELEM` function with the arguments `myList` and 10.
* **Block attributes statement**
    * A block attributes statement consists of a single attribute sequence component.
        * Attributes in this attribute sequence component are "block attributes".
    * A block attributes statement can only appear as the first statement in a statement sequence.
    * For example: In the statement sequence component `{[ARGS @args], RET (123)}`, `[ARGS @args]` is a block attributes statement.

The available forms of an attribute depend on the parent expression or statement of the attribute. Valid attribute forms are documented on a per-invocable basis.

Note that placeholders in this documentation begin a dollar sign (`$`), but the dollar sign is not otherwise syntactically significant. For example: When `ADD($int1, $int2)` appears in this documentation, `$int1` and `$int2` are placeholders for actual expressions.


