
## Built-In Constants

Built-in constants are defined as prep-vars in the parent scope of every module scope. By convention, built-in constant identifiers are in all-caps. Some basic constants include the following:

* `NULL` is the null value.
* `TRUE` is equal to 1.
* `FALSE` is equal to 0.
* `CMD_LINE_ARGS` is the list of argument strings passed when running the Petroleum application.

Methods for every type of worker are defined in the following constants:

* `INT_EXPR_METHODS` is the map of methods for integer expressions.
* `STR_EXPR_METHODS` is the map of methods for string expressions.
* `IDENT_EXPR_METHODS` is the map of methods for identifier expressions.
* `FUNC_INVOC_METHODS` is the map of methods for function invocation statements and expressions.
* `STMTS_COMP_METHODS` is the map of methods for statement sequence components.
* `EXPR_COMP_METHODS` is the map of methods for expression sequence components.

The user can add their own methods to the maps above if desired. However, it may be dangerous to modify existing methods in these maps.

By convention, built-in symbol identifiers begin with a number sign (`#`). Note that the number sign is not syntactically significant. The `TYPE` function returns the following symbols:

* `#NULL` symbolizes null.
* `#INT` symbolizes an integer.
* `#SYMBOL` symbolizes a symbol.
* `#STR` symbolizes a string.
* `#LIST` symbolizes a list.
* `#MAP` symbolizes a map.
* `#FUNC` symbolizes a function.
* `#EVAL_STATE` symbolizes an evaluation state.

Error types include the following symbols:

* `#SYNTAX_ERROR` symbolizes that code has invalid syntax.
* `#TYPE_ERROR` symbolizes that a value has an invalid type.
* `#VALUE_ERROR` symbolizes that a value is invalid, but has a valid type.
* `#STATE_ERROR` symbolizes that a resource is in an invalid state or missing.

Built-in method keys are symbols. Petroleum defines the following method keys as mentioned in the section about workers:

* `#PREP` symbolizes the preparation method.
* `#EVAL` symbolizes the evaluation method.
* `#ACCESSED_VARS` symbolizes the accessed variables method.

Built-in module specifiers are symbols. The following built-in module specifiers are available:

* `#FILE_SYSTEM` symbolizes the file system module.
* More symbols will be defined for future built-in modules.

Petroleum defines many symbols for keys and values in various data structures. See the section on representation schemas for details. Such symbols include:

* `#ATTR` symbolizes an attribute.
* `#ATTRS` symbolizes a list of attributes.
* `#ATTRS_COMP` symbolizes an attribute sequence component.
* `#AWAIT_EXCEP` symbolizes an await exception.
* `#BREAK_EXCEP` symbolizes a break exception.
* `#BUILT_IN_MODULE` symbolizes a built-in module.
* `#BUNCH` symbolizes a string, list, or map.
* `#COMP_TYPE` symbolizes the type of a component.
* `#COMPS` symbolizes a list of components.
* `#COND` symbolizes a condition.
* `#CONT_EXCEP` symbolizes a continue exception.
* `#DECL_COMP` symbolizes a declaration component.
* `#ERROR_EXCEP` symbolizes an error exception.
* `#ERROR_TYPE` symbolizes the type of an error.
* `#EXCEP_TYPE` symbolizes the type of an exception.
* `#EXPR` symbolizes an expression.
* `#EXPR_TYPE` symbolizes the type of an expression.
* `#EXPRS` symbolizes a list of expressions.
* `#EXPRS_COMP` symbolizes an expression sequence component.
* `#FILE_PATH` symbolizes a file path.
* `#FRAME` symbolizes a frame.
* `#FRAME_ENTRIES` symbolizes a map of frame entries.
* `#IDENT` symbolizes an identifier.
* `#IDENT_COMP` symbolizes an identifier component.
* `#IDENT_EXPR` symbolizes an identifier expression.
* `#IMPORT_VAR` symbolizes a variable imported from an external module.
* `#INT_COMP` symbolizes an integer component.
* `#INT_EXPR` symbolizes an integer expression.
* `#INVOC` symbolizes an invocable.
* `#INVOC_EXPR` symbolizes an invocation expression.
* `#INVOC_STMT` symbolizes an invocation statement.
* `#IS_FRAME` symbolizes whether a map is a frame.
* `#IS_FRAME_ENTRY` symbolizes whether a map is a frame entry.
* `#IS_PROC` symbolizes whether a map is a procedure.
* `#IS_SCOPE` symbolizes whether a map is a scope.
* `#LOC` symbolizes a string index, list index, or field key.
* `#MESSAGE` symbolizes a message.
* `#METHODS` symbolizes a map of methods.
* `#MODULE` symbolizes a module.
* `#MODULE_TYPE` symbolizes the type of a module.
* `#NODE_TYPE` symbolizes the type of a node.
* `#PARENT` symbolizes a parent.
* `#PASS_EXCEP` symbolizes a pass exception.
* `#PETROL_MODULE` symbolizes a module written in Petroleum code.
* `#PHASE` symbolizes a phase.
* `#PREP_PHASE` symbolizes prep-phase.
* `#PREP_VAR` symbolizes a prep-var.
* `#RET_EXCEP` symbolizes a return exception.
* `#RET_LEVEL` symbolizes the level of a return exception.
* `#SCOPE` symbolizes a scope.
* `#STMT` symbolizes a statement.
* `#STMT_TYPE` symbolizes the type of a statement.
* `#STMTS` symbolizes a list of statements.
* `#STMTS_COMP` symbolizes a statement sequence component.
* `#STR_COMP` symbolizes a string component.
* `#STR_EXPR` symbolizes a string expression.
* `#VALUE` symbolizes a value.
* `#VAR` symbolizes a variable.
* `#VAR_TYPE` symbolizes the type of a variable.
* `#VARS` symbolizes a map of variables.
* `#WORK_PHASE` symbolizes work-phase.
* `#WORK_VAR` symbolizes a work-var.

Note that all built-in invocables are also built-in constants, but they will described in later sections because this section is already long enough.


