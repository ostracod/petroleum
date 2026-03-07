
## Example Code

The example below declares a function which determines whether the argument number is prime:

```
PREP_VAR @isPrime = (FUNC {
    [ARGS [@inputNum]]
    WORK_VAR @factor = (2)
    WHILE (LESS(factor, inputNum)) {
        IF (EQUAL(0, MOD(inputNum, factor))) {
            RET (FALSE)
        }
        SET factor = (ADD(factor, 1))
    }
    RET (TRUE)
})

COMMENT "Prints whether the numbers 2 to 100 are prime."
WORK_VAR @num = (2)
WHILE (LESS_EQUAL(num, 100)) {
    WORK_VAR @predicate
    IF (isPrime(num)) {
        SET predicate = (" is prime!\n")
    } ELSE {
        SET predicate = (" is not prime.\n")
    }
    WORK_VAR @textList = (LIST (STR(num), predicate)))
    PRINT(CONCAT(textList))
    SET num = (ADD(num, 1))
}
```

The example below demonstrates usage of lists:

```
WORK_VAR @myList = (LIST (10, 20, 30))
COMMENT "Prints 20."
PRINT(MEMBER(myList, 1))
SET_MEMBER(myList, 1, 21)
TRUNC(myList, 2)
COMMENT "Prints LIST (10, 21)."
PRINT(myList)
ADD_ELEM(myList, 40)
COMMENT "Prints LIST (21, 40)."
PRINT(SLICE(myList, 1, 3))
```

The example below demonstrates usage of maps:

```
PREP_SYMBOL @#name
WORK_VAR @myMap = (MAP [FIELDS [
    (#name) = ("Bob")
    ("age") = (54)
]])
SET_MEMBER(myMap, "age", 55)
COMMENT "Prints 55."
PRINT(MEMBER(myMap, "age"))
SET_MEMBER(myMap, "score", 100)
DEL_FIELD(myMap, "age")
COMMENT "Prints LIST (#name, \"score\")".
PRINT(KEYS(myMap))
COMMENT "Prints 0."
PRINT(HAS_KEY(myMap, "age"))
COMMENT "Prints 1."
PRINT(HAS_KEY(myMap, #name))
```

The example below demonstrates usage of error exceptions:

```
TRY {
    PRINT("About to throw an error!")
    ABORT(#VALUE_ERROR, "Bad value")
    PRINT("This statement is not reached.")
} CATCH {
    [EXCEP @excep]
    COMMENT "Prints #ERROR_EXCEP."
    PRINT(MEMBER(excep, #EXCEP_TYPE))
    COMMENT "Prints #VALUE_ERROR."
    PRINT(MEMBER(excep, #ERROR_TYPE))
    COMMENT "Prints \"Bad value\"."
    PRINT(MEMBER(excep, #MESSAGE))
}
```

The example below demonstrates usage of return exceptions:

```
PREP_VAR @myReturn = (FUNC {
    THROW (MAP [FIELDS [
        (#EXCEP_TYPE) = (#RET_EXCEP)
        (#VALUE) = (123)
        (#RET_LEVEL) = (1)
    ]])
})
PREP_VAR @myFunc = (FUNC {
    PRINT("About to return a value!")
    myReturn()
    PRINT("This statement is not reached.")
})
COMMENT "Prints 123."
PRINT(myFunc())
```

The example below demonstrates usage of coroutines:

```
WORK_VAR @myMap = (MAP [FIELDS []])
WORK_VAR @myList = (LIST ())
SCHED {
    COMMENT "This statement sequence runs in a new coroutine."
    ADD_ELEM(myList, 10)
    PASS (SYMBOL("#myPass1"), "First pass")
    ADD_ELEM(myList, 11)
    SET_MEMBER(myMap, "flag", TRUE)
    PASS (SYMBOL("#myPass2"), "Second pass")
    ADD_ELEM(myList, 12)
    COMMENT "Prints LIST (20, 10, 11, 21, 12)."
    PRINT(myList)
}
ADD_ELEM(myList, 20)
AWAIT (
    myMap, "flag",
    FUNC {
        [ARGS [@member]]
        RET (EQUAL(member, TRUE))
    },
    "Waiting for flag to be set"
)
COMMENT "Evaluation only reaches this statement when the"
COMMENT "\"flag\" field in `myMap` is set to TRUE."
ADD_ELEM(myList, 21)
```

The example below demonstrates usage of evaluation state:

```
PREP_SYMBOL @#myExcep
WORK_VAR @myList = (LIST ())
TRY {
    ADD_ELEM(myList, 30)
    THROW (MAP [FIELDS [
        (#EXCEP_TYPE) = (#myExcep)
    ]])
    ADD_ELEM(myList, 31)
} CATCH {
    [EXCEP @excep]
    IF (EQUAL(MEMBER(excep, #EXCEP_TYPE), #myExcep)) {
        ADD_ELEM(myList, 40)
        RESUME (MEMBER(excep, #EVAL_STATE))
        PRINT("This statement is not reached.")
    } ELSE {
        THROW (excep)
    }
}
COMMENT "Prints LIST (30, 40, 31)."
PRINT(myList)
```

The example below demonstrates usage of imports:

```
IMPORT (#FILE_SYSTEM) AS @fileSystem [
    VARS [@PATH_NAME, PATH_PARENT AS @pathParent]
]
PREP_VAR @path = "/abc/def"
COMMENT "Prints \"def\"."
PRINT(PATH_NAME(path))
COMMENT "Prints \"/abc\"."
PRINT(pathParent(path))
COMMENT "Prints 1."
PRINT((GET (fileSystem) IS_ABS_PATH)(path))
```

The example below defines a custom procedure:

```
PREP_SYMBOL @#expr
PREP_SYMBOL @#attrInt
PREP_SYMBOL @#stmtsComp

PREP_VAR @repeatMethods = (MAP [FIELDS [
    (#PREP) = (FUNC {
        [ARGS [@worker]]
        
        WORK_VAR @comps = (MEMBER(worker, #COMPS))
        IF (NOT_EQUAL(LEN(comps), 4)) {
            ABORT(#SYNTAX_ERROR, "`repeat` must be followed by exactly three components.")
        }
        
        WORK_VAR @exprsComp = (MEMBER(comps, 1))
        WORK_VAR @attrsComp = (MEMBER(comps, 2))
        WORK_VAR @stmtsComp = (MEMBER(comps, 3))
        IF (NOT_EQUAL(MEMBER(exprsComp, #COMP_TYPE), #EXPRS_COMP)) {
            ABORT(#SYNTAX_ERROR, "First component after `repeat` must be expressions component.")
        }
        IF (NOT_EQUAL(MEMBER(attrsComp, #COMP_TYPE), #ATTRS_COMP)) {
            ABORT(#SYNTAX_ERROR, "Second component after `repeat` must be attributes component.")
        }
        IF (NOT_EQUAL(MEMBER(stmtsComp, #COMP_TYPE), #STMTS_COMP)) {
            ABORT(#SYNTAX_ERROR, "Third component after `repeat` must be statements component.")
        }
        
        COMMENT "Procedures are responsible for calling the #PREP method"
        COMMENT "on direct child worker components."
        CALL_METHOD(exprsComp, #PREP)
        CALL_METHOD(stmtsComp, #PREP)
        
        WORK_VAR @exprs = (MEMBER(exprsComp, #EXPRS))
        WORK_VAR @attrs = (MEMBER(attrsComp, #ATTRS))
        IF (NOT_EQUAL(LEN(exprs), 1)) {
            ABORT(#SYNTAX_ERROR, "`repeat` expects exactly one expression.")
        }
        IF (NOT_EQUAL(LEN(attrs), 1)) {
            ABORT(#SYNTAX_ERROR, "`repeat` expects exactly one attribute.")
        }
        
        WORK_VAR @expr = (MEMBER(exprs, 0))
        WORK_VAR @attr = (MEMBER(attrs, 0))
        WORK_VAR @attrComps = (MEMBER(attr, #COMPS))
        IF (NOT_EQUAL(LEN(attrComps), 1)) {
            ABORT(#SYNTAX_ERROR, "`repeat` attribute must contain exactly one component.")
        }
        
        WORK_VAR @attrComp = (MEMBER(attrComps, 0))
        IF (NOT_EQUAL(MEMBER(attrComp, #COMP_TYPE), #INT_COMP)) {
            ABORT(#SYNTAX_ERROR, "`repeat` attribute must contain an integer component.")
        }
        WORK_VAR @attrInt = (MEMBER(attrComp, #INT))
        
        COMMENT "Stash values to use in the #EVAL method."
        SET_MEMBER(worker, #expr, expr)
        SET_MEMBER(worker, #attrInt, attrInt)
        SET_MEMBER(worker, #stmtsComp, stmtsComp)
    })
    (#EVAL) = (FUNC {
        [ARGS [@worker, @frame]]
        WORK_VAR @expr = (MEMBER(worker, #expr))
        WORK_VAR @attrInt = (MEMBER(worker, #attrInt))
        WORK_VAR @stmtsComp = (MEMBER(worker, #stmtsComp))
        
        WORK_VAR @exprInt = (CALL_METHOD(expr, #EVAL, LIST (frame)))
        WORK_VAR @count = (ADD(attrInt, exprInt))
        WHILE (GREATER(count, 0)) {
            CALL_METHOD(stmtsComp, #EVAL, LIST (frame))
            SET count = (SUB(count, 1))
        }
    })
]])

PREP_VAR @repeat = (MAP [FIELDS [
    (#IS_PROC) = (TRUE)
    (#METHODS) = (repeatMethods)
]])

WORK_VAR @sum = (0)
repeat (ADD(1, 2)) [5] {
    SET sum = (ADD(sum, 1))
}
COMMENT "Prints 8."
PRINT(sum)

COMMENT "This statement will throw a syntax error during prep-phase."
repeat [7]
```

The example below defines a custom method:

```
PREP_SYMBOL @#isEven
PREP_SYMBOL @#var
PREP_SYMBOL @#expr
PREP_SYMBOL @#expr1
PREP_SYMBOL @#expr2

COMMENT "Define #isEven method for integer expressions."
SET_MEMBER(INT_EXPR_METHODS, #isEven, FUNC {
    [ARGS [@worker]]
    WORK_VAR @value = (MEMBER(worker, #INT))
    RET (EQUAL(MOD(value, 2), 0))
})

COMMENT "Define #isEven method for identifier expressions."
SET_MEMBER(IDENT_EXPR_METHODS, #isEven, FUNC {
    [ARGS [@worker]]
    COMMENT "The #VAR field only stores a variable after the worker finishes prep-phase."
    CALL_METHOD(worker, #PREP)
    WORK_VAR @var = (MEMBER(worker, #VAR))
    COMMENT "We may need to wait until the variable procedure"
    COMMENT "sets the #isEven field on the variable."
    AWAIT (
        var, #isEven,
        FUNC {[ARGS [@member]], RET (TRUE)}
        CONCAT(LIST (
            "Waiting for #isEven to be set on ", MEMBER(var, #IDENT)
        ))
    )
    RET (MEMBER(var, #isEven))
})

COMMENT "The `evenIntVar` and `oddIntVar` procedures work in mostly the same way,"
COMMENT "so we will define a function to create their methods."
PREP_VAR @varMethods = (FUNC {
    [ARGS [@isEven]]
    RET (MAP [FIELDS [
        (#PREP) = (FUNC {
            [ARGS [@worker]]
            WORK_VAR @comps = (MEMBER(worker, #COMPS))
            
            COMMENT "Set up the variable as a work-var with a custom #isEven field."
            WORK_VAR @declComp = (MEMBER(comps, 1))
            WORK_VAR @var = (MEMBER(declComp, #VAR)
            SET_MEMBER(var, #VAR_TYPE, #WORK_VAR)
            SET_MEMBER(var, #isEven, isEven)
            
            COMMENT "Call the #PREP method on the expressions component."
            WORK_VAR @exprsComp = (MEMBER(comps, 2))
            CALL_METHOD(exprsComp, #PREP)
            
            COMMENT "Validate whether the expression returns an even or odd integer."
            WORK_VAR @expr = (MEMBER(MEMBER(exprsComp, #EXPRS)), 0)
            WORK_VAR @exprIsEven = (CALL_METHOD(expr, #isEven))
            IF (NOT_EQUAL(isEven, exprIsEven)) {
                ABORT(#TYPE_ERROR, "Invalid integer type!")
            }
            
            COMMENT "Stash values to use in the #EVAL method."
            SET_MEMBER(worker, #var, var)
            SET_MEMBER(worker, #expr, expr)
        })
        (#EVAL) = (FUNC {
            [ARGS [@worker, @frame]]
            WORK_VAR @var = (MEMBER(worker, #var))
            WORK_VAR @expr = (MEMBER(worker, #expr))
            
            COMMENT "Set the value of the frame entry."
            WORK_VAR @value = (CALL_METHOD(expr, #EVAL, LIST (frame)))
            WORK_VAR @ident = (MEMBER(var, #IDENT))
            WORK_VAR @frameEntry = (MEMBER(MEMBER(frame, #FRAME_ENTRIES), ident))
            SET_MEMBER(frameEntry, #VALUE, value)
        })
    ]])
})

COMMENT "Define custom procedures to declare even and odd integer variables."
PREP_VAR @evenIntVar = (MAP [FIELDS [
    (#IS_PROC) = (TRUE)
    (#METHODS) = (varMethods(TRUE))
]])
PREP_VAR @oddIntVar = (MAP [FIELDS [
    (#IS_PROC) = (TRUE)
    (#METHODS) = (varMethods(FALSE))
]])

COMMENT "Define a custom procedure to add integers."
PREP_VAR @addInts = (MAP [FIELDS [
    (#IS_PROC) = (TRUE)
    (#METHODS) = (MAP [FIELDS [
        (#PREP) = (FUNC {
            [ARGS [@worker]]
            
            COMMENT "Call the #PREP method on the expressions component."
            WORK_VAR @comps = (MEMBER(worker, #COMPS))
            WORK_VAR @exprsComp = (MEMBER(comps, 1))
            CALL_METHOD(exprsComp, #PREP)
            
            COMMENT "Stash expressions to use in #EVAL and #isEven methods."
            WORK_VAR @exprs = (MEMBER(exprsComp, #EXPRS))
            SET_MEMBER(worker, #expr1, MEMBER(exprs, 0))
            SET_MEMBER(worker, #expr2, MEMBER(exprs, 1))
        })
        (#EVAL) = (FUNC {
            [ARGS [@worker, @frame]]
            WORK_VAR @expr1 = (MEMBER(worker, #expr1))
            WORK_VAR @expr2 = (MEMBER(worker, #expr2))
            
            COMMENT "Calculate the sum of the two expressions."
            WORK_VAR @value1 = (CALL_METHOD(expr1, #EVAL, LIST (frame)))
            WORK_VAR @value2 = (CALL_METHOD(expr2, #EVAL, LIST (frame)))
            RET (ADD(value1, value2))
        })
        (#isEven) = (FUNC {
            [ARGS [@worker]]
            WORK_VAR @expr1 = (MEMBER(worker, #expr1))
            WORK_VAR @expr2 = (MEMBER(worker, #expr2))
            
            COMMENT "Determine whether the sum of the two expressions is even."
            WORK_VAR @isEven1 = (CALL_METHOD(expr1, #isEven))
            WORK_VAR @isEven2 = (CALL_METHOD(expr2, #isEven))
            RET (EQUAL(isEven1, isEven2))
        })
    ]])
]])

COMMENT "Example invocations of the procedures."
COMMENT "Note that even/odd compatibility is checked during prep-phase."
evenIntVar @myEvenInt (10)
oddIntVar @myOddInt (13)
oddIntVar @myResult (addInts(myEvenInt, myOddInt))
COMMENT("Prints 23.")
PRINT(myResult)
```


