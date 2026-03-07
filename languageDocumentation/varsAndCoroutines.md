
## Variables

A "variable" defines a location where a value may be stored. Each variable is identified by an identifier. Variables are only accessible by code in the "scope" where the variable was declared. Every statement sequence has a scope. When searching for a variable matching an identifier, Petroleum iterates through parent scopes until the identifier is found. This allows for "shadowing" where multiple variables in parent scopes have the same identifier, but only one variable is accessible.

Whenever a declaration component appears in a node, a variable is declared in the scope of the parent statement sequence. The identifier of the variable is the identifier in the declaration component.

The example below demonstrates variable declaration and visibility rules:

```
WORK_VAR @myVar1
COMMENT "Only `myVar1` is visible in the top-level scope."

RUN {
    WORK_VAR @myVar2
    COMMENT "`myVar1` and `myVar2` are visible in this scope."
    
    RUN {
        WORK_VAR @myVar1
        COMMENT "In this scope, `myVar1` no longer refers to"
        COMMENT "the variable defined at the top level."
    }
}
```

Every variable is either a "prep-var" or a "work-var". The value of a prep-var is assigned during prep-phase of the parent statement sequence. If code attempts to read a prep-var before the prep-var has a value, the prep-var will return a "deferred value" which references the prep-var. When code must know the deferred value for some operation (such as knowing an integer operand for addition), the code will behave in one of the following ways:

* If the prep-var has been initialized since the deferral, the code will "unwrap" the deferred value.
* If the prep-var has still not yet been initialized, the code will pause until the prep-var has been initialized.

The value of a work-var is assigned during evaluation of the parent statement sequence. Work-vars are inaccessible while the parent statement sequence is in prep-phase. A work-var stores null until the work-var is assigned a value. Work-var values are stored in "frames". Whenever a statement sequence is evaluated, Petroleum creates a new frame with an entry for each work-var. Note that prep-var values are stored in the scope of the parent statement sequence instead of a frame.

The example below demonstrates usage of prep-vars and work-vars:

```
COMMENT "`myVar1` is initialized after `myVar2`, because the value of"
COMMENT "`myVar2` must be known to compute the value of `myVar1`."
PREP_VAR @myVar1 = (ADD(myVar2, 1))
PREP_VAR @myVar2 = (5)

COMMENT "During initialization of `myVar3`, `myVar4` is accessible but"
COMMENT "returns null because `myVar4` hasn't been initialized yet."
WORK_VAR @myVar3 = (10)
WORK_VAR @myVar4 = (ADD(myVar3, 2))

COMMENT "This statement will throw an error, because work-vars"
COMMENT "are inaccessible during prep-phase.
PREP_VAR @myVar5 = (myVar3)

COMMENT "This statement will not throw an error."
WORK_VAR @myVar6 = (myVar1)
```

When a function is created, the function stores a "closure" over all visible work-vars which the function body may access. The closure holds a pruned copy of visible frames which only contain the necessary frame entries. When the function is invoked, the pruned frames becomes accessible to the function body. To determine which variables the body may access, the function invokes the `#ACCESSED_VARS` method on the body statements. The `#ACCESSED_VARS` method returns the list of variables which a worker may access when evaluated.

Note that a function may create a closure on top-level work-vars even when the top-level statement sequence is in prep-phase. This is possible because the pruned frames in the closure do not include the module frame. Instead, the closure holds a reference to the module which will acquire a frame during work-phase. However, during invocation the function body cannot access work-vars whose parent statement sequences are in prep-phase, including top-level work-vars.

The example below demonstrates function closures:

```
WORK_VAR @myVar1
RUN {
    WORK_VAR @myVar2
    
    COMMENT "`myFunc1` holds a closure on `myVar1` and `myVar2`."
    WORK_VAR @myFunc1 = (FUNC {
        PRINT(ADD(myVar1, myVar2))
    })
    
    COMMENT "`myFunc2` holds a closure on `myVar1`. Note that `myFunc2` can only"
    COMMENT "be called when the top-level statement sequence is in work-phase."
    COMMENT "Also note that `myFunc2` cannot hold a closure on `myVar2`."
    PREP_VAR @myFunc2 = (FUNC {
        PRINT(ADD(myVar1, 1))
    })
    
    SET myVar1 = (10)
    SET myVar2 = (20)
    COMMENT "Prints 30. Note that we must use `CALL`"
    COMMENT "here because `myFunc1` is a work-var."
    CALL(myFunc1)
    COMMENT "Prints 11."
    myFunc2()
}
```

## Coroutines

To achieve flexible order of prep-var initialization, Petroleum schedules code to run in "coroutines". Coroutines take turns running in the scheduler queue. A coroutine can "pause" to allow the next coroutine to run. Workers may progress through prep-phase in multiple coroutines, waiting for each other to initialize required prep-vars. Note that the order in which coroutines run is not guaranteed to be consistent.

If a coroutine throws particular types of exceptions to the scheduler, the scheduler will pause the coroutine. Such exceptions include the following:

* **Pass exception**
    * A pass exception stores a symbol which represents the reason why the coroutine paused.
    * The scheduler will resume the coroutine after some delay.
    * If the coroutine throws a pass exception with the same symbol many times, the scheduler may conclude that the coroutine has become stuck.
* **Await exception**
    * An await exception stores a condition function.
    * The scheduler will only resume the coroutine when the function returns true.
    * Using an await exception is more efficient than repetitive polling with pass exceptions.

When a coroutine throws an unexpected exception, Petroleum responds in one of the following ways:

* If the top-level statement sequence of any module is still in prep-phase:
    * Petroleum will wait until all coroutines have ended, then report all unexpected exceptions to the user.
    * Petroleum will not evaluate the top-level statement sequence of any module.
* Otherwise if all modules have finished prep-phase:
    * Petroleum will report the exception to the user and immediately terminate the application.


