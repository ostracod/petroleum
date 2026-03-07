
## Built-In Functions

This section describes all built-in functions in Petroleum.

```
NEG($int)
```

Returns the negation of `$int` (zero minus `$int`).

```
ADD($int1, $int2)
SUB($int1, $int2)
MUL($int1, $int2)
DIV($int1, $int2)
```

Returns the sum, difference, product, or quotient of `$int1` and `$int2`.

```
MOD($int1, $int2)
```

Returns the remainder when dividing `$int1` by `$int2`.

```
NOT($bool)
```

Returns logical NOT of `$bool`.

```
OR($bool1, $bool2)
AND($bool1, $bool2)
XOR($bool1, $bool2)
```

Returns logical OR, AND, or XOR of `$bool1` and `$bool2`.

```
BIT_NOT($int)
```

Returns bitwise NOT of `$int`.

```
BIT_OR($int1, $int2)
BIT_AND($int1, $int2)
BIT_XOR($int1, $int2)
```

Returns bitwise OR, AND, or XOR of `$int1` and `$int2`.

```
SHIFT_LEFT($int, $offset)
SHIFT_RIGHT($int, $offset)
```

Returns `$int` shifted left or right by `$offset` bits.

```
EQUAL($value1, $value2)
NOT_EQUAL($value1, $value2)
```

Returns whether `$value1` is equal to or not equal to `$value2`. Note that list and map equality is only checked by reference.

```
GREATER($int1, $int2)
LESS($int1, $int2)
GREATER_EQUAL($int1, $int2)
LESS_EQUAL($int1, $int2)
```

Returns whether `$int1` is greater than, less than, greater than or equal to, or less than or equal to `$int2`.

```
SYMBOL($name)
```

Creates a symbol whose display name is `$name`.

```
TYPE($value)
```

Returns a symbol representing the type of `$value`. See the section on built-in constants for the list of possible symbols.

```
LEN($bunch)
```

Returns the length of `$bunch`. `$bunch` may have one of the following types:

* If `$bunch` is a string:
    * The length is the number of characters.
* If `$bunch` is a list:
    * The length is the number of elements.
* If `$bunch` is a map:
    * The length is the number of fields.

```
TRUNC($list, $len)
```

Reduces the length of `$list` to be `$len` by removing elements at the end. `$len` must not be greater than the length of `$list`.

```
MEMBER($bunch, $loc)
```

Returns the member in `$bunch` at `$loc`. `$bunch` may have one of the following types:

* If `$bunch` is a string:
    * `$loc` is an index in the string.
    * The member is a character code.
* If `$bunch` is a list:
    * `$loc` is an index in the list.
    * The member is a list element.
* If `$bunch` is a map:
    * `$loc` is a field key.
    * The member is the field value.

```
SET_MEMBER($bunch, $loc, $member)
```

Sets the member in `$bunch` at `$loc` to be `$member`. `$bunch` may have one of the following types:

* If `$bunch` is a list:
    * `$loc` is an index.
    * The index must be less than the length of the list.
* If `$bunch` is a map:
    * `$loc` is a key.
    * If a field with the key does not exist, this function adds a new field.

```
ADD_ELEM($list, $elem)
```

Appends `$elem` to the end of `$list`.

```
DEL_FIELD($map, $key)
```

Removes the field with `$key` from `$map`. Throws an error if `$key` does not exist in `$map`.

```
SLICE($bunch, $startIndex, $endIndex)
```

Retrieves the portion of `$bunch` between `$startIndex` inclusive and `$endIndex` exclusive. `$bunch` may be a string or a list.

```
CONCAT($bunches)
```

Returns the elements in `$bunches` concatenated together. `$bunches` may be a list of strings or lists.

```
STR($value)
```

Returns a string representation of `$value`.

```
PARSE_INT($str)
```

Returns the integer value of `$str` interpreted in base 10.

```
CHAR($charCode)
```

Returns a string containing a single character whose character code is `$charCode`.

```
KEYS($map)
```

Returns a list of all keys in `$map`.

```
HAS_KEY($map, $key)
```

Returns whether a field with `$key` exists in `$map`.

```
CALL($func, $args)
```

Invokes `$func` with `$args`. `$args` is a list of values. If `$args` is excluded, no arguments are passed to `$func`. `CALL` must be used to invoke `$func` if `$func` is not known during prep-phase.

```
CALL_METHOD($worker, $methodKey, $args)
```

Invokes the method in `$worker` identified by `$methodKey`. `$args` is a list of values. The arguments passed to the method are `$args` prepended with `$worker`. If `$args` is excluded, the only argument passed to the method is `$worker`. `CALL_METHOD` has special behavior depending on `$methodKey`:

* If `$methodKey` is `#PREP`:
    * After invoking the method, `CALL_METHOD` will set the phase of `$worker` to be work-phase.
    * If `$worker` is already in work-phase, `CALL_METHOD` will not invoke the method.
* If `$methodKey` is `#EVAL`:
    * If `$worker` is in prep-phase, `CALL_METHOD` will first invoke the `#PREP` method and set the phase of `$worker` to be work-phase. Then `CALL_METHOD` will invoke the `#EVAL` method.

If `$worker` is a procedure invocation, `CALL_METHOD` looks up methods to call in the `#METHODS` field of the procedure.

```
CLONE_CODE($code)
```

Returns a copy of `$code`. `$code` may be a node or a component. This function deeply copies all nested nodes, components, scopes, and variables. The copy of `$code` will retain the same parent and will be in prep-phase. This function is useful for implementing macros and generic functions.

```
SCOPE($code)
```

Returns the scope of `$code`. `$code` may be a node or a component.

```
SEARCH_SCOPES($startScope, $name)
```

Searches through scopes for a prep-var with `$name` starting at `$startScope`. Returns a prep-var or null.

```
SEARCH_FRAMES($startFrame, $name)
```

Searches through frames for a variable with `$name` starting at `$startFrame`. Returns a frame entry, prep-var, or null.

```
PRINT($value)
```

Prints `$value` to standard output.


