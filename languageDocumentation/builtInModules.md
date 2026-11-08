
## Built-In Modules

This section describes all built-in modules in Petroleum.

### File System Module

The specifier of the file system module is `#FILE_SYSTEM`. This module exports the following variables:

```
#FILE
#DIR
```

Symbolizes a file or a directory. The file system `TYPE` function returns these symbols.

```
#FILE_SYSTEM_ERROR
```

Symbolizes a file system error, such as a missing file or inadequate permission. In some errors thrown by the file system module, the `#ERROR_TYPE` field stores `#FILE_SYSTEM_ERROR`.

```
EXISTS($path)
```

Returns whether a file system entity exists at `$path`.

```
TYPE($path)
```

Returns the type of file system entity at `$path`. This function returns `#FILE` or `#DIR`.

```
READ_FILE($path)
```

Returns the content of the file at `$path` as a string.

```
READ_DIR($path)
```

Returns the list of entity names in the directory at `$path`.

```
WRITE_FILE($path, $str)
```

Writes `$str` into a file at `$path`. If the file exists, this function replaces the old contents of the file. If the file does not exist, this function creates a new file.

```
NEW_DIR($path)
```

Creates a new empty directory at `$path`. Throws an error if an entity already exists at `$path`.

```
DEL_FILE($path)
```

Deletes the file at `$path`. Throws an error if the file does not exist.

```
DEL_DIR($path)
```

Deletes the directory at `$path` and its contents. Throws an error if the directory does not exist.

```
PATH_NAME($path)
```

Returns the name of the file system entity at `$path`. Note that if `$path` is `.`, a parent directory of `.`, or the root directory, this function returns `$path` normalized. 

```
PATH_PARENT($path)
```

Returns the parent directory path of `$path`. If no parent directory exists, this function returns null.

```
JOIN_PATHS($paths)
```

Returns a path created by joining the path segments in `$paths`. `$paths` is a list of strings.

```
NORM_PATH($path)
```

Returns a normalized version of `$path` where `.` and `..` segments are resolved.

```
IS_ABS_PATH($path)
```

Returns whether `$path` is an absolute path. Absolute paths begin at the root directory of the file system.

```
ABS_PATH($path)
```

Returns a version of `$path` which is a normalized absolute path. If `$path` is a relative path, this function considers `$path` to be relative to the current working directory.

```
REL_PATH($refPath, $targetPath)
```

Returns the path of `$targetPath` relative to `$refPath`.

### JSON Module

The specifier of the JSON module is `#JSON`. This module exports the following variables:

```
PARSE($text)
```

Parses JSON `$text`, and returns a representation of the JSON using Petroleum data types. Values are converted according to these rules:

* JSON strings become Petroleum strings.
* JSON numbers become Petroleum integers.
    * If the JSON number is not a whole number, `PARSE` throws an error.
* JSON booleans become Petroleum integers equal to 0 or 1.
* JSON arrays become Petroleum lists.
* JSON objects become Petroleum maps.
* JSON null becomes Petroleum null.

```
STR($value, $indentation?)
```

Converts `$value` to JSON text. If `$indentation` is included, the JSON will be indented with the given number of spaces. Values are converted according to these rules:

* Petroleum strings become JSON strings.
* Petroleum integers become JSON numbers.
* Petroleum lists become JSON arrays.
* Petroleum maps become JSON objects.
    * If any map key is not a string, `STR` throws an error.
* Petroleum null becomes JSON null.
* For all other Petroleum data types, `STR` throws an error.


