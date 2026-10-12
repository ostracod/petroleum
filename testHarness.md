
# Petroleum Test Harness

The Petroleum interpreter can read test suite files, run test code, and validate test output. Test suite files have the file extension `.test-suite`. Each test suite contains one or more test cases.

## CLI Usage

The following CLI usages are available for running test suites:

```
node ./dist/petroleum.js --test <testSuitePath> <testCaseName?>
```

Runs the test suite at `<testSuitePath>`. If `<testCaseName>` is included, only the test case with the given name will be run. Otherwise, all tests cases in the suite will be run.

```
node ./dist/petroleum.js --test <dirPath>
```

Runs all test suites in `<dirPath>`.

## Test Suite Syntax

Each test suite consists of a sequence of test cases delimited by test case separators. Each test case separator is a line containing at least three equal signs (`=`) and no other characters. It is recommended to use more than three equal signs for visual clarity. For example:

```
$testCase1
=========================
$testCase2
=========================
$testCase3
```

Each test case consists of a sequence of directives. Each directive has this structure:

```
>>> $directiveName $args
$dataLines
```

`$args` and `$dataLines` are optional. Arguments in `$args` are separated by spaces. Each argument may be a string enclosed by quotation marks (`"`). Quotation marks in argument strings can be escaped with a backslash (`\`). In the example below, the arguments are `123` and `this is a "very" cool example`:

```
>>> dummyDirective 123 "This is a \"very\" cool example"
```

## Test File System

When running test suites, the interpreter uses a virtual file system instead of the actual file system on disk. This prevents test suites from messing up files on the host computer, and improves the speed of running tests. The following paths are available in each virtual file system:

* `~` is the home directory of the virtual user.
    * The absolute path of `~` is `/home/testUser`.
* `~/targetPackage` is the entry package which the test case will run.
    * This is also the current working directory of the Petroleum interpreter.
* `~/targetPackage/petroleumPackage.json` is a simple package file with no dependencies.
    * This package file specifies that `./main.petrol` is the entry module.
    * Test cases can overwrite this package file to test dependency packages.
* `~/petroleumPackages` is the package store, as described in the Petroleum documentation.

## Test Case Directives

The test harness recognizes the following directives:

```
>>> testCase $name
```

Declares the name of the test case. Every test case must contain this directive.

```
>>> setupFile $path
$fileContent
```

Creates a file at `$path` containing `$fileContent` before running the entry package. If any intermediate directories in `$path` are missing, this directory creates the directories.

```
>>> setupDir $path
```

Creates an empty directory at `$path` and any missing intermediate directories.

```
>>> appArgs $args
```

Passes `$args` as the command line arguments to the Petroleum application. The arguments will be available to the application in the global variable `CMD_LINE_ARGS`. If a test case does not contain the `appArgs` directive, no arguments will be passed to the application.

```
>>> expectPrint
$textLines
```

Validates that the application has printed `$textLines` using the `PRINT` function. If a test case does not contain the `expectPrint` directive, the test case expects that the application will not print any lines.

```
>>> expectExcep type: $type path: $path lineNumber: $lineNumber
```

Validates that the application has thrown an unhandled exception. `$type` is the type of exception, such as `#BREAK_EXCEP`. `$path` is the path of the module where the exception was thrown. `$lineNumber` is the line number where the exception was thrown. `type: $type`, `path: $path`, and `lineNumber: $lineNumber` are all optional.

```
>>> expectError type: $type message: $message path: $path lineNumber: $lineNumber
```

Validates that the application has thrown an unhandled error exception. `$type` is the type of error, such as `#TYPE_ERROR`. `$message` is the message of the error. `$path` is the path of the module where the error was thrown. `$lineNumber` is the line number where the error was thrown. `type: $type`, `message: $message`, `path: $path`, and `lineNumber: $lineNumber` are all optional.

```
>>> expectStuck message: $message path: $path lineNumber: $lineNumber
```

Validates that the application is stuck spinning or awaiting. `$message` is the message of the spin or await exception. `$path` is the path of the module which is stuck. `$lineNumber` is the line number which is stuck. `message: $message`, `path: $path`, and `lineNumber: $lineNumber` are all optional.

## Example Test Suites

The example below tests the `ADD` function and `ABORT` procedure using two test cases:

```
>>> testCase "ADD function"
>>> setupFile ~/targetPackage/main.petrol
PRINT(ADD(10, 20))
WORK_VAR @x = (MEMBER(CMD_LINE_ARGS, 0))
WORK_VAR @y = (MEMBER(CMD_LINE_ARGS, 1))
PRINT(ADD(x, y))
>>> appArgs 40 50
>>> expectPrint
30
90
=========================
>>> testCase "ABORT procedure"
>>> setupFile ~/targetPackage/main.petrol
PRINT("About to throw an error!")
ABORT (#STATE_ERROR, "I don't feel so good")
PRINT("This line is not reached")
>>> expectPrint
About to throw an error!
>>> expectError type: #STATE_ERROR message: "I don't feel so good" path: ~/targetPackage/main.petrol lineNumber: 2
```

The example below validates that the `AWAIT` procedure becomes stuck:

```
>>> testCase "Stuck awaiting"
>>> setupFile ~/targetPackage/main.petrol
WORK_VAR @myList = (LIST (10, 20, 30))
PRINT("About to become stuck!")
PREP_VAR @condition = <FUNC {
    [ARGS [@value]]
    RET (EQUAL(value, 11))
}>
AWAIT (myList, 0, condition, "Waiting for first member to become 11")
PRINT("This line is not reached")
>>> expectPrint
About to become stuck!
>>> expectStuck message: "Waiting for first member to become 11" lineNumber: 7
```

The example below tests the `IMPORT_PACK` procedure:

```
>>> testCase "IMPORT_PACK procedure"
>>> setUpFile ~/targetPackage/petroleumPackage.json
{
    "specifier": "ostracod.targetPackage",
    "version": "1.0.0",
    "mainModule": "./main.petrol",
    "petroleumVersion": "^1.0.0",
    "dependencies": [
        { "specifier": "ostracod.libUtils", "version": "^1.0.0" }
    ]
}
>>> setUpFile ~/targetPackage/main.petrol
IMPORT_PACK <"ostracod.libUtils"> [VARS [@libUtilsValue]]
PRINT(libUtilsValue)
>>> setUpFile ~/petroleumPackages/ostracod/libUtils/v1.0.0/petroleumPackage.json
{
    "specifier": "ostracod.libUtils",
    "version": "1.0.0",
    "mainModule": "./entryModule.petrol",
    "petroleumVersion": "^1.0.0",
    "dependencies": []
}
>>> setUpFile ~/petroleumPackages/ostracod/libUtils/v1.0.0/entryModule.petrol
PREP_VAR @libUtilsValue = <123>
>>> expectPrint
123
```


