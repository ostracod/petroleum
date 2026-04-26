
## Representation Schemas

Various types of data in Petroleum are represented as maps which conform to specific schemas. This section describes all of the representation schemas in Petroleum.

The user can add fields with their own keys to the map schemas if desired. Extra fields are useful to associate custom data with maps.  However, it may be dangerous to modify existing fields in map schemas. Avoid tampering with existing fields unless encouraged by documentation.

### Module Schema

Modules are represented as maps. All modules have the following fields:

* The `#MODULE_TYPE` field stores the type of the module. The type may be `#PETROL_MODULE` or `#BUILT_IN_MODULE`.
* The `#SCOPE` field stores the scope of the module.
* The `#FRAME` field stores the frame of the module.

Modules written in Petroleum code have the following fields:

* The `#MODULE_TYPE` field stores `#PETROL_MODULE`.
* The `#FILE_PATH` field stores the absolute file path of the module.
* The `#STMTS_COMP` field stores the top-level statement sequence component of the module.
    * Note that the start and end curly braces of the top-level statement sequence component are implicit.
* The `#SCOPE` field references the same scope as held by the top-level statement sequence component of the module.
* The `#FRAME` field is absent until the top-level statement sequence component enters work-phase.

Built-in modules have the following fields:

* The `#MODULE_TYPE` field stores `#BUILT_IN_MODULE`.
* The `#SYMBOL` field stores the symbol specifier used to import the module.
* Built-in modules also have `#SCOPE` and `#FRAME` fields which are common to all modules.

### Node Schema

Nodes are represented as maps. All nodes have the following fields:

* The `#NODE_TYPE` field stores the type of the node. The type may be `#STMT`, `#EXPR`, or `#ATTR`.
* The `#COMPS` field stores the list of components in the node.
* The `#PARENT` field stores the parent component.
* The `#LINE_NUM` field stores the line number in the parent Petroleum code file.
* The `#COL_NUM` field stores the column number in the parent Petroleum code file.

Attributes do not define any additional fields beyond the node fields. The `#NODE_TYPE` field in an attribute stores `#ATTR`.

### Statement Schema

Invocation statements have the following fields:

* The `#NODE_TYPE` field stores `#STMT`.
* The `#STMT_TYPE` field stores `#INVOC_STMT`.
* The `#INVOC` field stores the invocable.
    * This field stores null until the invocation statement finishes prep-phase.
* The `#PHASE` field stores the current phase, which may be `#PREP_PHASE` or `#WORK_PHASE`.
* Invocation statements also have `#COMPS`, `#PARENT`, `#LINE_NUM`, and `#COL_NUM` fields which are common to all nodes.

Note that block attributes statements are excluded from the `#STMTS` field of statement sequence components. Instead, block attributes are stored in the `#ATTRS` field of statement sequence components. As a result, block attributes statements have no exposed representation; only the block attributes are accessible.

### Expression Schema

All expressions have the following fields:

* The `#NODE_TYPE` field stores `#EXPR`.
* The `#EXPR_TYPE` field stores the type of the expression. The type may be `#INT_EXPR`, `#STR_EXPR`, `#IDENT_EXPR`, or `#INVOC_EXPR`.
* The `#PHASE` field stores the current phase, which may be `#PREP_PHASE` or `#WORK_PHASE`.
* Expressions also have `#COMPS`, `#PARENT`, `#LINE_NUM`, and `#COL_NUM` fields which are common to all nodes.

Integer expressions have the following fields:

* The `#EXPR_TYPE` field stores `#INT_EXPR`.
* The `#INT` field stores the integer value.
* Integer expressions also have `#NODE_TYPE`, `#COMPS`, `#PARENT`, `#PHASE`, `#LINE_NUM`, and `#COL_NUM` fields which are common to all expressions.

String expressions have the following fields:

* The `#EXPR_TYPE` field stores `#STR_EXPR`.
* The `#STR` field stores the string value.
* String expressions also have `#NODE_TYPE`, `#COMPS`, `#PARENT`, `#PHASE`, `#LINE_NUM`, and `#COL_NUM` fields which are common to all expressions.

Identifier expressions have the following fields:

* The `#EXPR_TYPE` field stores `#IDENT_EXPR`.
* The `#IDENT` field stores the identifier string.
* The `#VAR` field stores the variable which matches the identifier.
    * This field stores null until the identifier expression finishes prep-phase.
* Identifier expressions also have `#NODE_TYPE`, `#COMPS`, `#PARENT`, `#PHASE`, `#LINE_NUM`, and `#COL_NUM` fields which are common to all expressions.

Invocation expressions have the following fields:

* The `#EXPR_TYPE` field stores `#INVOC_EXPR`.
* The `#INVOC` field stores the invocable.
    * This field stores null until the invocation expression finishes prep-phase.
* Invocation expressions also have `#NODE_TYPE`, `#COMPS`, `#PARENT`, `#PHASE`, `#LINE_NUM`, and `#COL_NUM` fields which are common to all expressions.

### Component Schema

Components are represented as maps. All components have the following fields:

* The `#COMP_TYPE` field stores the type of the component. The type may be `#INT_COMP`, `#STR_COMP`, `#IDENT_COMP`, `#DECL_COMP`, `#ATTRS_COMP`, `#EXPRS_COMP`, or `#STMTS_COMP`.
* The `#PARENT` field stores the parent node or module.
* The `#LINE_NUM` field stores the line number in the parent Petroleum code file.
* The `#COL_NUM` field stores the column number in the parent Petroleum code file.

Integer components have the following fields:

* The `#COMP_TYPE` field stores `#INT_COMP`.
* The `#INT` field stores the integer value.
* The `#PARENT` field stores the parent node.
* Integer components also have `#LINE_NUM` and `#COL_NUM` fields which are common to all components.

String components have the following fields:

* The `#COMP_TYPE` field stores `#STR_COMP`.
* The `#STR` field stores the string value.
* The `#PARENT` field stores the parent node.
* String components also have `#LINE_NUM` and `#COL_NUM` fields which are common to all components.

Identifier components have the following fields:

* The `#COMP_TYPE` field stores `#IDENT_COMP`.
* The `#IDENT` field stores the identifier string.
* The `#PARENT` field stores the parent node.
* Identifier components also have `#LINE_NUM` and `#COL_NUM` fields which are common to all components.

Declaration components have the following fields:

* The `#COMP_TYPE` field stores `#DECL_COMP`.
* The `#VAR` field stores the variable.
* The `#PARENT` field stores the parent node.
* Declaration components also have `#LINE_NUM` and `#COL_NUM` fields which are common to all components.

Attribute sequence components have the following fields:

* The `#COMP_TYPE` field stores `#ATTRS_COMP`.
* The `#ATTRS` field stores the list of attributes.
* The `#PARENT` field stores the parent node.
* Attribute sequence components also have `#LINE_NUM` and `#COL_NUM` fields which are common to all components.

Expression sequence components have the following fields:

* The `#COMP_TYPE` field stores `#EXPRS_COMP`.
* The `#EXPRS` field stores the list of expressions.
* The `#PHASE` field stores the current phase, which may be `#PREP_PHASE` or `#WORK_PHASE`.
* The `#PARENT` field stores the parent node.
* Expression sequence components also have `#LINE_NUM` and `#COL_NUM` fields which are common to all components.

Statement sequence components have the following fields:

* The `#COMP_TYPE` field stores `#STMTS_COMP`.
* The `#ATTRS` field stores the list of attributes in the block attributes statement of the statement sequence.
    * The `#PARENT` field of these attributes stores the statement sequence.
    * If the block attributes statement does not exist, the `#ATTRS` field stores an empty list.
* The `#STMTS` field stores the list of statements.
    * Note that this excludes block attributes statements.
* The `#SCOPE` field stores the scope.
* The `#PHASE` field stores the current phase, which may be `#PREP_PHASE` or `#WORK_PHASE`.
* The `#PARENT` field stores the parent node or module.
* Statement sequence components also have `#LINE_NUM` and `#COL_NUM` fields which are common to all components.

### Scope Schema

Scopes are represented as maps with the following fields:

* The `#IS_SCOPE` field stores `TRUE`.
* The `#VARS` field stores a map from identifier string to variable.
* The `#STMTS_COMP` field stores the parent statement sequence component.
    * This field will be absent if the scope does not belong to a statement sequence component.
* The `#MODULE` field stores the parent module.
    * This field will be absent if the scope does not belong to a module.
* The `#PARENT` field stores the parent scope.
    * This field will be absent if there is no parent scope.

### Variable Schema

Variables are represented as maps. All variables have the following fields:

* The `#VAR_TYPE` field stores the type of the variable. The type may be `#PREP_VAR`, `#WORK_VAR`, or `#IMPORT_VAR`.
    * This field stores null until assigned a value by the parent worker.
* The `#IDENT` field stores the identifier string of the variable as defined in the parent scope.
* The `#SCOPE` field stores the parent scope.

Prep-vars have the following fields:

* The `#VAR_TYPE` field stores `#PREP_VAR`.
* The `#VALUE` field stores the value of the prep-var.
    * This field is absent until assigned by the parent worker.
* Prep-vars also have `#IDENT` and `#SCOPE` fields which are common to all variables.

Work-vars do not define any additional fields beyond the common variable fields. The `#VAR_TYPE` field in a work-var stores `#WORK_VAR`.

Imported variables have the following fields:

* The `#VAR_TYPE` field stores `#IMPORT_VAR`.
* The `#IMPORT_VAR` field stores the variable as defined in the external module.
* The `#IDENT` field stores the identifier string of the variable in the current module.
* The `#SCOPE` field stores the parent scope in the current module.

Note that imported variables can be regarded as prep-vars or work-vars by following `#IMPORT_VAR` fields to the original variable definition.

### Frame Schema

Frames are represented as maps with the following fields:

* The `#IS_FRAME` field stores `TRUE`.
* The `#SCOPE` field stores the scope which contains corresponding variables.
* The `#FRAME_ENTRIES` field stores a map from work-var identifier string to frame entry.
* The `#PARENT` field stores the parent frame.
    * This field will be absent if there is no parent frame.

Frame entries are represented as maps with the following fields:

* The `#IS_FRAME_ENTRY` field stores `TRUE`.
* The `#VAR` field stores the work-var.
* The `#VALUE` field stores the value of the work-var.

A frame entry may be stored in multiple frames at a time. For example, a frame entry may be held by several function closures. As a result, frame entries do not have a `#FRAME` field to indicate a single parent frame.

### Invocable Schema

Invocables are either functions or procedures. Procedures are represented as maps with the following fields:

* The `#IS_PROC` field stores `TRUE`.
* The `#METHODS` field stores a map from method key to method.

### Method Schema

Methods are defined as functions. Petroleum recognizes methods with the following keys:

* The `#PREP` method prepares the parent worker for work-phase.
    * This method accepts the parent worker as an argument.
* The `#EVAL` method evaluates the parent worker.
    * This method accepts the following arguments:
        * The parent worker
        * The current frame or scope
    * When the parent statement sequence is in prep-phase, the second argument should be a scope. Otherwise, the argument should be a frame.
    * When the parent worker is an expression, the return value of the method is the return value of the expression.
* The `#ACCESSED_VARS` method returns the list of variables which the `#EVAL` method may access.
    * This method accepts the parent worker as an argument.
    * Function closures use this method to determine which frame entries to store.

The user may define methods with other keys if desired. The user is responsible for deciding when to invoke such methods.

### Exception Schema

Exceptions are represented as maps. All exceptions have the following fields:

* The `#EXCEP_TYPE` field stores the type of the exception. The type may be `#BREAK_EXCEP`, `#CONT_EXCEP`, `#RET_EXCEP`, `#PASS_EXCEP`, `#AWAIT_EXCEP`, or `#ERROR_EXCEP`.
    * The user may also define their own exception types.
* The `#EVAL_STATE` field stores the evaluation state from when the exception was first thrown.

Break exceptions and continue exceptions do not define any additional fields beyond the common exception fields. The `#EXCEP_TYPE` field stores `#BREAK_EXCEP` in a break exception, and `#CONT_EXCEP` in a continue exception.

Return exceptions have the following fields:

* The `#EXCEP_TYPE` field stores `#RET_EXCEP`.
* The `#VALUE` field stores the return value.
* The `#RET_LEVEL` field stores the level of the return exception.
    * When a function invocation receives a return exception whose level is 0, the function invocation will return the value stored in the `#VALUE` field.
    * Otherwise if the level is above 0, the function invocation will decrement the level and rethrow the exception.
* Return exceptions also have the `#EVAL_STATE` field which is common to all exceptions.

Pass exceptions have the following fields:

* The `#EXCEP_TYPE` field stores `#PASS_EXCEP`.
* The `#SYMBOL` field stores a symbol which represents the reason why the coroutine paused.
* The `#MESSAGE` field stores a human-readable string explaining why the coroutine paused.
* The `#EVAL_STATE` field stores the evaluation state which the scheduler will resume.

Await exceptions have the following fields:

* The `#EXCEP_TYPE` field stores `#AWAIT_EXCEP`.
* The `#BUNCH` field stores a list or a map.
* The `#LOC` field stores a list index or field key.
* The `#COND` field stores a function which determines the condition for resuming.
    * See the description of the `AWAIT` procedure for details.
* The `#MESSAGE` field stores a human-readable string explaining why the coroutine paused.
* The `#EVAL_STATE` field stores the evaluation state which the scheduler will resume.

Error exceptions have the following fields:

* The `#EXCEP_TYPE` field stores `#ERROR_EXCEP`.
* The `#ERROR_TYPE` field stores the type of the error. The type may be `#SYNTAX_ERROR`, `#TYPE_ERROR`, `#VALUE_ERROR`, or `#STATE_ERROR`.
    * The user may also define their own error types.
* The `#MESSAGE` field stores a human-readable string explaining the error.
* Error exceptions also have the `#EVAL_STATE` field which is common to all exceptions.


