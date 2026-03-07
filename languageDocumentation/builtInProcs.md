
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
RUN {$body}
```

Evaluates `$body` and returns the value returned by `$body`.

```
FUNC {[ARGS $args], $body}
```

Creates a function with `$body`. `$args` may have one of the following forms:

* `[$argAttrs]`
    * `$argAttrs` is a sequence of attributes each having the form `@$arg`. `$arg` is a work-var.
    * The number of arguments passed to the function must be the number of attributes in `$argAttrs`.
* `@$argList`
    * `$argList` is a work-var containing a list of values.
    * The function may be passed any number of arguments.

If `[ARGS @$args]` is excluded, the function does not accept any arguments.

```
PREP_VAR @$name = ($value)
```

Initializes prep-var `$name` with `$value`. `$value` is determined during prep-phase.

```
WORK_VAR @$name = ($value)
```

Declares work-var `$name`. If `= ($value)` is included, the procedure assigns `$value` to the variable.

```
PREP_SYMBOL @$name
```

Initializes prep-var `$name` with a new symbol whose display name is `$name`.

```
GET ($module) $name
```

Returns the value of variable `$name` in `$module`.

```
SET ($module) $name = ($value)
```

Assigns `$value` to work-var `$name` in `$module`. If `($module)` is excluded, the variable is in the current module.

```
IMPORT ($specifier) AS @$moduleName [VARS [$vars]]
```

Imports a built-in module or a module in the current package according to `$specifier`. `$specifier` is either a built-in module symbol or a path relative to the current package root. If `AS @$moduleName` is included, the procedure stores the module in prep-var `$moduleName`. If `[VARS [$vars]]` is included, each attribute in `$vars` may have one of the following forms:

* `@$varName`
    * Imports `$varName` from the external module, exposing the variable as `$varName` in the current module.
* `$externVarName AS @$internVarName`
    * Imports `$externVarName` from the external module, exposing the variable as `$internVarName` in the current module.

If `$specifier` is a path to a missing file, the procedure will pause until the file is created.

```
IMPORT_PACK ($specifier) AS @$moduleName [VARS [$vars]]
```

Imports the main module of package `$specifier` in the package store. The version of imported package depends on `petroleumPackage.json` in the current package. This procedure otherwise works in the same way as `IMPORT`.

```
IF ($condition1) {$body1} ELSE_IF ($condition2) {$body2} ELSE {$body3}
```

If `$condition1` is true, `$body1` is evaluated. Otherwise if `$condition2` is true, `$body2` is evaluated. If both conditions are false, `$body3` is evaluated. `ELSE_IF ($condition2)` may be excluded or repeated any number of times. `ELSE {$body3}` may be excluded.

```
WHILE ($condition) {$body}
```

Repeats evaluation of `$body` until `$condition` is false.

```
BREAK
```

Throws a break exception, causing the parent `WHILE` procedure to stop.

```
CONT
```

Throws a continue exception, causing the parent `WHILE` procedure to skip to the next iteration.

```
RET ($value, $level)
```

Throws a return exception with `$value` and `$level`. If `$level` is excluded, the level will be 0. If `($value, $level)` is excluded, the return value will be null. See the section on exception schema for details.

```
SCHED {$body}
```

Schedules `$body` to be evaluated in a new coroutine at a later time. The current coroutine will continue to run.

```
PASS ($symbol, $message)
```

Throws a pass exception which pauses the current coroutine. Petroleum will resume the coroutine at a later time. See the section on coroutines for details.

```
AWAIT ($bunch, $loc, $condition, $message)
```

Pauses the current coroutine until a member exists in `$bunch` at `$loc` which satisifes `$condition`. `$bunch` is a list or a map. `$loc` is a list index or field key. `$condition` is a function which accepts the member as an argument and returns a boolean. Petroleum checks the condition upon invocation of this procedure and whenever the member in `$bunch` at `$loc` changes. If the condition is initially true, this procedure will not pause the coroutine. This procedure pauses the coroutine by throwing an await exception.

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
COMMENT "$text"
```

Specifies a comment in the code. This procedure has no effect on behavior of the application.


