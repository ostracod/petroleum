
## Built-In Procedures

This section describes all built-in procedures in Petroleum.

```
LIST ($elems)
```

Creates a list containing `$elems`. `$elems` is an expression sequence.

```
MAP [FIELDS [$fields]]
```

Creates a map containing `$fields`. Each attribute in `$fields` has the form `($key) = ($value)`.

```
PREP <$value>
```

Returns `$value`, which is determined during prep-phase. This procedure stores the value in a `#VALUE` field of the `PREP` node so that the value will be accessible during work-phase.

```
RUN {$body}
```

Evaluates `$body` and returns the value returned by `$body`. Note that this procedure handles return exceptions in the same manner as function invocations.

```
FUNC {[ARGS $args], $body}
```

Creates a function with `$body`. `$args` may have one of the following forms:

* `[$argAttrs]`
    * Each attribute in `$argAttrs` may have one of the following forms:
        * `@$arg` is a required argument.
        * `@$arg = ($defaultValue)` is an optional argument.
    * In both cases, `$arg` is a work-var.
    * All optional arguments must be after required arguments.
* `@$argList`
    * `$argList` is a work-var containing a list of values.
    * The function may be passed any number of arguments.

If `[ARGS $args]` is excluded, the function does not accept any arguments.

The `#PREP` method of the `FUNC` procedure calls the `#ACCESSED_VARS` method on the child statement sequence component. The `#ACCESSED_VARS` method returns a variable map which determines the contents of closures. The `FUNC` procedure stores the variable map in an `#ACCESSED_VARS` field of the invocation node so that the variable map will be accessible during work-phase.

```
PREP_VAR @$name = <$value>
```

Initializes prep-var `$name` with `$value`.

```
WORK_VAR @$name = ($value)
```

Declares work-var `$name`. If `= ($value)` is included, the procedure assigns `$value` to the variable.

```
PREP_SYMBOL @$name
```

Initializes prep-var `$name` with a new symbol whose display name is `$name`.

```
PREP_FUNC @$name {[ARGS $args], $body}
```

Initializes prep-var `$name` with a function having the given body. `[ARGS $args]` works the same way as in the `FUNC` procedure. The function will be stored in the prep-var before the body finishes prep-phase, which allows the function to be recursive. If the function is invoked while the body is in prep-phase, the caller will pause until the body finishes prep-phase.

```
GET <$module> $name
```

Returns the value of variable `$name` in `$module`. The `#PREP` method of this procedure stores the source variable in a `#SRC_VAR` field of the `GET` expression. The `#EVAL` method of this procedure accesses the `#SRC_VAR` field.

```
SET <$module> $name = ($value)
```

Assigns `$value` to work-var `$name` in `$module`. The `#PREP` method of this procedure stores the destination variable in a `#DEST_VAR` field of the `SET` statement. The `#EVAL` method of this procedure accesses the `#DEST_VAR` field. If `<$module>` is excluded, the variable is visible in the current scope.

```
INC $name BY ($int)
DEC $name BY ($int)
```

Increases or decreases the value of work-var `$name` by `$int`. If `BY ($int)` is excluded, the offset is 1. The `#PREP` method of these procedures stores the variable in a `#VAR` field of the invocation statement. The `#EVAL` method of these procedures accesses the `#VAR` field.

```
IMPORT <$specifier> AS @$moduleName [VARS [$vars]]
```

Imports a built-in module or a module in the current package according to `$specifier`. `$specifier` is either a built-in module symbol or a path relative to the current package root. If `AS @$moduleName` is included, the procedure stores the module in prep-var `$moduleName`. If `[VARS [$vars]]` is included, each attribute in `$vars` may have one of the following forms:

* `@$varName`
    * Imports `$varName` from the external module, exposing the variable as `$varName` in the current module.
* `$externVarName AS @$internVarName`
    * Imports `$externVarName` from the external module, exposing the variable as `$internVarName` in the current module.

If `$specifier` is a path to a missing module, the procedure will pause until the module is created.

```
IMPORT_PACK <$specifier> AS @$moduleName [VARS [$vars]]
```

Imports the main module of package `$specifier` in the package store. The version of the imported package depends on `petroleumPackage.json` in the current package. This procedure otherwise works in the same way as `IMPORT`.

```
IF ($condition1) {$body1} ELSE_IF ($condition2) {$body2} ELSE {$body3}
```

If `$condition1` is true, `$body1` is evaluated. Otherwise if `$condition2` is true, `$body2` is evaluated. If all conditions are false, `$body3` is evaluated. `ELSE_IF ($condition2)` may be excluded or repeated any number of times. `ELSE {$body3}` may be excluded.

```
WHILE ($condition) {$body}
```

Repeats evaluation of `$body` until `$condition` is false.

```
ITER ($bunch) {[LOC @$loc, MEMBER @$member], $body}
```

Iterates over `$bunch`, evaluating `$body` for each member. `$loc` and `$member` are both work-vars. `$bunch` may have one of the following types:

* If `$bunch` is a string:
    * `$loc` is an index in the string.
    * `$member` is the character code at the index.
* If `$bunch` is a list:
    * `$loc` is an index in the list.
    * `$member` is the value at the index.
* If `$bunch` is a map:
    * `$loc` is a field key.
    * `$member` is the field value.

`LOC @$loc` and `MEMBER @$member` are both optional.

```
BREAK
```

Throws a break exception, causing the parent `WHILE` or `ITER` procedure to stop.

```
CONT
```

Throws a continue exception, causing the parent `WHILE` or `ITER` procedure to skip to the next iteration.

```
RET ($value, $level?)
```

Throws a return exception with `$value` and `$level`. If `$level` is excluded, the level will be 0. If `($value, $level)` is excluded, the return value will be null. See the section on exception schemas for details.

```
SCHED {$body}
```

Schedules `$body` to be evaluated in a new coroutine at a later time. The current coroutine will continue to run.

```
SPIN ($condition, $message)
```

Invokes `$condition`. `$condition` is a function which accepts no arguments and returns a boolean. If `$condition` returns false, this procedure throws a spin exception containing `$condition` and `$message`. This effectively pauses the coroutine until `$condition` returns true. See the section on coroutines for details.

```
AWAIT ($bunch, $loc, $condition, $message)
```

Invokes `$condition` with the member of `$bunch` at `$loc` as the argument. `$bunch` is a list or a map. `$loc` is a list index or field key. `$condition` is a function which accepts a single argument and returns a boolean. If `$condition` returns false or no such member exists, this procedure throws an await exception containing `$bunch`, `$loc`, `$condition`, and `$message`. This effectively pauses the coroutine until the member of `$bunch` at `$loc` satisfies `$condition`. See the section on coroutines for details. This procedure returns the member of `$bunch` at `$loc`.

```
ABORT ($errorType, $message)
```

Throws an error exception with `$errorType` and `$message`.

```
THROW ($excep)
```

Throws `$excep`. If an `#EVAL_STATE` field does not exist in `$excep`, this procedure populates the field with the current evaluation state.

```
TRY {$body1} CATCH {[EXCEP @$excep], $body2}
```

Evaluates `$body1`. If `$body1` throws an exception, `$body2` will be evaluated. If `[EXCEP @$excep]` is included, this procedure stores the thrown exception in work-var `$excep`.

```
RESUME ($evalState)
```

Resumes `$evalState`. The evaluation state of the current coroutine becomes `$evalState`. Control flow will not proceed to any statements which are after this procedure.

```
IN_ENTRY_PACK ()
```

Returns whether the current module is in the entry package of the running application. The entry package is specified by the first argument of the Petroleum interpreter.

```
LOAD_MODULE ($specifier)
```

Returns a built-in module or a module in the current package according to `$specifier`. `$specifier` is either a built-in module symbol or a path relative to the current package root.

```
LOAD_PACK ($specifier)
```

Returns the main module of package `$specifier` in the package store. The version of the imported package depends on `petroleumPackage.json` in the current package.

```
VIRT_MODULE ($specifier, $content)
```

Creates and returns a virtual module which can be accessed using the `IMPORT` and `LOAD_MODULE` procedures. `$specifier` is a path relative to the current package root. `$content` is a string containing Petroleum code. `VIRT_MODULE` throws an error if a module has already been loaded at `$specifier`.

```
COMMENT "$text"
```

Specifies a comment in the code. This procedure has no effect on behavior of the application.


