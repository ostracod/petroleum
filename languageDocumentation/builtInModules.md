
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

Symbolizes a file system error. When the file system module throws an error, the `#ERROR_TYPE` field stores `#FILE_SYSTEM_ERROR`.

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

Returns the content of the file at `$path`.

```
READ_DIR($path)
```

Returns the list of entity names in the directory at `$path`.

```
WRITE_FILE($path, $str)
```

Writes `$str` into the file at `$path`. If the file does not exist, this function creates a new file.

```
ADD_DIR($path)
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

Returns the name of the file system entity at `$path`. This corresponds to the final part of `$path`.

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


