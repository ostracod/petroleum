
## Workers and Phases

The following are considered to be "workers":

* Expressions
* Invocation statements
* Expression sequence components
* Statement sequence components

Workers have "methods", which are functions that determine the behavior of the worker. The `#PREP` method determines how a worker validates its own structure and data types. The `#EVAL` method determines how the worker will evaluate itself.

Each worker exists in one of two "phases". Initially, every worker begins in "prep-phase". When the `#PREP` method is invoked on a worker, the worker will enter "work-phase". The `#EVAL` method may only be called on a worker when the worker is in work-phase. Note that the `#PREP` method only runs once per worker.

The list below describes the behavior of `#PREP` and `#WORK` methods in each type of worker:

* In integer and string expressions:
    * The `#PREP` method does nothing.
    * The `#EVAL` method returns the integer or string value.
* In identifier expressions:
    * The `#PREP` method determines which variable matches the identifier.
    * The `#EVAL` method returns the value of the variable.
* In invocation expressions and statements:
    * The `#PREP` method determines the invocable which will be invoked.
        * If the first component is an identifier component, the invocable is the value of the variable which matches the identifier.
        * If the first component is an expression sequence component, the invocable is the value returned by the expression.
    * If the invocable is a function:
        * The `#PREP` method validates that the correct number of arguments are passed to the function.
        * The `#EVAL` method evaluates the function argument expressions and calls the function.
    * If the invocable is a procedure:
        * The `#PREP` method of the invocation node calls the `#PREP` method of the procedure.
        * The `#EVAL` method of the invocation node calls the `#EVAL` method of the procedure.
* In expression sequence components:
    * The `#PREP` method of the component calls the `#PREP` method of each expression.
    * The `#EVAL` method of the component calls the `#EVAL` method of each expression, and returns a list of values returned by the expressions.
* In statement sequence components:
    * The `#PREP` method of the component calls the `#PREP` method of each statement.
    * The `#EVAL` method of the component creates a new frame and calls the `#EVAL` method of each statement.

The behavior of `#PREP` and `#WORK` methods have the following noteworthy implications:

* The invocable of an invocation expression or statement must be known during prep-phase.
* Each procedure can define its own custom prep-phase behavior.
* Expression and statement sequence components only enter work-phase after all child nodes enter work-phase.

The `#PREP` method of a procedure is responsible for invoking the `#PREP` method on the following workers:

* Direct child worker components of the invocation node
* Workers in block attributes of direct child statement sequence components


